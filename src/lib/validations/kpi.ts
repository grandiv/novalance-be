import { z } from 'zod';

export const submitKpiSchema = z.object({
  submissionData: z.string().min(10).max(5000), // JSON string or description
});

export const reviewKpiSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).optional(),
});
