import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Hono } from 'hono';

// Create Hono app instance
const app = new Hono();

// CORS middleware - allow frontend origins
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Logger middleware
app.use('/*', logger());

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Novalance API v1.0'
  });
});

// API routes
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

export default app;
