import { verifyMessage, hashMessage } from 'viem';
import { nanoid } from 'nanoid';

const NONCE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export function generateNonce(): string {
  return nanoid(32);
}

export function createSignMessage(nonce: string, address: string): string {
  return `Welcome to Novalance!\n\nClick to sign in and verify your wallet ownership.\n\nThis request will not trigger a blockchain transaction or cost any fees.\n\nWallet address:\n${address}\n\nNonce: ${nonce}\n\nTimestamp: ${Date.now()}`;
}

export async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recovered = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}
