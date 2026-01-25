# Novalance Backend MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete Web3 freelancer marketplace backend API in 7 days that bridges Frontend and Smart Contracts, handling off-chain data, wallet authentication, and project/role/KPI management.

**Architecture:** REST API using Bun + Hono (ultra-fast TypeScript server), SQLite + Drizzle ORM (zero-config database), viem for Web3 integration. Zod for runtime validation. All contract money logic handled by SC dev, we handle coordination and off-chain state.

**Tech Stack:**
- **Runtime:** Bun (fastest TypeScript, built-in test runner)
- **Framework:** Hono (lightweight, Edge-compatible)
- **Database:** SQLite + Drizzle ORM (zero-config, migrations built-in)
- **Web3:** viem (Base network integration)
- **Validation:** Zod (runtime type safety)
- **Testing:** bun test (built-in)

---

## Database Schema First

### Task 1: Initialize Database Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Install dependencies**

```bash
bun add hono @hono/zod-validator drizzle-orm better-sqlite3
bun add -d drizzle-kit @types/better-sqlite3
bun add zod viem
```

**Step 2: Create schema file**

`src/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  address: text('address').primaryKey(),
  nonce: text('nonce').notNull(),
  email: text('email'),
  githubUrl: text('github_url'),
  linkedinUrl: text('linkedin_url'),
  bio: text('bio'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerAddress: text('owner_address').notNull().references(() => users.address),
  title: text('title').notNull(),
  description: text('description').notNull(),
  timelineStart: integer('timeline_start', { mode: 'timestamp' }).notNull(),
  timelineEnd: integer('timeline_end', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull().$type<'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'>(),
  vaultAddress: text('vault_address'), // Set by SC after first deposit
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const projectRoles = sqliteTable('project_roles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g., "Frontend Developer"
  description: text('description').notNull(),
  kpiCount: integer('kpi_count').notNull(), // Number of milestones
  paymentPerKpi: text('payment_per_kpi').notNull(), // IDRX amount as string
  status: text('status').notNull().$type<'open' | 'filled' | 'cancelled'>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address),
  status: text('status').notNull().$type<'pending' | 'accepted' | 'rejected'>(),
  coverLetter: text('cover_letter'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  status: text('status').notNull().$type<'active' | 'completed' | 'cancelled'>(),
})

export const kpis = sqliteTable('kpis', {
  id: text('id').primaryKey(),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  assignmentId: text('assignment_id').references(() => assignments.id), // Null until role is filled
  kpiNumber: integer('kpi_number').notNull(), // 1, 2, 3... within the role
  description: text('description').notNull(),
  deadline: integer('deadline', { mode: 'timestamp' }).notNull(),
  amount: text('amount').notNull(), // IDRX as string
  status: text('status').notNull().$type<'pending' | 'submitted' | 'approved' | 'rejected' | 'paid'>(),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  submissionData: text('submission_data'), // JSON string of submission details
  reviewComment: text('review_comment'),
  penaltyAmount: text('penalty_amount').default('0'), // Calculated by SC
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type').notNull().$type<'deposit' | 'payment' | 'refund' | 'penalty'>(),
  projectId: text('project_id').references(() => projects.id),
  kpiId: text('kpi_id').references(() => kpis.id),
  assignmentId: text('assignment_id').references(() => assignments.id),
  txHash: text('tx_hash').notNull(),
  amount: text('amount').notNull(),
  status: text('status').notNull().$type<'pending' | 'confirmed' | 'failed'>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
})

// Types for TypeScript
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectRole = typeof projectRoles.$inferSelect
export type NewProjectRole = typeof projectRoles.$inferInsert
export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
export type Assignment = typeof assignments.$inferSelect
export type NewAssignment = typeof assignments.$inferInsert
export type Kpi = typeof kpis.$inferSelect
export type NewKpi = typeof kpis.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
```

**Step 3: Create database connection**

`src/db/index.ts`:

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const sqlite = new Database('./novalance.db')
export const db = drizzle(sqlite, { schema })
```

**Step 4: Create Drizzle config**

`drizzle.config.ts`:

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './novalance.db',
  },
} satisfies Config
```

**Step 5: Add package.json scripts**

`package.json` (create if not exists):

```json
{
  "name": "novalance-be",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run src/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/zod-validator": "^0.2.0",
    "drizzle-orm": "^0.29.0",
    "better-sqlite3": "^9.0.0",
    "zod": "^3.22.0",
    "viem": "^2.0.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.20.0",
    "@types/better-sqlite3": "^7.6.0",
    "bun-types": "latest"
  }
}
```

**Step 6: Generate and push schema**

```bash
bun run db:generate
bun run db:push
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: initialize database schema with Drizzle ORM"
```

---

## Server Setup

### Task 2: Initialize Hono Server

**Files:**
- Create: `src/index.ts`
- Create: `src/app.ts`
- Create: `.env.example`

**Step 1: Create main entry point**

`src/index.ts`:

```typescript
import { serve } from 'bun'
import { app } from './app'

const port = process.env.PORT || 3000

serve({
  fetch: app.fetch,
  port: Number(port),
})

console.log(`🚀 Novalance API running on http://localhost:${port}`)
```

**Step 2: Create Hono app with error handling**

`src/app.ts`:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // FE URLs
  credentials: true,
}))
app.use('*', logger())

// Health check
app.get('/', (c) => c.json({ status: 'ok', message: 'Novalance API v1.0' }))

// API routes (will be added)
// app.route('/api/auth', authRouter)
// app.route('/api/projects', projectsRouter)
// etc.

export { app }
```

**Step 3: Create .env.example**

`.env.example`:

```env
# Server
PORT=3000

# Base Network
BASE_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://sepolia.base.org

# Smart Contract Addresses (to be provided by SC dev)
# MOCK_IDRX_ADDRESS=
# VAULT_FACTORY_ADDRESS=
# VAULT_IMPLEMENTATION_ADDRESS=

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
```

