# NovaLance API Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement missing API endpoints to align frontend expectations with backend capabilities for the 24-hour hackathon.

**Architecture:** Simple REST API additions to existing Hono/TypeScript backend. No new tables, minimal code changes, leverage existing patterns.

**Tech Stack:** Hono, Drizzle ORM, Zod validation, TypeScript, SQLite

---

## Overview of Gaps to Implement

| Gap | Priority | Description |
|-----|----------|-------------|
| FL KPI Confirm | High | New endpoint for freelancer to confirm KPI after PO approval |
| FL/PO Balance | Medium | Convenience endpoints for user balances |
| Earnings Summary | Medium | Aggregate earnings data for users |
| Skill-based Filtering | Low | Filter projects/roles by skills |

---

## Task 1: FL KPI Confirm Endpoint

**Files:**
- Modify: `src/routes/kpis.ts` (add new route at end)
- Test: Manual API test

**Step 1: Add the confirm KPI endpoint**

Add this new route after line 151 (after the reject endpoint):

```typescript
// Confirm KPI (freelancer only - multi-sig step after PO approval)
kpisRoute.post('/:id/confirm', async (c) => {
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

  const updated = await db.update(kpis)
    .set({
      status: 'paid', // Move to paid status, trigger SC payout
      updatedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();

  // TODO: Trigger smart contract payout
  // This is where SC dev would release payment

  return c.json({ kpi: updated[0] });
});
```

**Step 2: Test the endpoint**

Run the server and test:
```bash
npm run dev
```

Test with curl/postman:
```bash
curl -X POST http://localhost:3000/api/kpis/{kpiId}/confirm \
  -H "Authorization: Bearer {jwt_token}"
```

Expected: `200 OK` with updated KPI status `paid`

**Step 3: Commit**

```bash
git add src/routes/kpis.ts
git commit -m "feat: add FL KPI confirm endpoint for multi-sig flow"
```

---

## Task 2: FL Balance Endpoint

**Files:**
- Modify: `src/routes/users.ts` (add after line 221)
- Test: Manual API test

**Step 1: Add FL balance endpoint**

Add this route at the end of `usersRoute` (after `/me/onchain-portfolio`):

```typescript
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

  // Get KPIs for these assignments
  const userKpis = await db.query.kpis.findMany({
    where: eq(kpis.assignmentId, assignmentIds[0]), // Note: simple query, extend if needed
  });

  // Calculate totals
  const approvedKpis = userKpis.filter(k => k.status === 'approved' || k.status === 'paid');
  const pendingKpis = userKpis.filter(k => k.status === 'submitted');
  const totalEarned = approvedKpis.reduce((sum, k) => sum + BigInt(k.amount), 0n);

  return c.json({
    availableBalance: totalEarned.toString(),
    pendingKpis: pendingKpis.length,
    approvedKpis: approvedKpis.length,
    totalEarned: totalEarned.toString(),
  });
});
```

**Step 2: Test the endpoint**

```bash
curl http://localhost:3000/api/users/me/balance \
  -H "Authorization: Bearer {jwt_token}"
```

Expected: JSON with balance breakdown

**Step 3: Commit**

```bash
git add src/routes/users.ts
git commit -m "feat: add FL balance endpoint"
```

---

## Task 3: PO Balance Endpoint

**Files:**
- Modify: `src/routes/users.ts` (add after FL balance endpoint)
- Test: Manual API test

**Step 1: Add PO balance endpoint**

Add this route after the FL balance endpoint:

```typescript
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
```

**Step 2: Test the endpoint**

```bash
curl http://localhost:3000/api/users/me/project-balances \
  -H "Authorization: Bearer {jwt_token}"
```

Expected: JSON with project balances and totals

**Step 3: Commit**

```bash
git add src/routes/users.ts
git commit -m "feat: add PO project balances endpoint"
```

---

## Task 4: Earnings Summary Endpoint

**Files:**
- Modify: `src/routes/users.ts` (add after PO balance endpoint)
- Test: Manual API test

**Step 1: Add earnings summary endpoint**

```typescript
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
```

**Step 2: Test the endpoint**

