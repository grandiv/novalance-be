import { z } from 'zod';

export const submitApplicationSchema = z.object({
  coverLetter: z.string().min(20).max(1000),
});

export const reviewApplicationSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  feedback: z.string().max(500).optional(),
});