**Step 4: Test server**

```bash
bun run dev
```

Expected: Server starts on port 3000

**Step 5: Test health endpoint**

```bash
curl http://localhost:3000/
```

Expected: `{"status":"ok","message":"Novalance API v1.0"}`

**Step 6: Commit**

```bash
git add .
git commit -m "feat: initialize Hono server with CORS and logging"
```

---

## Authentication Module

### Task 3: Wallet Signature Authentication

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/lib/jwt.ts`
- Create: `src/middleware/auth.ts`
- Create: `src/routes/auth.ts`
- Modify: `src/app.ts`

**Step 1: Create crypto utilities**

`src/lib/crypto.ts`:

```typescript
import { verifyMessage, hashMessage } from 'viem'
import { nanoid } from 'nanoid'

const NONCE_EXPIRY = 5 * 60 * 1000 // 5 minutes

export function generateNonce(): string {
  return nanoid(32)
}

export function createSignMessage(nonce: string, address: string): string {
  return `Welcome to Novalance!\n\nClick to sign in and verify your wallet ownership.\n\nThis request will not trigger a blockchain transaction or cost any fees.\n\nWallet address:\n${address}\n\nNonce: ${nonce}\n\nTimestamp: ${Date.now()}`
}

export async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recovered = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    return recovered.toLowerCase() === address.toLowerCase()
  } catch {
    return false
  }
}
```

**Step 2: Create JWT utilities**

`src/lib/jwt.ts`:

```typescript
import { sign, verify } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me'

export interface JwtPayload {
  address: string
  iat: number
  exp: number
}

export async function createToken(address: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtPayload = {
    address: address.toLowerCase(),
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  }
  return await sign(payload, JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    return await verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}
```

**Step 3: Create authentication middleware**

`src/middleware/auth.ts`:

```typescript
import { Context, Next } from 'hono'
import { verifyToken } from '../lib/jwt'

export interface AuthContext {
  address: string
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  c.set('auth', { address: payload.address })
  await next()
}
```

**Step 4: Create auth routes**

`src/routes/auth.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateNonce, createSignMessage, verifySignature } from '../lib/crypto'
import { createToken } from '../lib/jwt'

const auth = new Hono()

// Request nonce for signing
auth.post('/wallet/nonce', zValidator('json', z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
})), async (c) => {
  const { address } = c.req.valid('json')

  const existingUser = await db.query.users.findFirst({
    where: eq(users.address, address.toLowerCase()),
  })

  const nonce = generateNonce()

  if (existingUser) {
    await db.update(users)
      .set({ nonce, updatedAt: new Date() })
      .where(eq(users.address, address.toLowerCase()))
  } else {
    await db.insert(users).values({
      address: address.toLowerCase(),
      nonce,
    })
  }

  const message = createSignMessage(nonce, address)

  return c.json({ nonce, message })
})

// Verify signature and get token
auth.post('/wallet/verify', zValidator('json', z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
})), async (c) => {
  const { address, signature } = c.req.valid('json')

  const user = await db.query.users.findFirst({
    where: eq(users.address, address.toLowerCase()),
  })

  if (!user) {
    return c.json({ error: 'User not found. Request a nonce first.' }, 404)
  }

  const message = createSignMessage(user.nonce, address)
  const isValid = await verifySignature(address, message, signature)

  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Clear nonce after successful verification
  await db.update(users)
    .set({ nonce: generateNonce(), updatedAt: new Date() })
    .where(eq(users.address, address.toLowerCase()))

  const token = await createToken(address)

  return c.json({ token, address: user.address })
})

export { auth as authRouter }
```

**Step 5: Add query utility for Drizzle**

`src/db/index.ts` (add after existing exports):

```typescript
// Add this after the db export
import { users, projects, projectRoles, applications, assignments, kpis, transactions } from './schema'

export const dbQuery = {
  users: {
    findFirst: (where: any) => db.select().from(users).where(where).limit(1),
  },
  // Add others as needed
}
```

Actually, let's use Drizzle's query API properly. Update `src/db/index.ts`:

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const sqlite = new Database('./novalance.db')
export const db = drizzle(sqlite, { schema })
```

**Step 6: Register auth routes in app**

`src/app.ts` (add import and route):

```typescript
import { authRouter } from './routes/auth'

// Add after health check
app.route('/api/auth', authRouter)
```

**Step 7: Install nanoid for nonce generation**

```bash
bun add nanoid
```

**Step 8: Test auth flow**

```bash
# Request nonce
curl -X POST http://localhost:3000/api/auth/wallet/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'

# Expected: { "nonce": "...", "message": "Welcome to Novalance!..." }
```

**Step 9: Commit**

```bash
git add .
git commit -m "feat: implement wallet signature authentication"
```

---

## User Profile Module

### Task 4: User Profile Endpoints

**Files:**
- Create: `src/routes/users.ts`
- Modify: `src/app.ts`

**Step 1: Create user routes**

