# Vercel + Cloudflare D1 Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy NovaLance backend to Vercel with Cloudflare D1 database for hackathon demo.

**Architecture:** Hono app running as Vercel serverless function with D1 HTTP driver for database access.

**Tech Stack:** Vercel (deployment), Cloudflare D1 (SQLite database), Drizzle ORM (D1 HTTP driver)

---

## Overview

This migration will:
1. Keep using Hono framework (Vercel supports it natively)
2. Migrate from local SQLite (`better-sqlite3`) to Cloudflare D1 (HTTP-based SQLite)
3. Deploy backend to Vercel with free tier
4. Set up continuous deployment from GitHub

**Estimated Time:** 45-60 minutes

---

## Task 1: Set Up Vercel Configuration

**Files:**
- Create: `vercel.json`
- Modify: `package.json`

**Step 1: Create Vercel config file**

Create `vercel.json` in project root:

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

**Step 2: Update package.json**

Add/modify scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "vercel-build": "npm run build"
  }
}
```

**Step 3: Install TypeScript if not present**

```bash
npm install -D typescript @types/node
```

**Step 4: Create tsconfig.json**

Create or update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Commit**

```bash
git add vercel.json package.json tsconfig.json
git commit -m "feat: add Vercel configuration"
```

---

## Task 2: Create Cloudflare D1 Database

**Prerequisites:** Cloudflare account (free)

**Step 1: Install Wrangler CLI**

```bash
npm install -g wrangler
wrangler login
```

This opens a browser for Cloudflare authentication.

**Step 2: Create D1 database**

```bash
wrangler d1 create novalance-db
```

**Save the output:** You'll get a `database_id` like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Step 3: Note your Account ID**

```bash
wrangler whoami
```

Copy your `Account ID` for environment variables.

**Step 4: Create wrangler.toml (for local D1 testing)**

Create `wrangler.toml`:

```toml
name = "novalance-be"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "novalance-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

Replace `YOUR_DATABASE_ID_HERE` with your actual database ID.

**Step 5: Commit**

```bash
git add wrangler.toml
git commit -m "feat: add Cloudflare D1 configuration"
```

---

## Task 3: Update Drizzle Config for D1

**Files:**
- Modify: `drizzle.config.ts`
- Modify: `package.json`

**Step 1: Install D1 driver dependencies**

```bash
npm install @cloudflare/workers-types
```

**Step 2: Update drizzle.config.ts**

Replace the existing config with:

```typescript
import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    databaseId: process.env.D1_DATABASE_ID || '',
  },
} satisfies Config;
```

**Step 3: Commit**

```bash
git add drizzle.config.ts package.json
git commit -m "feat: configure Drizzle for Cloudflare D1"
```

---

## Task 4: Create D1-Compatible Database Connection

**Files:**
- Modify: `src/db/index.ts`
- Create: `src/types.ts`

**Step 1: Create types file for D1**

Create `src/types.ts`:

```typescript
import type { DrizzleD1Database } from 'drizzle-orm/d1';

export interface Env {
  DB: D1Database;
  CLOUDFLARE_ACCOUNT_ID: string;
  D1_DATABASE_ID: string;
}
```

**Step 2: Update database connection**

Modify `src/db/index.ts`:

```typescript
import { drizzle } from 'drizzle-orm/d1-http';
import { betterSqlite3 } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// For local development with SQLite
let _db: betterSqlite3.Database | null = null;

export function getLocalDb() {
  if (_db) return _db;
  const sqlite = new Database('novalance.db');
  _db = drizzle(sqlite, { schema });
  return _db;
}

// For D1 (production)
export function getD1Db(d1: D1Database) {
  return drizzle(d1, { schema });
}
```

**Step 3: Update src/app.ts to support both environments**

Modify `src/app.ts` to export the app for serverless use:

```typescript
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Hono } from 'hono';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://nova-lance.vercel.app'],
  credentials: true,
}));

app.use('/*', logger());

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Novalance API v1.0'
  });
});

export default app;
```

**Step 4: Update src/index.ts for local development**

Modify `src/index.ts`:

```typescript
import { serve } from '@hono/node-server';
import app from './app';
import { getLocalDb } from './db';

// Make local db available to routes
app.use('/*', async (c, next) => {
  c.set('db', getLocalDb());
  await next();
});

// Register routes
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { projectsRouter } from './routes/projects';
import { applicationsRouter } from './routes/applications';
import { kpisRouter } from './routes/kpis';
import { contractsRouter } from './routes/contracts';

app.route('/api/auth', authRouter);
app.route('/api/users', usersRouter);
app.route('/api/projects', projectsRouter);
app.route('/api/applications', applicationsRouter);
app.route('/api/kpis', kpisRouter);
app.route('/api/contracts', contractsRouter);

const port = parseInt(process.env.PORT || '3000', 10);

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Novalance API running on http://localhost:${port}`);
```

**Step 5: Commit**

```bash
git add src/db/index.ts src/app.ts src/index.ts src/types.ts
git commit -m "feat: add D1 database connection support"
```

---

## Task 5: Push Schema to D1

**Step 1: Generate schema SQL**

```bash
npm run db:generate
```

This generates SQL in `drizzle/` directory.

**Step 2: Push schema to D1**

Option A - Using Wrangler (recommended):
```bash
wrangler d1 execute novalance-db --file=./drizzle/0000_snapshot.sql
```

Option B - Using Drizzle push:
```bash
npm run db:push
```

**Step 3: Verify D1 schema**

```bash
wrangler d1 execute novalance-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Should see: `users`, `projects`, `project_roles`, `applications`, `assignments`, `kpis`, `transactions`

**Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat: generate and push schema to D1"
```

---

## Task 6: Create Vercel Serverless Entry Point

**Files:**
- Create: `api/index.ts`

**Step 1: Create serverless entry point**

Create `api/index.ts`:

```typescript
import { Hono } from 'hono';
import { getD1Db } from '../src/db';
import app from '../src/app';
import type { Env } from '../src/types';

const serverless = new Hono<{ Bindings: Env }>();

// Bind D1 from environment
serverless.use('/*', async (c, next) => {
  const db = getD1Db(c.env.DB);
  c.set('db', db);
  await next();
});

// Proxy all routes to main app
serverless.route('/', app);

// Vercel Edge Runtime handler
export default serverless;
```

**Step 2: Commit**

```bash
git add api/
git commit -m "feat: add Vercel serverless entry point"
```

---

## Task 7: Configure Environment Variables and Deploy

**Step 1: Install Vercel CLI**

```bash
npm install -g vercel
vercel login
```

**Step 2: Set environment variables**

Add these in Vercel dashboard or via CLI:

```bash
vercel env add CLOUDFLARE_ACCOUNT_ID
vercel env add D1_DATABASE_ID
```

Or set in `.env` for Vercel to pick up:

```
CLOUDFLARE_ACCOUNT_ID=your_account_id
D1_DATABASE_ID=your_database_id
```

**Step 3: Deploy to preview**

```bash
vercel
```

**Step 4: Test the deployment**

Visit the preview URL and test:
```bash
curl https://your-preview-url.vercel.app/
```

Should return: `{"status":"ok","message":"Novalance API v1.0"}`

**Step 5: Deploy to production**

```bash
vercel --prod
```

**Step 6: Update FE API URL**

Update your frontend's `.env` or API config to point to the new Vercel URL:
```
NEXT_PUBLIC_API_URL=https://your-vercel-app.vercel.app
```

**Step 7: Commit**

```bash
git add .env .gitignore
git commit -m "feat: configure Vercel environment"
```

---

## Summary

After completing all tasks:

| Task | Description | Time |
|------|-------------|------|
| 1 | Vercel configuration | 5 min |
| 2 | D1 database setup | 10 min |
| 3 | Drizzle config update | 5 min |
| 4 | D1 connection code | 15 min |
| 5 | Push schema to D1 | 5 min |
| 6 | Serverless entry point | 5 min |
| 7 | Deploy to Vercel | 10 min |

**Total:** ~55 minutes

---

## Testing Checklist

After deployment, verify:
- [ ] Health check endpoint returns 200
- [ ] Auth endpoint works (wallet nonce)
- [ ] Projects listing works
- [ ] Database queries return data
- [ ] CORS allows frontend requests

---

## Rollback Plan

If issues arise:
1. Local development still works with `npm run dev`
2. Can revert commits to restore SQLite setup
3. Vercel previews allow testing before production
