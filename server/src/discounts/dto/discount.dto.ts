import { z } from 'zod';

export const createDiscountSchema = z.object({
  clientId: z.uuid(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  note: z.string().trim().max(300).optional(),
}).refine((v) => v.kind !== 'percent' || v.value <= 100, {
  message: 'Percent discounts cannot exceed 100.',
  path: ['value'],
});
export type CreateDiscountDto = z.infer<typeof createDiscountSchema>;

export const listDiscountsQuerySchema = z.object({
  clientId: z.uuid().optional(),
  availableOnly: z.coerce.boolean().default(false),
});
export type ListDiscountsQueryDto = z.infer<typeof listDiscountsQuerySchema>;
