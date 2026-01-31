import { Hono } from 'hono';
import { getLocalDb } from '../src/db';
import app from '../src/app';

// Vercel needs the app to be the default export
export default app;
