import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { getDb } from './db';
import app from './app';

const db = getDb();

// Bind database to context
app.use('/*', async (c, next) => {
  (c as any).set('db', db);
  await next();
});

const port = parseInt(process.env.PORT || '3000', 10);

// For Vercel deployment
export default app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`🚀 Novalance API running on http://localhost:${port}`);
}
