import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { submitKpiSchema, reviewKpiSchema, recordDepositSchema, recordPayoutSchema, confirmKpiSchema } from '../lib/validations/kpi.js';

const kpisRoute = new Hono();

kpisRoute.use('*', authMiddleware);

// Submit KPI (freelancer only)
kpisRoute.post('/:id/submit', zValidator('json', submitKpiSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');
  const body = c.req.valid('json');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
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

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found or not assigned' }, 404);
  }

  // Only assigned freelancer can submit
  if (kpi.assignment.freelancerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (kpi.status !== 'pending') {
    return c.json({ error: 'KPI already submitted' }, 400);
  }

  // Handle both legacy submissionData and new structured deliverables
  let submissionDataToStore: string;
  if (body.deliverables) {
    // If deliverables provided, JSON.stringify it for storage
    submissionDataToStore = JSON.stringify(body.deliverables);
  } else if (body.submissionData) {
    // If submissionData provided, use it directly
    submissionDataToStore = body.submissionData;
  } else {
    return c.json({ error: 'Either submissionData or deliverables must be provided' }, 400);
  }

  const updated = await db.update(kpis)
    .set({
      status: 'submitted',
      submissionData: submissionDataToStore,
      submittedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Approve KPI (PO only)
kpisRoute.post('/:id/approve', zValidator('json', reviewKpiSchema.partial()), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');
  const body = c.req.valid('json');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      assignment: true,
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found' }, 404);
  }

  // Only project owner can approve
  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (kpi.status !== 'submitted') {
    return c.json({ error: 'KPI not submitted' }, 400);
  }

  const updated = await db.update(kpis)
    .set({
      status: 'approved',
      reviewComment: body.comment || null,
      reviewedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  // TODO: Trigger smart contract payment
  // This is where you'd call the SC to release payment for this KPI

  return c.json({ kpi: updated[0] });
});

// Reject KPI (PO only)
kpisRoute.post('/:id/reject', zValidator('json', z.object({
  comment: z.string().min(10).max(1000),
})), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');
  const body = c.req.valid('json');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      assignment: true,
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found' }, 404);
  }

  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (kpi.status !== 'submitted') {
    return c.json({ error: 'KPI not submitted' }, 400);
  }

  const updated = await db.update(kpis)
    .set({
      status: 'rejected',
      reviewComment: body.comment,
      reviewedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Confirm KPI (freelancer only - multi-sig step after PO approval)
kpisRoute.post('/:id/confirm', zValidator('json', confirmKpiSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      assignment: true,
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found or not assigned' }, 404);
  }

  // Only assigned freelancer can confirm
  if (kpi.assignment.freelancerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Can only confirm approved KPIs (multi-sig flow)
  if (kpi.status !== 'approved') {
    return c.json({ error: 'KPI must be approved by PO first' }, 400);
  }

  // TODO: Trigger smart contract multi-sig withdrawal
  // This is where you'd call the SC to finalize the multi-sig withdrawal
  // SC should: verify freelancer signature + PO approval, then release funds

  const updated = await db.update(kpis)
    .set({
      status: 'paid',
      updatedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Get my pending KPIs (freelancer view)
kpisRoute.get('/my/pending', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const myAssignments = await db.query.assignments.findMany({
    where: eq(assignments.freelancerAddress, address),
    columns: {
      id: true,
    },
  });

  const assignmentIds = myAssignments.map(a => a.id);

  if (assignmentIds.length === 0) {
    return c.json({ kpis: [] });
  }

  // Get all pending KPIs
  const allKpis = await db.query.kpis.findMany({
    where: eq(kpis.status, 'pending'),
  });

  const myKpis = allKpis.filter(k => k.assignmentId && assignmentIds.includes(k.assignmentId));

  return c.json({ kpis: myKpis });
});

// Get pending reviews (PO view)
kpisRoute.get('/pending-reviews', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const myProjects = await db.query.projects.findMany({
    where: eq(projects.ownerAddress, address),
    columns: {
      id: true,
    },
  });

  const projectIds = myProjects.map(p => p.id);

  if (projectIds.length === 0) {
    return c.json({ kpis: [] });
  }

  // Get roles for these projects
  const roles = await db.query.projectRoles.findMany({
    where: inArray(projectRoles.projectId, projectIds),
    columns: {
      id: true,
    },
  });

  const roleIds = roles.map(r => r.id);

  // Get submitted KPIs for these roles
  const submittedKpis = await db.query.kpis.findMany({
    where: and(
      eq(kpis.status, 'submitted'),
      inArray(kpis.projectRoleId, roleIds)
    ),
  });

  return c.json({ kpis: submittedKpis });
});

// Record KPI deposit to vault (SC event callback)
kpisRoute.post('/:id/record-deposit', zValidator('json', recordDepositSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');
  const body = c.req.valid('json');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi) {
    return c.json({ error: 'KPI not found' }, 404);
  }

  // Only project owner can record deposits
  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const updated = await db.update(kpis)
    .set({
      depositTxHash: body.txHash,
      vaultBalanceAtStart: body.vaultBalance,
      updatedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Record KPI payout from vault (SC event callback)
kpisRoute.post('/:id/record-payout', zValidator('json', recordPayoutSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');
  const body = c.req.valid('json');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi) {
    return c.json({ error: 'KPI not found' }, 404);
  }

  // Only project owner can record payouts
  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const updated = await db.update(kpis)
    .set({
      status: 'paid',
      payoutTxHash: body.txHash,
      vaultBalanceAtEnd: body.vaultBalance,
      yieldEarned: body.yieldEarned,
      penaltyAmount: body.penaltyAmount,
      updatedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Get KPI yield/penalty breakdown
kpisRoute.get('/:id/breakdown', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('id');

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      assignment: true,
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!kpi) {
    return c.json({ error: 'KPI not found' }, 404);
  }

  // Only project owner or assigned freelancer can view
  const isOwner = kpi.projectRole.project.ownerAddress === address;
  const isFreelancer = kpi.assignment?.freelancerAddress === address;

  if (!isOwner && !isFreelancer) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Calculate yield/penalty breakdown
  const baseAmount = BigInt(kpi.amount);
  const yieldEarned = BigInt(kpi.yieldEarned || '0');
  const penaltyAmount = BigInt(kpi.penaltyAmount || '0');

  // Distribution: 40% FL, 40% PO, 20% AV (from CONTEXT.md)
  const freelancerYield = yieldEarned * 40n / 100n;
  const ownerYield = yieldEarned * 40n / 100n;
  const devYield = yieldEarned * 20n / 100n;

  const freelancerTotal = baseAmount + freelancerYield - penaltyAmount;
  const ownerTotal = ownerYield;
  const devTotal = devYield;

  return c.json({
    kpi: {
      id: kpi.id,
      kpiNumber: kpi.kpiNumber,
      description: kpi.description,
      status: kpi.status,
    },
    amounts: {
      baseAmount: baseAmount.toString(),
      yieldEarned: yieldEarned.toString(),
      penaltyAmount: penaltyAmount.toString(),
    },
    distribution: {
      freelancer: freelancerTotal.toString(),
      projectOwner: ownerTotal.toString(),
      devWallet: devTotal.toString(),
    },
    transactions: {
      depositTxHash: kpi.depositTxHash,
      payoutTxHash: kpi.payoutTxHash,
    },
    vaultBalances: {
      atStart: kpi.vaultBalanceAtStart,
      atEnd: kpi.vaultBalanceAtEnd,
    },
  });
});

export { kpisRoute as kpisRouter };
