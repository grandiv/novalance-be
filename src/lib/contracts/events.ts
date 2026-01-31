import { publicClient, subscribeToVaultEvents } from './vault.js';

export interface VaultEventHandlers {
  onDeposited?: (data: { caller: string; amount: string; projectId: string }) => void;
  onKpiApproved?: (data: { kpiIndex: number; freelancer: string; amount: string; vaultAddress: string }) => void;
  onProjectCancelled?: (data: { caller: string; refundAmount: string; vaultAddress: string }) => void;
}

const activeListeners = new Map<string, () => void>();

/**
 * Start listening to vault events for a project
 * @param vaultAddress - The vault contract address
 * @param handlers - Event callbacks
 * @returns Unsubscribe function
 */
export function startVaultListener(
  vaultAddress: string,
  handlers: VaultEventHandlers
): () => void {
  // Stop existing listener for this vault if any
  stopVaultListener(vaultAddress);

  const unwatch = subscribeToVaultEvents(vaultAddress, {
    onDeposited: (caller, amount) => {
      console.log(`[Vault Event] Deposited to ${vaultAddress}: ${amount} by ${caller}`);
      handlers.onDeposited?.({ caller, amount, projectId: vaultAddress });
    },
    onKpiApproved: (kpiIndex, freelancer, amount) => {
      console.log(`[Vault Event] KPI #${kpiIndex} approved for ${freelancer}: ${amount}`);
      handlers.onKpiApproved?.({ kpiIndex, freelancer, amount, vaultAddress });
    },
    onProjectCancelled: (caller, refundAmount) => {
      console.log(`[Vault Event] Project cancelled: ${refundAmount} by ${caller}`);
      handlers.onProjectCancelled?.({ caller, refundAmount, vaultAddress });
    },
  });

  activeListeners.set(vaultAddress, unwatch as any);

  return () => stopVaultListener(vaultAddress);
}

/**
 * Stop listening to vault events
 */
export function stopVaultListener(vaultAddress: string): void {
  const unwatch = activeListeners.get(vaultAddress);
  if (unwatch) {
    unwatch();
    activeListeners.delete(vaultAddress);
  }
}

/**
 * Stop all active listeners
 */
export function stopAllListeners(): void {
  for (const [address, unwatch] of activeListeners.entries()) {
    unwatch();
  }
  activeListeners.clear();
}

// Re-export vault functions for convenience
export * from './vault.js';
