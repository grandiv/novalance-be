import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema';
import { eq, and, desc, like, or, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { nanoid } from 'nanoid';
import { createProjectSchema, updateProjectSchema, createRoleSchema, updateRoleSchema, createKpiSchema } from '../lib/validations/project';

const projectsRoute = new Hono();

// Public routes - no auth required for listing
projectsRoute.get('/', async (c) => {
  const search = c.req.query('search');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let conditions = [];

  if (search) {
    conditions.push(
      or(
        like(projects.title, `%${search}%`),
        like(projects.description, `%${search}%`)
      )
    );
  }

  if (status) {
    conditions.push(eq(projects.status, status as any));
  }

  const projectList = await db.query.projects.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      owner: {
        columns: {
          address: true,
          bio: true,
        },
      },
      roles: true,
    },
    orderBy: [desc(projects.createdAt)],
    limit,
    offset,
  });

  return c.json({ projects: projectList });
});

projectsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      owner: {
        columns: {
          address: true,
          bio: true,
          githubUrl: true,
          linkedinUrl: true,
        },
      },
      roles: {
        with: {
          applications: {
            where: eq(applications.status, 'pending'),
            with: {
              applicant: {
                columns: {
                  address: true,
                  bio: true,
                  githubUrl: true,
                  linkedinUrl: true,
                },
              },
            },
          },
          assignments: {
            with: {
              freelancer: {
                columns: {
                  address: true,
                  bio: true,
                },
              },
            },
          },
          kpis: {
            orderBy: [kpis.kpiNumber],
          },
        },
      },
    },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ project });
});

// Authenticated routes
projectsRoute.use('*', authMiddleware);

projectsRoute.post('/', zValidator('json', createProjectSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const body = c.req.valid('json');

  const id = nanoid();
  const newProject = await db.insert(projects).values({
    id,
    ownerAddress: address,
    title: body.title,
    description: body.description,
    timelineStart: new Date(body.timelineStart),
    timelineEnd: new Date(body.timelineEnd),
    status: 'draft',
  }).returning();

  return c.json({ project: newProject[0] }, 201);
});

projectsRoute.put('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (existing.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const updated = await db.update(projects)
    .set({
      ...body,
      timelineStart: body.timelineStart ? new Date(body.timelineStart) : existing.timelineStart,
      timelineEnd: body.timelineEnd ? new Date(body.timelineEnd) : existing.timelineEnd,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  return c.json({ project: updated[0] });
});

projectsRoute.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const id = c.req.param('id');

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (existing.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // For MVP: allow deletion if in draft status only
  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only delete draft projects' }, 400);
  }

  await db.delete(projects).where(eq(projects.id, id));

  return c.json({ message: 'Project deleted' });
});

// Role management within a project
projectsRoute.post('/:id/roles', zValidator('json', createRoleSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');
  const body = c.req.valid('json');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const id = nanoid();
  const newRole = await db.insert(projectRoles).values({
    id,
    projectId,
    name: body.name,
    description: body.description,
    kpiCount: body.kpiCount,
    paymentPerKpi: body.paymentPerKpi,
    status: 'open',
  }).returning();

  return c.json({ role: newRole[0] }, 201);
});

projectsRoute.get('/:id/roles', async (c) => {
  const projectId = c.req.param('id');

  const roles = await db.query.projectRoles.findMany({
    where: eq(projectRoles.projectId, projectId),
    with: {
      applications: {
        where: eq(applications.status, 'pending'),
      },
      assignments: {
        with: {
          freelancer: true,
        },
      },
    },
    orderBy: [desc(projectRoles.createdAt)],
  });

  return c.json({ roles });
});

projectsRoute.put('/:id/roles/:roleId', zValidator('json', updateRoleSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');
  const roleId = c.req.param('roleId');
  const body = c.req.valid('json');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  });

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404);
  }

  const updated = await db.update(projectRoles)
    .set(body)
    .where(eq(projectRoles.id, roleId))
    .returning();

  return c.json({ role: updated[0] });
});

projectsRoute.delete('/:id/roles/:roleId', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');
  const roleId = c.req.param('roleId');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  });

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404);
  }

  // Check if role has active assignments
  const activeAssignments = await db.query.assignments.findMany({
    where: eq(assignments.projectRoleId, roleId),
  });

  if (activeAssignments.length > 0) {
    return c.json({ error: 'Cannot delete role with active assignments' }, 400);
  }

  await db.delete(projectRoles).where(eq(projectRoles.id, roleId));

  return c.json({ message: 'Role deleted' });
});

// KPI management for a role
projectsRoute.post('/:id/roles/:roleId/kpis', zValidator('json', createKpiSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');
  const roleId = c.req.param('roleId');
  const body = c.req.valid('json');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  });

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404);
  }

  // Check if KPIs already exist for this role
  const existingKpis = await db.query.kpis.findMany({
    where: eq(kpis.projectRoleId, roleId),
  });

  if (existingKpis.length > 0) {
    return c.json({ error: 'KPIs already created for this role' }, 400);
  }

  // Validate KPI count matches role
  if (body.kpis.length !== role.kpiCount) {
    return c.json({ error: `Expected ${role.kpiCount} KPIs, got ${body.kpis.length}` }, 400);
  }

  // Insert all KPIs
  const kpiData = body.kpis.map((kpi) => ({
    id: nanoid(),
    projectRoleId: roleId,
    kpiNumber: kpi.kpiNumber,
    description: kpi.description,
    deadline: new Date(kpi.deadline),
    amount: role.paymentPerKpi,
    status: 'pending' as const,
  }));

  const created = await db.insert(kpis).values(kpiData).returning();

  return c.json({ kpis: created }, 201);
});

