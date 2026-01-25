import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users, projects, applications, assignments, kpis } from '../db/schema';
import { eq, desc, count } from 'drizzle-orm';
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

export { usersRoute as usersRouter };
