import { serve } from '@hono/node-server';
import app from './app.js';

// Get port from environment or use default
const port = parseInt(process.env.PORT || '3000', 10);

// Start the server
console.log(`🚀 Starting Novalance API server...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`✅ Novalance API v1.0 is running on http://localhost:${port}`);
console.log(`📖 Health check: http://localhost:${port}/`);