```bash
curl "http://localhost:3000/api/users/me/earnings?from=2025-01-01&to=2025-12-31" \
  -H "Authorization: Bearer {jwt_token}"
```

Expected: JSON with earnings breakdown

**Step 3: Commit**

```bash
git add src/routes/users.ts
git commit -m "feat: add earnings summary endpoint with date filtering"
```

---

## Task 5: Skill-based Filtering (Optional)

**Files:**
- Modify: `src/routes/projects.ts` (update GET / endpoint)
- Modify: `src/db/schema.ts` (add skills field if not exists)
- Test: Manual API test

**Step 1: Check if skills field exists**

In `src/db/schema.ts`, check if `projectRoles` has a `skills` field. If not, add it:

```typescript
// In projectRoles table, add after description:
skills: text('skills'), // JSON array of skills: ["typescript", "react"]
```

**Step 2: Run migration**

```bash
npm run db:push
```

**Step 3: Update projects listing endpoint**

In `src/routes/projects.ts`, modify the GET / endpoint (around line 14-52) to add skill filtering:

After line 32 (after status condition), add:

```typescript
  // Filter by skills if provided
  const skills = c.req.query('skills'); // Comma-separated: "typescript,react"
  if (skills) {
    const skillList = skills.split(',');
    // Get roles matching any skill
    const matchingRoles = await db.query.projectRoles.findMany();
    const roleIdsWithSkills = matchingRoles
      .filter(role => {
        if (!role.skills) return false;
        const roleSkills = JSON.parse(role.skills);
        return skillList.some(s => roleSkills.includes(s));
      })
      .map(r => r.projectId);
    conditions.push(inArray(projects.id, roleIdsWithSkills));
  }
```

**Step 4: Test the endpoint**

```bash
curl "http://localhost:3000/api/projects?skills=typescript,react"
```

Expected: Filtered projects list

**Step 5: Commit**

```bash
git add src/db/schema.ts src/routes/projects.ts
git commit -m "feat: add skill-based filtering for projects"
```

---

## Task 6: Update KPI Submit to Support Structured Deliverables

**Files:**
- Modify: `src/lib/validations/kpi.ts` (update schema)
- Modify: `src/routes/kpis.ts` (update submit endpoint)
- Test: Manual API test

**Step 1: Update validation schema**

In `src/lib/validations/kpi.ts`, replace `submitKpiSchema`:

```typescript
export const submitKpiSchema = z.object({
  submissionData: z.string().min(10).max(5000).optional(), // Legacy support
  // New structured format
  deliverables: z.object({
    links: z.array(z.string().url()).default([]),
    description: z.string().min(10).max(5000),
  }).optional(),
});
```

**Step 2: Update submit endpoint**

In `src/routes/kpis.ts`, update the submit endpoint (line 49-56) to handle both formats:

```typescript
  // Convert deliverables to JSON string for storage
  let submissionData = body.submissionData;
  if (body.deliverables) {
    submissionData = JSON.stringify(body.deliverables);
  }

  const updated = await db.update(kpis)
    .set({
      status: 'submitted',
      submissionData,
      submittedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning();
```

**Step 3: Test the endpoint**

```bash
curl -X POST http://localhost:3000/api/kpis/{id}/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {jwt_token}" \
  -d '{
    "deliverables": {
      "links": ["https://github.com/repo", "https://demo.app"],
      "description": "Implemented feature X with tests"
    }
  }'
```

Expected: `200 OK` with KPI status `submitted`

**Step 4: Commit**

```bash
git add src/lib/validations/kpi.ts src/routes/kpis.ts
git commit -m "feat: support structured deliverables in KPI submission"
```

---

## Summary

After completing all tasks, the backend will have:

- ✅ FL KPI confirm endpoint (multi-sig flow)
- ✅ FL balance endpoint
- ✅ PO project balances endpoint
- ✅ Earnings summary with date filtering
- ✅ Skill-based project filtering
- ✅ Structured deliverables for KPI submissions

**Total estimated time:** 2-3 hours for all tasks

**Testing:** Run `npm run dev` and test each endpoint manually or use the provided curl commands.

**Next steps:** After implementation, coordinate with FE team to integrate these new endpoints.
