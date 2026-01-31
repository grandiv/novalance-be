import { verifyMessage, hashMessage, recoverAddress } from 'viem';
import { hashMessage as hashMessageViem } from 'viem';
import { toHex } from 'viem';
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
    console.log('[Signature Verification] Input:', {
      address,
      messageLength: message.length,
      signature: signature.substring(0, 20) + '...',
    });

    const recovered = await recoverAddress({
      hash: hashMessageViem(message),
      signature: signature as `0x${string}`,
    });

    console.log('[Signature Verification] Recovered address:', recovered);
    console.log('[Signature Verification] Expected address:', address.toLowerCase());
    console.log('[Signature Verification] Match:', recovered.toLowerCase() === address.toLowerCase());

    return recovered.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('[Signature Verification] Error:', error);
    return false;
  }
}
