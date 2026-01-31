// Simple test handler
export default async function handler(req, res) {
  res.json({ message: 'Test works!', timestamp: Date.now() });
}
