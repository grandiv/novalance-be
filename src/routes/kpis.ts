import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { submitKpiSchema, reviewKpiSchema } from '../lib/validations/kpi';

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

  const updated = await db.update(kpis)
    .set({
      status: 'submitted',
      submissionData: body.submissionData,
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

export { kpisRoute as kpisRouter };