projectsRoute.get('/:id/roles/:roleId/kpis', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');
  const roleId = c.req.param('roleId');

  // Verify project exists
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Only owner and assigned freelancers can see KPIs
  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      assignments: true,
    },
  });

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404);
  }

  const isOwner = project.ownerAddress === address;
  const isAssigned = role.assignments.some(a => a.freelancerAddress === address);

  if (!isOwner && !isAssigned) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const kpiList = await db.query.kpis.findMany({
    where: eq(kpis.projectRoleId, roleId),
    orderBy: [kpis.kpiNumber],
  });

  return c.json({ kpis: kpiList });
});

projectsRoute.put('/kpis/:kpiId', zValidator('json', z.object({
  description: z.string().min(5).max(500).optional(),
  deadline: z.string().datetime().optional(),
})), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const kpiId = c.req.param('kpiId');
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

  // Only project owner can update KPIs
  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Cannot update KPI if already submitted
  if (kpi.status !== 'pending') {
    return c.json({ error: 'Cannot update submitted KPI' }, 400);
  }

  const updated = await db.update(kpis)
    .set({
      ...body,
      deadline: body.deadline ? new Date(body.deadline) : kpi.deadline,
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  return c.json({ kpi: updated[0] });
});

// Get project progress overview
projectsRoute.get('/:id/progress', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      roles: {
        with: {
          assignments: {
            with: {
              freelancer: true,
            },
          },
          kpis: {
            orderBy: [kpis.kpiNumber],
          },
        },
      },
    },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Only owner or assigned freelancers can view progress
  const isOwner = project.ownerAddress === address;
  const isFreelancer = project.roles.some(role =>
    role.assignments.some(a => a.freelancerAddress === address)
  );

  if (!isOwner && !isFreelancer) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Calculate progress per role
  const roleProgress = project.roles.map(role => {
    const totalKpis = role.kpis.length;
    const completedKpis = role.kpis.filter(k => k.status === 'approved' || k.status === 'paid').length;
    const pendingKpis = role.kpis.filter(k => k.status === 'pending').length;
    const submittedKpis = role.kpis.filter(k => k.status === 'submitted').length;
    const inProgressKpis = role.kpis.filter(k => k.status === 'rejected').length;

    return {
      role: {
        id: role.id,
        name: role.name,
        status: role.status,
      },
      assignment: role.assignments[0] || null,
      progress: {
        total: totalKpis,
        completed: completedKpis,
        pending: pendingKpis,
        submitted: submittedKpis,
        inProgress: inProgressKpis,
        percentage: totalKpis > 0 ? Math.round((completedKpis / totalKpis) * 100) : 0,
      },
    };
  });

  // Overall project progress
  const totalKpis = project.roles.reduce((sum, role) => sum + role.kpis.length, 0);
  const totalCompleted = project.roles.reduce(
    (sum, role) => sum + role.kpis.filter(k => k.status === 'approved' || k.status === 'paid').length,
    0
  );

  return c.json({
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      vaultAddress: project.vaultAddress,
    },
    overallProgress: {
      totalKpis,
      completedKpis: totalCompleted,
      percentage: totalKpis > 0 ? Math.round((totalCompleted / totalKpis) * 100) : 0,
    },
    roles: roleProgress,
  });
});

// Request project cancellation
projectsRoute.post('/:id/cancel', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const projectId = c.req.param('id');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      roles: {
        with: {
          assignments: {
            with: {
              kpis: true,
            },
          },
          kpis: true,
        },
      },
    },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (project.status === 'cancelled' || project.status === 'completed') {
    return c.json({ error: 'Project already ended' }, 400);
  }

  // Calculate what's been completed vs refundable
  const roleBreakdown = project.roles.map(role => {
    const assignments = role.assignments;
    const kpis = role.kpis;

    const paidKpis = kpis.filter(k => k.status === 'paid');
    const approvedKpis = kpis.filter(k => k.status === 'approved');
    const pendingKpis = kpis.filter(k => k.status === 'pending' || k.status === 'submitted');

    return {
      roleId: role.id,
      roleName: role.name,
      freelancer: assignments[0]?.freelancerAddress || null,
      kpis: {
        paid: paidKpis.length,
        approved: approvedKpis.length,
        pending: pendingKpis.length,
        paidAmount: paidKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n).toString(),
        approvedAmount: approvedKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n).toString(),
        pendingAmount: pendingKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n).toString(),
      },
    };
  });

  // Update project status
  await db.update(projects)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Cancel all active roles
  for (const role of project.roles) {
    if (role.status === 'assigned') {
      await db.update(projectRoles)
        .set({ status: 'cancelled' })
        .where(eq(projectRoles.id, role.id));
    }
  }

  return c.json({
    message: 'Project cancelled',
    breakdown: roleBreakdown,
    // SC dev handles the actual refund logic
  });
});

// Get cancellation status
projectsRoute.get('/:id/cancellation-status', async (c) => {
  const projectId = c.req.param('id');

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({
    status: project.status,
    isCancelled: project.status === 'cancelled',
  });
});

export { projectsRoute as projectsRouter };
