export const CONTRACTS = {
  // To be filled by SC dev
  MOCK_IDRX: process.env.MOCK_IDRX_ADDRESS || '',
  VAULT_FACTORY: process.env.VAULT_FACTORY_ADDRESS || '',
  VAULT_IMPLEMENTATION: process.env.VAULT_IMPLEMENTATION_ADDRESS || '',
} as const;

export const BASE_CHAIN = {
  id: process.env.NODE_ENV === 'production' ? 8453 : 84532, // Base mainnet or sepolia testnet
  name: 'Base',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.BASE_RPC_URL || 'https://sepolia.base.org'],
    },
  },
} as const;
