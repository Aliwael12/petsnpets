import { z } from 'zod';
import { dateRangeShape, isOrderedRange, ORDERED_RANGE_ISSUE } from '../../common/dto/date-range.dto';

export const refundLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const paymentMethodSchema = z.enum(['cash', 'instapay', 'card']);

export const createRefundSchema = z.object({
  transactionId: z.uuid(),
  items: z.array(refundLineSchema).min(1),
  reason: z.string().trim().max(300).optional(),
  /** Defaults server-side to however the original sale was paid. Overridable because a card
   * sale refunded in cash from the drawer is real — and the breakdown must then show cash
   * leaving rather than card income un-reducing. */
  paymentMethod: paymentMethodSchema.optional(),
});
export type CreateRefundDto = z.infer<typeof createRefundSchema>;

/** Inclusive Cairo calendar days on created_at. Omitting both sides means all time. */
export const listRefundsQuerySchema = z
  .object({ ...dateRangeShape })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type ListRefundsQueryDto = z.infer<typeof listRefundsQuerySchema>;
