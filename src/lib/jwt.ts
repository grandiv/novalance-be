import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

async function getSecret() {
  return new TextEncoder().encode(JWT_SECRET);
}

export interface JwtPayload {
  address: string;
  iat: number;
  exp: number;
}

export async function createToken(address: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    address: address.toLowerCase(),
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  const secret = await getSecret();
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
