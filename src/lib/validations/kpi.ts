import { z } from 'zod';

export const submitKpiSchema = z.object({
  // Legacy support: simple string submission
  submissionData: z.string().min(10).max(5000).optional(),
  // New structured deliverables
  deliverables: z.object({
    links: z.array(z.string().url()).min(1),
    description: z.string().min(10).max(5000),
  }).optional(),
}).refine((data) => data.submissionData || data.deliverables, {
  message: "Either submissionData or deliverables must be provided",
});

export const reviewKpiSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).optional(),
});

// New: Record deposit transaction from smart contract
export const recordDepositSchema = z.object({
  kpiId: z.string().min(1),
  txHash: z.string().min(10),
  vaultBalance: z.string(), // Vault balance after deposit
});

// New: Record payout transaction from smart contract
export const recordPayoutSchema = z.object({
  kpiId: z.string().min(1),
  txHash: z.string().min(10),
  vaultBalance: z.string(), // Vault balance after payout
  yieldEarned: z.string().default('0'), // LP yield earned
  penaltyAmount: z.string().default('0'),
});

export const confirmKpiSchema = z.object({}).strict();
