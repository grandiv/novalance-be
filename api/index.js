import { Hono } from 'hono';
import { getD1Db } from '../src/db';
import app from '../src/app';
// Vercel Edge Runtime entry point with D1 binding
const serverless = new Hono();
// Bind D1 from environment to all requests
serverless.use('/*', async (c, next) => {
    const db = getD1Db(c.env.DB);
    c.set('db', db);
    await next();
});
// Proxy all routes to main app
serverless.route('/', app);
// Vercel Edge Runtime handler
export default serverless;