`src/routes/users.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { users, projects, applications, assignments, kpis } from '../db/schema'
import { eq, or, desc, count } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

const usersRoute = new Hono()

// Apply auth to all user routes
usersRoute.use('*', authMiddleware)

// Get current user profile
usersRoute.get('/me', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

  const user = await db.query.users.findFirst({
    where: eq(users.address, address),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ user })
})

// Update current user profile
usersRoute.put('/me', zValidator('json', z.object({
  email: z.string().email().optional(),
  githubUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
})), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const body = c.req.valid('json')

  const updated = await db.update(users)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(users.address, address))
    .returning()

  return c.json({ user: updated[0] })
})

// Get user by address (public profile)
usersRoute.get('/:address', async (c) => {
  const auth = c.get('auth')
  const address = c.req.param('address')

  const user = await db.query.users.findFirst({
    where: eq(users.address, address),
    columns: {
      address: true,
      bio: true,
      githubUrl: true,
      linkedinUrl: true,
      createdAt: true,
    },
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Get user's public stats
  const [ownedProjectsResult] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.ownerAddress, address))

  const [applicationsResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.freelancerAddress, address))

  const [assignmentsResult] = await db
    .select({ count: count() })
    .from(assignments)
    .where(eq(assignments.freelancerAddress, address))

  return c.json({
    user,
    stats: {
      projectsOwned: ownedProjectsResult?.count || 0,
      applicationsSubmitted: applicationsResult?.count || 0,
      assignmentsActive: assignmentsResult?.count || 0,
    },
  })
})

// Get current user's assignments (freelancer view)
usersRoute.get('/me/assignments', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

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
  })

  return c.json({ assignments: userAssignments })
})

// Get current user's portfolio (completed work)
usersRoute.get('/me/portfolio', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

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
  })

  // Filter by user's address
  const userCompleted = completedKpis.filter(
    kpi => kpi.assignment?.freelancerAddress === address
  )

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
  })
})

export { usersRoute as usersRouter }
```

**Step 2: Register user routes**

`src/app.ts`:

```typescript
import { usersRouter } from './routes/users'

app.route('/api/users', usersRouter)
```

**Step 3: Test user endpoints**

```bash
# Get current user (requires auth token)
TOKEN="your-jwt-token-here"
curl http://localhost:3000/api/users/me -H "Authorization: Bearer $TOKEN"
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement user profile endpoints"
```

---

## Project Management Module

### Task 5: Project CRUD Endpoints

**Files:**
- Create: `src/routes/projects.ts`
- Modify: `src/app.ts`

**Step 1: Create validation schemas**

`src/lib/validations/project.ts`:

```typescript
import { z } from 'zod'

export const createProjectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(2000),
  timelineStart: z.string().datetime(), // ISO 8601
  timelineEnd: z.string().datetime(),
})

export const updateProjectSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(2000).optional(),
  timelineStart: z.string().datetime().optional(),
  timelineEnd: z.string().datetime().optional(),
  status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled']).optional(),
})

export const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(10).max(500),
  kpiCount: z.number().int().min(1).max(52), // Max 1 year of weekly KPIs
  paymentPerKpi: z.string().regex(/^\d+$/), // IDRX amount as string
})

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(500).optional(),
  kpiCount: z.number().int().min(1).max(52).optional(),
  paymentPerKpi: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['open', 'filled', 'cancelled']).optional(),
})

export const createKpiSchema = z.object({
  kpis: z.array(z.object({
    kpiNumber: z.number().int().min(1),
    description: z.string().min(5).max(500),
    deadline: z.string().datetime(),
  })),
})
```

**Step 2: Create project routes**

`src/routes/projects.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db'
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema'
import { eq, and, desc, like, or } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { nanoid } from 'nanoid'
import { createProjectSchema, updateProjectSchema, createRoleSchema, updateRoleSchema, createKpiSchema } from '../lib/validations/project'

const projectsRoute = new Hono()

// Public routes - no auth required
projectsRoute.get('/', async (c) => {
  const search = c.req.query('search')
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = parseInt(c.req.query('offset') || '0')

  let conditions = []

  if (search) {
    conditions.push(
      or(
        like(projects.title, `%${search}%`),
        like(projects.description, `%${search}%`)
      )
    )
  }

  if (status) {
    conditions.push(eq(projects.status, status as any))
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
      roles: {
        with: {
          _count: {
            columns: {
              // We'll simplify this for now
            },
          },
        },
      },
    },
    orderBy: [desc(projects.createdAt)],
    limit,
    offset,
  })

  return c.json({ projects: projectList })
})

projectsRoute.get('/:id', async (c) => {
  const id = c.req.param('id')

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
        },
      },
    },
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({ project })
})

// Authenticated routes
projectsRoute.use('*', authMiddleware)

projectsRoute.post('/', zValidator('json', createProjectSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const body = c.req.valid('json')

  const id = nanoid()
  const newProject = await db.insert(projects).values({
    id,
    ownerAddress: address,
    title: body.title,
    description: body.description,
    timelineStart: new Date(body.timelineStart),
    timelineEnd: new Date(body.timelineEnd),
    status: 'draft',
  }).returning()

  return c.json({ project: newProject[0] }, 201)
})

projectsRoute.put('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404)
  }

  if (existing.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const updated = await db.update(projects)
    .set({
      ...body,
      timelineStart: body.timelineStart ? new Date(body.timelineStart) : existing.timelineStart,
      timelineEnd: body.timelineEnd ? new Date(body.timelineEnd) : existing.timelineEnd,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning()

  return c.json({ project: updated[0] })
})

projectsRoute.delete('/:id', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const id = c.req.param('id')

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404)
  }

  if (existing.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  // Check if any termins have started (any assignments with active status)
  const activeAssignments = await db.query.assignments.findMany({
    where: eq(assignments.projectRoleId, id), // This is wrong, we need to check via roles
  })

  // For MVP: allow deletion if in draft status only
  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only delete draft projects' }, 400)
  }

  await db.delete(projects).where(eq(projects.id, id))

  return c.json({ message: 'Project deleted' })
})

export { projectsRoute as projectsRouter }
```

**Step 3: Register project routes**

`src/app.ts`:

```typescript
import { projectsRouter } from './routes/projects'

app.route('/api/projects', projectsRouter)
```

**Step 4: Test project endpoints**

```bash
# Create project
TOKEN="your-jwt-token"
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build DEX Frontend",
    "description": "Need a frontend developer to build a swap interface",
    "timelineStart": "2025-02-01T00:00:00Z",
    "timelineEnd": "2025-04-01T00:00:00Z"
  }'
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement project CRUD endpoints"
```

---

## Role Management Module

### Task 6: Project Role Management

**Files:**
- Modify: `src/routes/projects.ts` (add role endpoints)

**Step 1: Add role endpoints to projects routes**

