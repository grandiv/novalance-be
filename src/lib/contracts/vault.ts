import { createPublicClient, http, parseAbi } from 'viem';
import { BASE_CHAIN } from '../../config/contracts';

// Vault ABI (to be provided by SC dev)
export const VAULT_ABI = parseAbi([
  // Read functions
  'function getBalance() external view returns (uint256)',
  'function getKpiStatus(uint256 kpiIndex) external view returns (bool completed, uint256 amount)',
  'function getProjectInfo() external view returns (address owner, address token, uint256 totalDeposited)',
  // Write functions (for backend with admin key)
  'function deposit() external payable',
  'function releaseKpiPayment(uint256 kpiIndex) external',
  'function cancelProject() external',
  // Events
  'event Deposited(address indexed caller, uint256 amount)',
  'event KpiApproved(uint256 indexed kpiIndex, address indexed freelancer, uint256 amount)',
  'event ProjectCancelled(address indexed caller, uint256 refundAmount)',
]);

// Public client for reading
export const publicClient = createPublicClient({
  chain: BASE_CHAIN,
  transport: http(),
});

// Get vault balance
export async function getVaultBalance(vaultAddress: string) {
  try {
    const balance = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getBalance',
    });
    return balance.toString();
  } catch (error) {
    console.error('Error reading vault balance:', error);
    return '0';
  }
}

// Get KPI status from vault
export async function getKpiStatus(vaultAddress: string, kpiIndex: number) {
  try {
    const status = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getKpiStatus',
      args: [BigInt(kpiIndex)],
    });
    return {
      completed: status[0] as boolean,
      amount: status[1].toString(),
    };
  } catch (error) {
    console.error('Error reading KPI status:', error);
    return { completed: false, amount: '0' };
  }
}

// Get project info from vault
export async function getProjectInfo(vaultAddress: string) {
  try {
    const info = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getProjectInfo',
    });
    return {
      owner: info[0] as string,
      token: info[1] as string,
      totalDeposited: info[2].toString(),
    };
  } catch (error) {
    console.error('Error reading project info:', error);
    return null;
  }
}

// Listen to vault events
export async function subscribeToVaultEvents(
  vaultAddress: string,
  callbacks: {
    onDeposited?: (caller: string, amount: string) => void;
    onKpiApproved?: (kpiIndex: number, freelancer: string, amount: string) => void;
    onProjectCancelled?: (caller: string, refundAmount: string) => void;
  }
) {
  const unwatch = publicClient.watchContractEvent({
    address: vaultAddress as `0x${string}`,
    abi: VAULT_ABI,
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.eventName === 'Deposited' && callbacks.onDeposited) {
          const { caller, amount } = log.args as { caller: string; amount: bigint };
          callbacks.onDeposited(caller, amount.toString());
        }
        if (log.eventName === 'KpiApproved' && callbacks.onKpiApproved) {
          const { kpiIndex, freelancer, amount } = log.args as {
            kpiIndex: bigint;
            freelancer: string;
            amount: bigint;
          };
          callbacks.onKpiApproved(Number(kpiIndex), freelancer, amount.toString());
        }
        if (log.eventName === 'ProjectCancelled' && callbacks.onProjectCancelled) {
          const { caller, refundAmount } = log.args as {
            caller: string;
            refundAmount: bigint;
          };
          callbacks.onProjectCancelled(caller, refundAmount.toString());
        }
      }
    },
  });

  return unwatch;
}
