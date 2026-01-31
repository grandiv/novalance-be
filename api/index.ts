import { serve } from '@hono/node-server';
import app from '../src/app';

// Vercel Edge Function handler for Node.js runtime
export const runtime = 'nodejs';

// Bind local SQLite database for serverless
import { getLocalDb } from '../src/db';
const db = getLocalDb();

app.use('/*', async (c, next) => {
  (c as any).set('db', db);
  await next();
});

export default app;