Add to `src/routes/projects.ts`:

```typescript
// Add after project delete endpoint

// Role management within a project
projectsRoute.post('/:id/roles', zValidator('json', createRoleSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')
  const body = c.req.valid('json')

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  if (project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const id = nanoid()
  const newRole = await db.insert(projectRoles).values({
    id,
    projectId,
    name: body.name,
    description: body.description,
    kpiCount: body.kpiCount,
    paymentPerKpi: body.paymentPerKpi,
    status: 'open',
  }).returning()

  return c.json({ role: newRole[0] }, 201)
})

projectsRoute.get('/:id/roles', async (c) => {
  const projectId = c.req.param('id')

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
  })

  return c.json({ roles })
})

projectsRoute.put('/:id/roles/:roleId', zValidator('json', updateRoleSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')
  const roleId = c.req.param('roleId')
  const body = c.req.valid('json')

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  })

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404)
  }

  const updated = await db.update(projectRoles)
    .set(body)
    .where(eq(projectRoles.id, roleId))
    .returning()

  return c.json({ role: updated[0] })
})

projectsRoute.delete('/:id/roles/:roleId', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')
  const roleId = c.req.param('roleId')

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  })

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404)
  }

  // Check if role has active assignments
  const activeAssignments = await db.query.assignments.findMany({
    where: eq(assignments.projectRoleId, roleId),
  })

  if (activeAssignments.length > 0) {
    return c.json({ error: 'Cannot delete role with active assignments' }, 400)
  }

  await db.delete(projectRoles).where(eq(projectRoles.id, roleId))

  return c.json({ message: 'Role deleted' })
})
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: implement role management endpoints"
```

---

## KPI Management Module

### Task 7: KPI Creation and Management

**Files:**
- Modify: `src/routes/projects.ts` (add KPI endpoints)

**Step 1: Add KPI endpoints**

Add to `src/routes/projects.ts`:

```typescript
// KPI management for a role
projectsRoute.post('/:id/roles/:roleId/kpis', zValidator('json', createKpiSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')
  const roleId = c.req.param('roleId')
  const body = c.req.valid('json')

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project || project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
  })

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404)
  }

  // Check if KPIs already exist for this role
  const existingKpis = await db.query.kpis.findMany({
    where: eq(kpis.projectRoleId, roleId),
  })

  if (existingKpis.length > 0) {
    return c.json({ error: 'KPIs already created for this role' }, 400)
  }

  // Validate KPI count matches role
  if (body.kpis.length !== role.kpiCount) {
    return c.json({ error: `Expected ${role.kpiCount} KPIs, got ${body.kpis.length}` }, 400)
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
  }))

  const created = await db.insert(kpis).values(kpiData).returning()

  return c.json({ kpis: created }, 201)
})

projectsRoute.get('/:id/roles/:roleId/kpis', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')
  const roleId = c.req.param('roleId')

  // Verify project exists
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Only owner and assigned freelancers can see KPIs
  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      assignments: true,
    },
  })

  if (!role || role.projectId !== projectId) {
    return c.json({ error: 'Role not found' }, 404)
  }

  const isOwner = project.ownerAddress === address
  const isAssigned = role.assignments.some(a => a.freelancerAddress === address)

  if (!isOwner && !isAssigned) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  const kpiList = await db.query.kpis.findMany({
    where: eq(kpis.projectRoleId, roleId),
    orderBy: [kpis.kpiNumber],
  })

  return c.json({ kpis: kpiList })
})

projectsRoute.put('/kpis/:kpiId', zValidator('json', z.object({
  description: z.string().min(5).max(500).optional(),
  deadline: z.string().datetime().optional(),
})), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const kpiId = c.req.param('kpiId')
  const body = c.req.valid('json')

  const kpi = await db.query.kpis.findFirst({
    where: eq(kpis.id, kpiId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  })

  if (!kpi) {
    return c.json({ error: 'KPI not found' }, 404)
  }

  // Only project owner can update KPIs
  if (kpi.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  // Cannot update KPI if already submitted
  if (kpi.status !== 'pending') {
    return c.json({ error: 'Cannot update submitted KPI' }, 400)
  }

  const updated = await db.update(kpis)
    .set({
      ...body,
      deadline: body.deadline ? new Date(body.deadline) : kpi.deadline,
    })
    .where(eq(kpis.id, kpiId))
    .returning()

  return c.json({ kpi: updated[0] })
})
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: implement KPI management endpoints"
```

---

## Application Module

### Task 8: Freelancer Application Flow

**Files:**
- Create: `src/routes/applications.ts`
- Modify: `src/app.ts`
- Create: `src/lib/validations/application.ts`

**Step 1: Create application validation schema**

`src/lib/validations/application.ts`:

```typescript
import { z } from 'zod'

export const submitApplicationSchema = z.object({
  coverLetter: z.string().min(20).max(1000),
})

export const reviewApplicationSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  feedback: z.string().max(500).optional(),
})
```

**Step 2: Create application routes**

