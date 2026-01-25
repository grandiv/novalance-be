import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(2000),
  timelineStart: z.string().datetime(), // ISO 8601
  timelineEnd: z.string().datetime(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(2000).optional(),
  timelineStart: z.string().datetime().optional(),
  timelineEnd: z.string().datetime().optional(),
  status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled']).optional(),
  vaultAddress: z.string().startsWith('0x').optional(), // Link vault contract
  poResponseDeadline: z.string().datetime().optional(), // Auto-withdrawal deadline for PO response
});

// New: Link vault to project after deployment
export const linkVaultSchema = z.object({
  vaultAddress: z.string().startsWith('0x').min(42),
});

export const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(10).max(500),
  kpiCount: z.number().int().min(1).max(52), // Max 1 year of weekly KPIs
  paymentPerKpi: z.string().regex(/^\d+$/), // IDRX amount as string
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(500).optional(),
  kpiCount: z.number().int().min(1).max(52).optional(),
  paymentPerKpi: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['open', 'assigned', 'completed', 'cancelled']).optional(),
});

export const createKpiSchema = z.object({
  kpis: z.array(z.object({
    kpiNumber: z.number().int().min(1),
    description: z.string().min(5).max(500),
    deadline: z.string().datetime(),
  })),
});
