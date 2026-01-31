import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateNonce, createSignMessage, recreateMessage, verifySignature as verifySignatureCrypto } from '../lib/crypto.js';
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
  const signMessageResult = createSignMessage(nonce, address);

  if (existingUser) {
    await db.update(users)
      .set({ nonce: signMessageResult.nonce, updatedAt: new Date() })
      .where(eq(users.address, address.toLowerCase()));
  } else {
    await db.insert(users).values({
      address: address.toLowerCase(),
      nonce: signMessageResult.nonce,
    });
  }

  console.log('[Nonce Generated] Address:', address);
  console.log('[Nonce Generated] Stored nonce:', signMessageResult.nonce);

  return c.json({
    nonce: signMessageResult.nonce,
    message: signMessageResult.message
  });
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
    console.log('[Verify Error] User not found for address:', address);
    return c.json({ error: 'User not found. Request a nonce first.' }, 404);
  }

  console.log('[Verify] Retrieved stored nonce:', user.nonce);

  // Recreate the message using the stored nonce (which contains the timestamp)
  const message = recreateMessage(user.nonce, address);

  console.log('[Verify] Recreated message:', message.substring(0, 100) + '...');

  const isValid = await verifySignatureCrypto(address, message, signature);

  if (!isValid) {
    console.log('[Verify Error] Signature verification failed');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  console.log('[Verify Success] Signature verified for:', address);

  // Clear nonce after successful verification
  const newNonce = generateNonce();
  const newSignMessageResult = createSignMessage(newNonce, address);
  await db.update(users)
    .set({ nonce: newSignMessageResult.nonce, updatedAt: new Date() })
    .where(eq(users.address, address.toLowerCase()));

  const token = await createToken(address);

  return c.json({ token, address: user.address });
});

export { auth as authRouter };
