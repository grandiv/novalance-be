// Vercel serverless function handler for Hono
import { handle } from '@hono/vercel';
import app from '../dist/app.js';
import { getDb } from '../dist/db/index.js';

// Get database instance
const db = getDb();

// Bind database to context
app.use('/*', async (c, next) => {
  c.set('db', db);
  await next();
});

// Export the Vercel handler
export const config = {
  api: {
    bodyParser: false,
  },
};

export default handle(app);
