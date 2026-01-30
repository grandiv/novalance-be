import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users, projects, applications, assignments, kpis, projectRoles } from '../db/schema';
import { eq, desc, count, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const usersRoute = new Hono();

// Apply auth to all user routes
usersRoute.use('*', authMiddleware);

// Get current user profile
usersRoute.get('/me', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const user = await db.query.users.findFirst({
    where: eq(users.address, address),
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user });
});

// Update current user profile
usersRoute.put('/me', zValidator('json', z.object({
  email: z.string().email().optional(),
  githubUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
})), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const body = c.req.valid('json');

  const updated = await db.update(users)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(users.address, address))
    .returning();

  return c.json({ user: updated[0] });
});

// Get user by address (public profile)
usersRoute.get('/:address', async (c) => {
  const address = c.req.param('address');

  const user = await db.query.users.findFirst({
    where: eq(users.address, address),
    columns: {
      address: true,
      bio: true,
      githubUrl: true,
      linkedinUrl: true,
      createdAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get user's public stats
  const [ownedProjectsResult] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.ownerAddress, address));

  const [applicationsResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.freelancerAddress, address));

  const [assignmentsResult] = await db
    .select({ count: count() })
    .from(assignments)
    .where(eq(assignments.freelancerAddress, address));

  return c.json({
    user,
    stats: {
      projectsOwned: ownedProjectsResult?.count || 0,
      applicationsSubmitted: applicationsResult?.count || 0,
      assignmentsActive: assignmentsResult?.count || 0,
    },
  });
});

// Get current user's assignments (freelancer view)
usersRoute.get('/me/assignments', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const userAssignments = await db.query.assignments.findMany({
    where: eq(assignments.freelancerAddress, address),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
    orderBy: [desc(assignments.assignedAt)],
  });

  return c.json({ assignments: userAssignments });
});

// Get current user's portfolio (completed work)
usersRoute.get('/me/portfolio', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const completedKpis = await db.query.kpis.findMany({
    where: eq(kpis.status, 'paid'),
    with: {
      assignment: {
        with: {
          projectRole: {
            with: {
              project: true,
            },
          },
        },
      },
    },
  });

  // Filter by user's address
  const userCompleted = completedKpis.filter(
    kpi => kpi.assignment?.freelancerAddress === address
  );

  return c.json({
    completedKpis: userCompleted.length,
    totalEarned: userCompleted.reduce((sum, kpi) => sum + BigInt(kpi.amount), 0n).toString(),
    projects: userCompleted.map(k => ({
      projectId: k.assignment?.projectRole?.project?.id,
      projectTitle: k.assignment?.projectRole?.project?.title,
      role: k.assignment?.projectRole?.name,
      kpiNumber: k.kpiNumber,
      amount: k.amount,
    })),
  });
});

// Get on-chain portfolio (withdrawal history with transaction hashes)
usersRoute.get('/me/onchain-portfolio', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const paidKpis = await db.query.kpis.findMany({
    where: eq(kpis.status, 'paid'),
    with: {
      assignment: {
        with: {
          projectRole: {
            with: {
              project: true,
            },
          },
        },
      },
    },
  });

  // Filter by user's address
  const userPaidKpis = paidKpis.filter(
    kpi => kpi.assignment?.freelancerAddress === address
  );

  // Build on-chain portfolio
  const withdrawals = userPaidKpis.map(kpi => {
    const baseAmount = BigInt(kpi.amount);
    const yieldEarned = BigInt(kpi.yieldEarned || '0');
    const penaltyAmount = BigInt(kpi.penaltyAmount || '0');
    const freelancerYield = yieldEarned * 40n / 100n;
    const totalReceived = baseAmount + freelancerYield - penaltyAmount;

    return {
      txHash: kpi.payoutTxHash,
      timestamp: kpi.updatedAt,
      projectId: kpi.assignment?.projectRole?.project?.id,
      projectTitle: kpi.assignment?.projectRole?.project?.title,
      vaultAddress: kpi.assignment?.projectRole?.project?.vaultAddress,
      role: kpi.assignment?.projectRole?.name,
      kpiNumber: kpi.kpiNumber,
      amounts: {
        base: baseAmount.toString(),
        yield: freelancerYield.toString(),
        penalty: penaltyAmount.toString(),
        total: totalReceived.toString(),
      },
    };
  });

  // Calculate totals
  const totalBase = withdrawals.reduce((sum, w) => sum + BigInt(w.amounts.base), 0n);
  const totalYield = withdrawals.reduce((sum, w) => sum + BigInt(w.amounts.yield), 0n);
  const totalPenalty = withdrawals.reduce((sum, w) => sum + BigInt(w.amounts.penalty), 0n);
  const totalReceived = withdrawals.reduce((sum, w) => sum + BigInt(w.amounts.total), 0n);

  return c.json({
    stats: {
      totalWithdrawals: withdrawals.length,
      totalBase: totalBase.toString(),
      totalYield: totalYield.toString(),
      totalPenalty: totalPenalty.toString(),
      totalReceived: totalReceived.toString(),
    },
    withdrawals,
  });
});