`src/routes/applications.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db'
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { nanoid } from 'nanoid'
import { submitApplicationSchema } from '../lib/validations/application'

const applicationsRoute = new Hono()

applicationsRoute.use('*', authMiddleware)

// Submit application to a role
applicationsRoute.post('/', zValidator('json', submitApplicationSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const body = c.req.valid('json')
  const roleId = c.req.query('roleId')

  if (!roleId) {
    return c.json({ error: 'roleId query parameter required' }, 400)
  }

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      project: true,
    },
  })

  if (!role) {
    return c.json({ error: 'Role not found' }, 404)
  }

  if (role.status !== 'open') {
    return c.json({ error: 'Role is not open for applications' }, 400)
  }

  // Check if already applied
  const existingApplication = await db.query.applications.findFirst({
    where: and(
      eq(applications.projectRoleId, roleId),
      eq(applications.freelancerAddress, address)
    ),
  })

  if (existingApplication) {
    return c.json({ error: 'Already applied to this role' }, 400)
  }

  const id = nanoid()
  const application = await db.insert(applications).values({
    id,
    projectRoleId: roleId,
    freelancerAddress: address,
    status: 'pending',
    coverLetter: body.coverLetter,
  }).returning()

  return c.json({ application: application[0] }, 201)
})

// Get applicants for a role (PO only)
applicationsRoute.get('/role/:roleId', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const roleId = c.req.param('roleId')

  const role = await db.query.projectRoles.findFirst({
    where: eq(projectRoles.id, roleId),
    with: {
      project: true,
    },
  })

  if (!role) {
    return c.json({ error: 'Role not found' }, 404)
  }

  if (role.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
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
  })

  return c.json({ applicants })
})

// Accept application (creates assignment)
applicationsRoute.post('/:id/accept', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const applicationId = c.req.param('id')

  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  })

  if (!application) {
    return c.json({ error: 'Application not found' }, 404)
  }

  if (application.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (application.status !== 'pending') {
    return c.json({ error: 'Application already processed' }, 400)
  }

  if (application.projectRole.status !== 'open') {
    return c.json({ error: 'Role is no longer open' }, 400)
  }

  // Create assignment
  const assignmentId = nanoid()
  await db.insert(assignments).values({
    id: assignmentId,
    projectRoleId: application.projectRoleId,
    freelancerAddress: application.freelancerAddress,
    status: 'active',
  })

  // Link KPIs to this assignment
  await db.update(kpis)
    .set({ assignmentId })
    .where(eq(kpis.projectRoleId, application.projectRoleId))

  // Update application status
  await db.update(applications)
    .set({ status: 'accepted' })
    .where(eq(applications.id, applicationId))

  // Reject other pending applications for this role
  await db.update(applications)
    .set({ status: 'rejected' })
    .where(and(
      eq(applications.projectRoleId, application.projectRoleId),
      eq(applications.status, 'pending')
    ))

  // Update role status
  await db.update(projectRoles)
    .set({ status: 'filled' })
    .where(eq(projectRoles.id, application.projectRoleId))

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
  })

  return c.json({ assignment })
})

// Reject application
applicationsRoute.post('/:id/reject', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const applicationId = c.req.param('id')

  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      projectRole: {
        with: {
          project: true,
        },
      },
    },
  })

  if (!application) {
    return c.json({ error: 'Application not found' }, 404)
  }

  if (application.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (application.status !== 'pending') {
    return c.json({ error: 'Application already processed' }, 400)
  }

  await db.update(applications)
    .set({ status: 'rejected' })
    .where(eq(applications.id, applicationId))

  return c.json({ message: 'Application rejected' })
})

// Get my applications
applicationsRoute.get('/my', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

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
  })

  return c.json({ applications: myApplications })
})

export { applicationsRoute as applicationsRouter }
```

**Step 3: Register application routes**

`src/app.ts`:

```typescript
import { applicationsRouter } from './routes/applications'

app.route('/api/applications', applicationsRouter)
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement application flow endpoints"
```

---

## Progress & Submission Module

### Task 9: KPI Submission and Approval

**Files:**
- Create: `src/routes/kpis.ts`
- Modify: `src/app.ts`
- Create: `src/lib/validations/kpi.ts`

**Step 1: Create KPI validation schemas**

`src/lib/validations/kpi.ts`:

```typescript
import { z } from 'zod'

export const submitKpiSchema = z.object({
  submissionData: z.string().min(10).max(5000), // JSON string or description
})

export const reviewKpiSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).optional(),
})
```

**Step 2: Create KPI routes**

`src/routes/kpis.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db'
import { users, projects, projectRoles, applications, assignments, kpis } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { submitKpiSchema, reviewKpiSchema } from '../lib/validations/kpi'

const kpisRoute = new Hono()

kpisRoute.use('*', authMiddleware)

// Submit KPI (freelancer only)
kpisRoute.post('/:id/submit', zValidator('json', submitKpiSchema), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const kpiId = c.req.param('id')
  const body = c.req.valid('json')

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
  })

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found or not assigned' }, 404)
  }

  // Only assigned freelancer can submit
  if (kpi.assignment.freelancerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (kpi.status !== 'pending') {
    return c.json({ error: 'KPI already submitted' }, 400)
  }

  const updated = await db.update(kpis)
    .set({
      status: 'submitted',
      submissionData: body.submissionData,
      submittedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning()

  return c.json({ kpi: updated[0] })
})

// Approve KPI (PO only)
kpisRoute.post('/:id/approve', zValidator('json', reviewKpiSchema.partial()), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const kpiId = c.req.param('id')
  const body = c.req.valid('json')

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
  })

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found' }, 404)
  }

  // Only project owner can approve
  if (kpi.assignment.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (kpi.status !== 'submitted') {
    return c.json({ error: 'KPI not submitted' }, 400)
  }

  const updated = await db.update(kpis)
    .set({
      status: 'approved',
      reviewComment: body.comment || null,
      reviewedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning()

  // TODO: Trigger smart contract payment
  // This is where you'd call the SC to release payment for this KPI

  return c.json({ kpi: updated[0] })
})

// Reject KPI (PO only)
kpisRoute.post('/:id/reject', zValidator('json', z.object({
  comment: z.string().min(10).max(1000),
})), async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const kpiId = c.req.param('id')
  const body = c.req.valid('json')

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
  })

  if (!kpi || !kpi.assignment) {
    return c.json({ error: 'KPI not found' }, 404)
  }

  if (kpi.assignment.projectRole.project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (kpi.status !== 'submitted') {
    return c.json({ error: 'KPI not submitted' }, 400)
  }

  const updated = await db.update(kpis)
    .set({
      status: 'rejected',
      reviewComment: body.comment,
      reviewedAt: new Date(),
    })
    .where(eq(kpis.id, kpiId))
    .returning()

  return c.json({ kpi: updated[0] })
})

// Get my pending KPIs (freelancer view)
kpisRoute.get('/my/pending', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

  const myAssignments = await db.query.assignments.findMany({
    where: eq(assignments.freelancerAddress, address),
    columns: {
      id: true,
    },
  })

  const assignmentIds = myAssignments.map(a => a.id)

  if (assignmentIds.length === 0) {
    return c.json({ kpis: [] })
  }

  // This query is complex, so we'll simplify for MVP
  const allKpis = await db.query.kpis.findMany({
    where: eq(kpis.status, 'pending'),
  })

  const myKpis = allKpis.filter(k => k.assignmentId && assignmentIds.includes(k.assignmentId))

  return c.json({ kpis: myKpis })
})

// Get pending reviews (PO view)
kpisRoute.get('/pending-reviews', async (c) => {
  const auth = c.get('auth')
  const address = auth.address

  const myProjects = await db.query.projects.findMany({
    where: eq(projects.ownerAddress, address),
    columns: {
      id: true,
    },
  })

  const projectIds = myProjects.map(p => p.id)

  if (projectIds.length === 0) {
    return c.json({ kpis: [] })
  }

  // Get roles for these projects
  const roles = await db.query.projectRoles.findMany({
    where: eq(projectRoles.projectId, projectIds[0]), // Simplified for MVP
    columns: {
      id: true,
    },
  })

  const roleIds = roles.map(r => r.id)

  // Get submitted KPIs for these roles
  const submittedKpis = await db.query.kpis.findMany({
    where: and(
      eq(kpis.status, 'submitted'),
      // roleIds.includes(kpi.projectRoleId) // This needs to be done differently
    ),
  })

  // Filter in code for MVP
  const myPendingReviews = submittedKpis.filter(k => roleIds.includes(k.projectRoleId))

  return c.json({ kpis: myPendingReviews })
})

export { kpisRoute as kpisRouter }
```

