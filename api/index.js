// Simple test to verify Vercel is working
export default async function handler(req, res) {
  try {
    // Return a simple JSON response
    res.status(200).json({
      status: 'ok',
      message: 'NovaLance API v1.0',
      docs: '/api-docs',
      timestamp: new Date().toISOString(),
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}
