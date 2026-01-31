import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/index.js';
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { nanoid } from 'nanoid';
import { submitApplicationSchema } from '../lib/validations/application';

const applicationsRoute = new Hono();

applicationsRoute.use('*', authMiddleware);

// Submit application to a role
applicationsRoute.post('/', zValidator('json', submitApplicationSchema), async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const body = c.req.valid('json');
  const roleId = c.req.query('roleId');

  if (!roleId) {
    return c.json({ error: 'roleId query parameter required' }, 400);
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      project: true,
    },
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  if (role.status !== 'open') {
    return c.json({ error: 'Role is not open for applications' }, 400);
  }

  // Check if already applied
  const existingApplication = await db.query.applications.findFirst({
    where: and(
      eq(applications.projectRoleId, roleId),
      eq(applications.freelancerAddress, address)
    ),
  });

  if (existingApplication) {
    return c.json({ error: 'Already applied to this role' }, 400);
  }

  const id = nanoid();
  const application = await db.insert(applications).values({
    id,
    projectRoleId: roleId,
    freelancerAddress: address,
    status: 'pending',
    coverLetter: body.coverLetter,
  }).returning();

  return c.json({ application: application[0] }, 201);
});

// Get applicants for a role (PO only)
applicationsRoute.get('/role/:roleId', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const roleId = c.req.param('roleId');

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      project: true,
    },
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  if (role.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const applicants = await db.query.applications.findMany({
    where: eq(applications.projectRoleId, roleId),
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
    orderBy: [desc(applications.createdAt)],
  });

  return c.json({ applicants });
});

// Accept application (creates assignment)
applicationsRoute.post('/:id/accept', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const applicationId = c.req.param('id');

  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!application) {
    return c.json({ error: 'Application not found' }, 404);
  }

  if (application.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (application.status !== 'pending') {
    return c.json({ error: 'Application already processed' }, 400);
  }

  if (application.projectRole.status !== 'open') {
    return c.json({ error: 'Role is no longer open' }, 400);
  }

  // Create assignment
  const assignmentId = nanoid();
  await db.insert(assignments).values({
    id: assignmentId,
    projectRoleId: application.projectRoleId,
    freelancerAddress: application.freelancerAddress,
    status: 'active',
  });

  // Link KPIs to this assignment
  await db.update(kpis)
    .set({ assignmentId })
    .where(eq(kpis.projectRoleId, application.projectRoleId));

  // Update application status
  await db.update(applications)
    .set({ status: 'accepted' })
    .where(eq(applications.id, applicationId));

  // Reject other pending applications for this role
  await db.update(applications)
    .set({ status: 'rejected' })
    .where(and(
      eq(applications.projectRoleId, application.projectRoleId),
      eq(applications.status, 'pending')
    ));

  // Update role status
  await db.update(projectRoles)
    .set({ status: 'assigned' })
    .where(eq(projectRoles.id, application.projectRoleId));

  // Return assignment with KPIs
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
      kpis: {
        orderBy: [kpis.kpiNumber],
      },
    },
  });

  return c.json({ assignment });
});

// Reject application
applicationsRoute.post('/:id/reject', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;
  const applicationId = c.req.param('id');

  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!application) {
    return c.json({ error: 'Application not found' }, 404);
  }

  if (application.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (application.status !== 'pending') {
    return c.json({ error: 'Application already processed' }, 400);
  }

  await db.update(applications)
    .set({ status: 'rejected' })
    .where(eq(applications.id, applicationId));

  return c.json({ message: 'Application rejected' });
});

// Get my applications
applicationsRoute.get('/my', async (c) => {
  const auth = c.get('auth');
  const address = auth.address;

  const myApplications = await db.query.applications.findMany({
    where: eq(applications.freelancerAddress, address),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
    orderBy: [desc(applications.createdAt)],
  });

  return c.json({ applications: myApplications });
});

export { applicationsRoute as applicationsRouter };