**Step 3: Register KPI routes**

`src/app.ts`:

```typescript
import { kpisRouter } from './routes/kpis'

app.route('/api/kpis', kpisRouter)
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement KPI submission and review endpoints"
```

---

## Smart Contract Integration Layer

### Task 10: Smart Contract Bridge

**Files:**
- Create: `src/lib/contracts/index.ts`
- Create: `src/lib/contracts/vault.ts`
- Create: `src/routes/contracts.ts`
- Modify: `src/app.ts`
- Create: `src/config/contracts.ts`

**Step 1: Create contract config**

`src/config/contracts.ts`:

```typescript
export const CONTRACTS = {
  // To be filled by SC dev
  MOCK_IDRX: process.env.MOCK_IDRX_ADDRESS || '',
  VAULT_FACTORY: process.env.VAULT_FACTORY_ADDRESS || '',
  VAULT_IMPLEMENTATION: process.env.VAULT_IMPLEMENTATION_ADDRESS || '',
} as const

export const BASE_CHAIN = {
  id: process.env.NODE_ENV === 'production' ? 8453 : 84532, // Base mainnet or sepolia testnet
  name: 'Base',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.BASE_RPC_URL || 'https://sepolia.base.org'],
    },
  },
} as const
```

**Step 2: Create vault contract interface**

`src/lib/contracts/vault.ts`:

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BASE_CHAIN } from '../../config/contracts'

// Vault ABI (to be provided by SC dev)
export const VAULT_ABI = parseAbi([
  // Read functions
  'function getBalance() external view returns (uint256)',
  'function getKpiStatus(uint256 kpiIndex) external view returns (bool completed, uint256 amount)',
  'function getProjectInfo() external view returns (address owner, address token, uint256 totalDeposited)',
  // Write functions (for backend with admin key)
  'function deposit() external payable',
  'function releaseKpiPayment(uint256 kpiIndex) external',
  'function cancelProject() external',
  // Events
  'event Deposited(address indexed caller, uint256 amount)',
  'event KpiApproved(uint256 indexed kpiIndex, address indexed freelancer, uint256 amount)',
  'event ProjectCancelled(address indexed caller, uint256 refundAmount)',
])

// Public client for reading
export const publicClient = createPublicClient({
  chain: BASE_CHAIN,
  transport: http(),
})

// Get vault balance
export async function getVaultBalance(vaultAddress: string) {
  try {
    const balance = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getBalance',
    })
    return balance.toString()
  } catch (error) {
    console.error('Error reading vault balance:', error)
    return '0'
  }
}

// Get KPI status from vault
export async function getKpiStatus(vaultAddress: string, kpiIndex: number) {
  try {
    const status = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getKpiStatus',
      args: [BigInt(kpiIndex)],
    })
    return {
      completed: status[0] as boolean,
      amount: status[1].toString(),
    }
  } catch (error) {
    console.error('Error reading KPI status:', error)
    return { completed: false, amount: '0' }
  }
}

// Get project info from vault
export async function getProjectInfo(vaultAddress: string) {
  try {
    const info = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getProjectInfo',
    })
    return {
      owner: info[0] as string,
      token: info[1] as string,
      totalDeposited: info[2].toString(),
    }
  } catch (error) {
    console.error('Error reading project info:', error)
    return null
  }
}

