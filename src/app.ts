import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import type { Env } from './types.js';

// Create Hono app instance with Env bindings
const app = new Hono<{ Bindings: Env }>();

// CORS middleware - allow frontend origins
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://nova-lance.vercel.app', 'https://novalance-be.vercel.app'],
  credentials: true,
}));

// Logger middleware
app.use('/*', logger());

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Novalance API v1.0',
    docs: '/api-docs'
  });
});

// Swagger UI documentation
app.get('/api-docs', swaggerUI({
  url: '/api/swagger.json',
}));

// OpenAPI JSON spec
app.get('/api/swagger.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'NovaLance API',
      version: '1.0.0',
      description: 'Web3 Freelancer Marketplace API for Base Indonesia Hackathon',
    },
    servers: [
      { url: 'https://novalance-be.vercel.app', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local Development' },
    ],
    paths: {
      '/api/auth/wallet/nonce': {
        post: {
          tags: ['Authentication'],
          summary: 'Generate nonce for wallet signature',
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] }
              }
            }
          },
          responses: {
            '200': { description: 'Nonce generated successfully' }
          }
        }
      },
      '/api/auth/wallet/verify': {
        post: {
          tags: ['Authentication'],
          summary: 'Verify wallet signature and return JWT token',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { address: { type: 'string' }, signature: { type: 'string' } },
                  required: ['address', 'signature']
                }
              }
            }
          },
          responses: {
            '200': { description: 'JWT token returned' }
          }
        }
      },
      '/api/users/me': {
        get: {
          tags: ['Users'],
          summary: 'Get current user profile',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'User profile' }
          }
        }
      },
      '/api/users/me/balance': {
        get: {
          tags: ['Users'],
          summary: 'Get FL available balance',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'Balance breakdown' }
          }
        }
      },
      '/api/users/me/project-balances': {
        get: {
          tags: ['Users'],
          summary: 'Get PO project balances',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'Project balances' }
          }
        }
      },
      '/api/users/me/earnings': {
        get: {
          tags: ['Users'],
          summary: 'Get earnings summary',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } }
          ],
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'Earnings data' }
          }
        }
      },
      '/api/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List all projects',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'skills', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'number' } },
            { name: 'offset', in: 'query', schema: { type: 'number' } }
          ],
          responses: {
            '200': { description: 'Projects list' }
          }
        },
        post: {
          tags: ['Projects'],
          summary: 'Create new project',
          security: [{ BearerAuth: [] }],
          responses: {
            '201': { description: 'Project created' }
          }
        }
      },
      '/api/projects/{id}': {
        get: {
          tags: ['Projects'],
          summary: 'Get project details',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Project details' }
          }
        }
      },
      '/api/applications': {
        post: {
          tags: ['Applications'],
          summary: 'Submit application to role',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'roleId', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '201': { description: 'Application submitted' }
          }
        }
      },
      '/api/kpis/{id}/submit': {
        post: {
          tags: ['KPIs'],
          summary: 'Submit KPI for approval',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'KPI submitted' }
          }
        }
      },
      '/api/kpis/{id}/confirm': {
        post: {
          tags: ['KPIs'],
          summary: 'FL confirms KPI after PO approval',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'KPI confirmed' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  });
});

// API routes
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { projectsRouter } from './routes/projects.js';
import { applicationsRouter } from './routes/applications.js';
import { kpisRouter } from './routes/kpis.js';
import { contractsRouter } from './routes/contracts.js';
app.route('/api/auth', authRouter);
app.route('/api/users', usersRouter);
app.route('/api/projects', projectsRouter);
app.route('/api/applications', applicationsRouter);
app.route('/api/kpis', kpisRouter);
app.route('/api/contracts', contractsRouter);

export default app;
