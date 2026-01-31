// Vercel serverless function handler for Hono
import { handle } from '@hono/vercel';

// Import the app without DB binding
import app from '../dist/app.js';

// Export the Vercel handler
export const config = {
  api: {
    bodyParser: false,
  },
};

// Wrap with error handling
const handler = handle(app);

export default async function(req, res) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('Error in Vercel handler:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}