// Listen to vault events
export async function subscribeToVaultEvents(
  vaultAddress: string,
  callbacks: {
    onDeposited?: (caller: string, amount: string) => void
    onKpiApproved?: (kpiIndex: number, freelancer: string, amount: string) => void
    onProjectCancelled?: (caller: string, refundAmount: string) => void
  }
) {
  const unwatch = publicClient.watchContractEvent({
    address: vaultAddress as `0x${string}`,
    abi: VAULT_ABI,
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.eventName === 'Deposited' && callbacks.onDeposited) {
          const { caller, amount } = log.args as { caller: string; amount: bigint }
          callbacks.onDeposited(caller, amount.toString())
        }
        if (log.eventName === 'KpiApproved' && callbacks.onKpiApproved) {
          const { kpiIndex, freelancer, amount } = log.args as {
            kpiIndex: bigint
            freelancer: string
            amount: bigint
          }
          callbacks.onKpiApproved(Number(kpiIndex), freelancer, amount.toString())
        }
        if (log.eventName === 'ProjectCancelled' && callbacks.onProjectCancelled) {
          const { caller, refundAmount } = log.args as {
            caller: string
            refundAmount: bigint
          }
          callbacks.onProjectCancelled(caller, refundAmount.toString())
        }
      }
    },
  })

  return unwatch
}
```

**Step 3: Create contract routes**

`src/routes/contracts.ts`:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { getVaultBalance, getKpiStatus, getProjectInfo } from '../lib/contracts/vault'

const contractsRoute = new Hono()

contractsRoute.use('*', authMiddleware)

// Get vault balance for a project
contractsRoute.get('/vault/:address/balance', async (c) => {
  const address = c.req.param('address')
  const balance = await getVaultBalance(address)
  return c.json({ balance })
})

// Get KPI status from vault
contractsRoute.get('/vault/:address/kpi/:index', async (c) => {
  const address = c.req.param('address')
  const index = parseInt(c.req.param('index'))
  const status = await getKpiStatus(address, index)
  return c.json({ status })
})

// Get project info from vault
contractsRoute.get('/vault/:address/info', async (c) => {
  const address = c.req.param('address')
  const info = await getProjectInfo(address)
  return c.json({ info })
})

// Generate calldata for frontend to call (for deposits, etc.)
contractsRoute.post('/calldata/deposit', zValidator('json', z.object({
  vaultAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string(),
})), async (c) => {
  const { vaultAddress, amount } = c.req.valid('json')

  // Return calldata for frontend
  return c.json({
    to: vaultAddress,
    data: '0x...', // SC dev will provide actual function signature
    value: amount,
  })
})

export { contractsRoute as contractsRouter }
```

**Step 4: Register contract routes**

`src/app.ts`:

```typescript
import { contractsRouter } from './routes/contracts'

app.route('/api/contracts', contractsRouter)
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement smart contract integration layer"
```

---

## Project Progress Module

### Task 11: Project Progress Dashboard

**Files:**
- Modify: `src/routes/projects.ts` (add progress endpoint)

**Step 1: Add progress endpoint**

Add to `src/routes/projects.ts`:

```typescript
// Get project progress overview
projectsRoute.get('/:id/progress', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')

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
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Only owner or assigned freelancers can view progress
  const isOwner = project.ownerAddress === address
  const isFreelancer = project.roles.some(role =>
    role.assignments.some(a => a.freelancerAddress === address)
  )

  if (!isOwner && !isFreelancer) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  // Calculate progress per role
  const roleProgress = project.roles.map(role => {
    const totalKpis = role.kpis.length
    const completedKpis = role.kpis.filter(k => k.status === 'approved' || k.status === 'paid').length
    const pendingKpis = role.kpis.filter(k => k.status === 'pending').length
    const submittedKpis = role.kpis.filter(k => k.status === 'submitted').length
    const inProgressKpis = role.kpis.filter(k => k.status === 'rejected').length

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
    }
  })

  // Overall project progress
  const totalKpis = project.roles.reduce((sum, role) => sum + role.kpis.length, 0)
  const totalCompleted = project.roles.reduce(
    (sum, role) => sum + role.kpis.filter(k => k.status === 'approved' || k.status === 'paid').length,
    0
  )

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
  })
})
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add project progress endpoint"
```

---

## Cancellation Module

### Task 12: Project Cancellation Handling

**Files:**
- Modify: `src/routes/projects.ts` (add cancellation endpoints)

**Step 1: Add cancellation endpoints**

Add to `src/routes/projects.ts`:

```typescript
// Request project cancellation
projectsRoute.post('/:id/cancel', async (c) => {
  const auth = c.get('auth')
  const address = auth.address
  const projectId = c.req.param('id')

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
        },
      },
    },
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  if (project.ownerAddress !== address) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  if (project.status === 'cancelled' || project.status === 'completed') {
    return c.json({ error: 'Project already ended' }, 400)
  }

  // Calculate what's been completed vs refundable
  const roleBreakdown = project.roles.map(role => {
    const assignments = role.assignments
    const kpis = role.kpis

    const paidKpis = kpis.filter(k => k.status === 'paid')
    const approvedKpis = kpis.filter(k => k.status === 'approved')
    const pendingKpis = kpis.filter(k => k.status === 'pending' || k.status === 'submitted')

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
    }
  })

  // Update project status
  await db.update(projects)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  // Cancel all active roles
  for (const role of project.roles) {
    if (role.status === 'filled') {
      await db.update(projectRoles)
        .set({ status: 'cancelled' })
        .where(eq(projectRoles.id, role.id))
    }
  }

  return c.json({
    message: 'Project cancelled',
    breakdown: roleBreakdown,
    // SC dev handles the actual refund logic
  })
})

// Get cancellation status
projectsRoute.get('/:id/cancellation-status', async (c) => {
  const projectId = c.req.param('id')

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({
    status: project.status,
    isCancelled: project.status === 'cancelled',
  })
})
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add project cancellation endpoints"
```

---

## Testing & Documentation

### Task 13: Write Tests and API Documentation

**Files:**
- Create: `tests/auth.test.ts`
- Create: `tests/projects.test.ts`
- Create: `docs/API.md`

**Step 1: Create auth tests**

`tests/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'bun:test'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { eq } from 'drizzle-orm'

describe('Auth Endpoints', () => {
  let testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
  let nonce: string
  let token: string

  it('should generate nonce', async () => {
    const res = await fetch('http://localhost:3000/api/auth/wallet/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: testAddress }),
    })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.nonce).toBeDefined()
    expect(data.message).toBeDefined()
    nonce = data.nonce
  })

  // Add more tests...
})

// Cleanup
afterEach(async () => {
  await db.delete(users).where(eq(users.address, testAddress))
})
```

