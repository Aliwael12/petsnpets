import { z } from 'zod';

export const refundLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const createRefundSchema = z.object({
  transactionId: z.uuid(),
  items: z.array(refundLineSchema).min(1),
  reason: z.string().trim().max(300).optional(),
});
export type CreateRefundDto = z.infer<typeof createRefundSchema>;
