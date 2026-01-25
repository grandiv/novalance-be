import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Auth Endpoints', () => {
  const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
  let nonce: string;
  let token: string;

  it('should generate nonce', async () => {
    const res = await fetch('http://localhost:3000/api/auth/wallet/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: testAddress }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.nonce).toBeDefined();
    expect(data.message).toBeDefined();
    nonce = data.nonce;
  });

  // Note: Verify endpoint requires actual wallet signature
  // This test would need to be updated to work with a real signature
});

// Cleanup
afterEach(async () => {
  await db.delete(users).where(eq(users.address, testAddress));
});
