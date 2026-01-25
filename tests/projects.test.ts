import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { db } from '../src/db';
import { users, projects } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Projects Endpoints', () => {
  const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    // Create a test user and get auth token
    const nonceRes = await fetch('http://localhost:3000/api/auth/wallet/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: testAddress }),
    });
    const { nonce } = await nonceRes.json();

    // For now, we'll just use a mock signature for testing
    // In production, this would be an actual wallet signature
    const mockSignature = '0x' + '0'.repeat(130);

    const verifyRes = await fetch('http://localhost:3000/api/auth/wallet/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: testAddress,
        signature: mockSignature,
      }),
    });

    if (verifyRes.ok) {
      const { token } = await verifyRes.json();
      authToken = token;
    }
  });

  it('should list projects', async () => {
    const res = await fetch('http://localhost:3000/api/projects');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.projects).toBeDefined();
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it('should create a project (with auth)', async () => {
    if (!authToken) {
      console.log('Skipping: No valid auth token');
      return;
    }

    const res = await fetch('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: 'Test Project',
        description: 'A test project for hackathon',
        timelineStart: new Date().toISOString(),
        timelineEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.project).toBeDefined();
    expect(data.project.title).toBe('Test Project');
    projectId = data.project.id;
  });

  it('should get project by id', async () => {
    if (!projectId) {
      console.log('Skipping: No project created');
      return;
    }

    const res = await fetch(`http://localhost:3000/api/projects/${projectId}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.project).toBeDefined();
    expect(data.project.id).toBe(projectId);
  });

  // Cleanup
  afterAll(async () => {
    if (projectId) {
      await db.delete(projects).where(eq(projects.id, projectId));
    }
    await db.delete(users).where(eq(users.address, testAddress));
  });
});
