import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateNonce, createSignMessage, verifySignature } from '../lib/crypto.js';
import { createToken } from '../lib/jwt.js';

const auth = new Hono();

// Request nonce for signing
auth.post('/wallet/nonce', zValidator('json', z.object({
  address: z.string().startsWith('0x'),
})), async (c) => {
  const { address } = c.req.valid('json');

  const existingUser = await db.query.users.findFirst({
    where: eq(users.address, address.toLowerCase()),
  });

  const nonce = generateNonce();

  if (existingUser) {
    await db.update(users)
      .set({ nonce, updatedAt: new Date() })
      .where(eq(users.address, address.toLowerCase()));
  } else {
    await db.insert(users).values({
      address: address.toLowerCase(),
      nonce,
    });
  }

  const message = createSignMessage(nonce, address);

  return c.json({ nonce, message });
});

// Verify signature and get token
auth.post('/wallet/verify', zValidator('json', z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
})), async (c) => {
  const { address, signature } = c.req.valid('json');

  const user = await db.query.users.findFirst({
    where: eq(users.address, address.toLowerCase()),
  });

  if (!user) {
    return c.json({ error: 'User not found. Request a nonce first.' }, 404);
  }

  const message = createSignMessage(user.nonce, address);
  const isValid = await verifySignature(address, message, signature);

  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Clear nonce after successful verification
  await db.update(users)
    .set({ nonce: generateNonce(), updatedAt: new Date() })
    .where(eq(users.address, address.toLowerCase()));

  const token = await createToken(address);

  return c.json({ token, address: user.address });
});

export { auth as authRouter };