// Get FL available balance (pending payouts)
usersRoute.get('/me/balance', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  // Get all assignments for this freelancer
  const userAssignments = await db.query.assignments.findMany({
    where: eq(assignments.freelancerAddress, address),
    columns: { id: true },
  });

  const assignmentIds = userAssignments.map(a => a.id);

  if (assignmentIds.length === 0) {
    return c.json({
      availableBalance: '0',
      pendingKpis: 0,
      approvedKpis: 0,
      totalEarned: '0',
    });
  }

  // Get KPIs for these assignments - need to handle multiple assignments
  const allUserKpis = await db.query.kpis.findMany({
    where: assignmentIds.length > 0 ? inArray(kpis.assignmentId, assignmentIds) : undefined,
  });

  // Calculate totals
  const approvedKpis = allUserKpis.filter(k => k.status === 'approved' || k.status === 'paid');
  const pendingKpis = allUserKpis.filter(k => k.status === 'submitted');
  const totalEarned = approvedKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n);

  return c.json({
    availableBalance: totalEarned.toString(),
    pendingKpis: pendingKpis.length,
    approvedKpis: approvedKpis.length,
    totalEarned: totalEarned.toString(),
  });
});

// Get PO project balances (deposited vs spent)
usersRoute.get('/me/project-balances', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  // Get all projects owned by this user
  const myProjects = await db.query.projects.findMany({
    where: eq(projects.ownerAddress, address),
    with: {
      roles: {
        with: {
          kpis: true,
        },
      },
    },
  });

  const projectBalances = myProjects.map(project => {
    const totalDeposited = BigInt(project.totalDeposited || '0');

    // Calculate spent from paid KPIs
    const paidKpis = project.roles.flatMap(r => r.kpis).filter(k => k.status === 'paid');
    const totalSpent = paidKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n);

    // Calculate pending (approved but not yet paid)
    const approvedKpis = project.roles.flatMap(r => r.kpis).filter(k => k.status === 'approved');
    const totalPending = approvedKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n);

    const remaining = totalDeposited - totalSpent;

    return {
      projectId: project.id,
      projectTitle: project.title,
      vaultAddress: project.vaultAddress,
      deposited: totalDeposited.toString(),
      spent: totalSpent.toString(),
      pending: totalPending.toString(),
      remaining: remaining.toString(),
    };
  });

  // Calculate totals across all projects
  const totals = projectBalances.reduce((acc, pb) => ({
    deposited: BigInt(acc.deposited) + BigInt(pb.deposited),
    spent: BigInt(acc.spent) + BigInt(pb.spent),
    pending: BigInt(acc.pending) + BigInt(pb.pending),
    remaining: BigInt(acc.remaining) + BigInt(pb.remaining),
  }), { deposited: 0n, spent: 0n, pending: 0n, remaining: 0n });

  return c.json({
    projects: projectBalances,
    totals: {
      deposited: totals.deposited.toString(),
      spent: totals.spent.toString(),
      pending: totals.pending.toString(),
      remaining: totals.remaining.toString(),
    },
  });
});

// Get earnings summary (with optional date range)
usersRoute.get('/me/earnings', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const from = c.req.query('from');
  const to = c.req.query('to');

  // Get all paid KPIs for this freelancer
  const allPaidKpis = await db.query.kpis.findMany({
    where: eq(kpis.status, 'paid'),
    with: {
      assignment: {
        with: {
          projectRole: {
            with: {
              project: true,
            },
          },
        },
      },
    },
  });

  // Filter by user's address
  const userPaidKpis = allPaidKpis.filter(
    kpi => kpi.assignment?.freelancerAddress === address
  );

  // Apply date filters if provided
  let filteredKpis = userPaidKpis;
  if (from) {
    const fromDate = new Date(from);
    filteredKpis = filteredKpis.filter(k => (k.updatedAt || new Date()) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    filteredKpis = filteredKpis.filter(k => (k.updatedAt || new Date()) <= toDate);
  }

  // Calculate earnings
  const totalBase = filteredKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n);
  const totalYield = filteredKpis.reduce((sum, k) => sum + BigInt(k.yieldEarned || '0'), 0n) * 40n / 100n;
  const totalPenalty = filteredKpis.reduce((sum, k) => sum + BigInt(k.penaltyAmount || '0'), 0n);
  const totalReceived = totalBase + totalYield - totalPenalty;

  return c.json({
    summary: {
      totalKpis: filteredKpis.length,
      totalBase: totalBase.toString(),
      totalYield: totalYield.toString(),
      totalPenalty: totalPenalty.toString(),
      totalReceived: totalReceived.toString(),
    },
    earnings: filteredKpis.map(kpi => ({
      projectId: kpi.assignment?.projectRole?.project?.id,
      projectTitle: kpi.assignment?.projectRole?.project?.title,
      role: kpi.assignment?.projectRole?.name,
      kpiNumber: kpi.kpiNumber,
      amount: kpi.amount,
      yield: (BigInt(kpi.yieldEarned || '0') * 40n / 100n).toString(),
      penalty: kpi.penaltyAmount || '0',
      total: (BigInt(kpi.amount) + (BigInt(kpi.yieldEarned || '0') * 40n / 100n) - BigInt(kpi.penaltyAmount || '0')).toString(),
      date: kpi.updatedAt,
    })),
  });
});

export { usersRoute as usersRouter };