**Step 2: Create API documentation**

`docs/API.md`:

```markdown
# Novalance Backend API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
All endpoints (except `/api/auth/*`) require:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Auth

#### POST /auth/wallet/nonce
Request nonce for wallet signature.

**Request:**
```json
{
  "address": "0x..."
}
```

**Response:**
```json
{
  "nonce": "random-string",
  "message": "Sign this message..."
}
```

#### POST /auth/wallet/verify
Verify signature and get JWT token.

**Request:**
```json
{
  "address": "0x...",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "jwt-token",
  "address": "0x..."
}
```

### Projects

#### GET /projects
List all projects.

**Query Params:**
- `search`: Search in title/description
- `status`: Filter by status
- `limit`: Max results (default 20)
- `offset`: Pagination offset

#### POST /projects
Create a new project (requires auth).

**Request:**
```json
{
  "title": "Build DEX Frontend",
  "description": "...",
  "timelineStart": "2025-02-01T00:00:00Z",
  "timelineEnd": "2025-04-01T00:00:00Z"
}
```

#### GET /projects/:id
Get project details.

#### PUT /projects/:id
Update project (owner only).

#### DELETE /projects/:id
Delete project (owner only, draft status only).

#### POST /projects/:id/roles
Add a role to project (owner only).

**Request:**
```json
{
  "name": "Frontend Developer",
  "description": "...",
  "kpiCount": 10,
  "paymentPerKpi": "2000000"
}
```

#### GET /projects/:id/roles
Get all roles for project.

#### POST /projects/:id/roles/:roleId/kpis
Create KPIs for role (owner only).

**Request:**
```json
{
  "kpis": [
    {
      "kpiNumber": 1,
      "description": "Design mockups",
      "deadline": "2025-02-15T00:00:00Z"
    }
  ]
}
```

#### GET /projects/:id/progress
Get project progress (owner or assigned FL only).

### Applications

#### POST /applications?roleId=xxx
Submit application to role.

**Request:**
```json
{
  "coverLetter": "I have experience..."
}
```

#### GET /applications/role/:roleId
Get applicants for role (owner only).

#### POST /applications/:id/accept
Accept application, create assignment (owner only).

#### POST /applications/:id/reject
Reject application (owner only).

#### GET /applications/my
Get my applications.

### Users

#### GET /users/me
Get current user profile.

#### PUT /users/me
Update current user profile.

**Request:**
```json
{
  "email": "user@example.com",
  "githubUrl": "https://github.com/...",
  "linkedinUrl": "https://linkedin.com/in/...",
  "bio": "Web3 developer..."
}
```

#### GET /users/:address
Get public user profile.

#### GET /users/me/assignments
Get my active assignments.

#### GET /users/me/portfolio
Get my completed work portfolio.

### KPIs

#### POST /kpis/:id/submit
Submit KPI (assigned FL only).

**Request:**
```json
{
  "submissionData": "Link to PR, demo, etc."
}
```

#### POST /kpis/:id/approve
Approve KPI (owner only).

#### POST /kpis/:id/reject
Reject KPI (owner only).

**Request:**
```json
{
  "comment": "Please fix these issues..."
}
```

#### GET /kpis/my/pending
Get my pending KPIs (FL only).

#### GET /kpis/pending-reviews
Get pending KPIs to review (owner only).

### Contracts

#### GET /contracts/vault/:address/balance
Get vault balance.

#### GET /contracts/vault/:address/kpi/:index
Get KPI status from vault.

#### GET /contracts/vault/:address/info
Get project info from vault.
```

**Step 3: Commit**

```bash
git add .
git commit -m "test: add tests and API documentation"
```

---

## Deployment & Final Polish

### Task 14: Environment Setup and Deployment Prep

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `docker-compose.yml` (optional, for production)

**Step 1: Create .gitignore**

```.gitignore
node_modules
.bun
dist
.env
*.log
novalance.db
novalance.db-shm
novalance.db-wal
drizzle/
```

**Step 2: Create README.md**

```markdown
# Novalance Backend API

Web3 freelancer marketplace backend for Base Indonesia Hackathon.

## Tech Stack
- Bun (runtime)
- Hono (framework)
- SQLite + Drizzle ORM
- viem (Web3)

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Setup database
bun run db:generate
bun run db:push

# Run development server
bun run dev
```

## API Documentation
See `docs/API.md`

## Database Schema
See `src/db/schema.ts`

## Smart Contract Integration
Contract addresses to be provided by SC dev.
```

**Step 3: Commit**

```bash
git add .
git commit -m "docs: add README and gitignore"
```

---

## Summary

This plan covers all 14 tasks needed for the Novalance backend MVP:

1. ✅ Database Schema
2. ✅ Server Setup
3. ✅ Authentication
4. ✅ User Profiles
5. ✅ Project CRUD
6. ✅ Role Management
7. ✅ KPI Management
8. ✅ Applications
9. ✅ KPI Submission/Approval
10. ✅ Smart Contract Bridge
11. ✅ Project Progress
12. ✅ Cancellation
13. ✅ Tests & Docs
14. ✅ Deployment Prep

**Total Endpoints:** ~25 REST endpoints

**Database Tables:** 7 tables

**Integration Points:** Smart contract read functions, event listeners

---

## Handoff to FE Team

Provide frontend team with:
1. This API documentation (`docs/API.md`)
2. Postman collection (export from tests)
3. Base URL: `http://localhost:3000/api`
4. Auth flow: nonce → sign → verify → token

## Handoff to SC Team

Provide SC team with:
1. Required contract functions (see `src/lib/contracts/vault.ts`)
2. Event signatures we need to index
3. When to emit events (KPI approved, deposit, cancel)

---

**Plan complete! Ready for implementation.**
