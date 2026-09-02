import { z } from 'zod';
import { dateRangeShape, isOrderedRange, ORDERED_RANGE_ISSUE } from '../../common/dto/date-range.dto';

export const saleLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  // Deliberately no unitPrice here — price always comes from the database, never the
  // client. See ProductsService / SalesService.
});

export const paymentMethodSchema = z.enum(['cash', 'instapay', 'card']);

export const createSaleSchema = z.object({
  // Every sale must be linked to a client — see SalesService.executeCheckout, which
  // derives customerName from the client record rather than accepting free text.
  clientId: z.uuid(),
  items: z.array(saleLineSchema).min(1),
  discountId: z.uuid().optional(),
  /** Optional at the API even though the POS makes it a required choice: a stale browser tab
   * that hasn't reloaded must not start 400-ing mid-checkout at a live till. Omitted means
   * "not recorded", the same as historical rows. */
  paymentMethod: paymentMethodSchema.optional(),
});
export type CreateSaleDto = z.infer<typeof createSaleSchema>;

export const listSalesQuerySchema = z
  .object({
    soldBy: z.uuid().optional(),
    productId: z.uuid().optional(),
    clientId: z.uuid().optional(),
    /** A rolling instant window (now() - N days). Kept for the Dashboard's "recent sales". */
    sinceDays: z.coerce.number().int().positive().optional(),
    /** Inclusive Cairo calendar days on created_at — the Money in/out range filter. */
    ...dateRangeShape,
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type ListSalesQueryDto = z.infer<typeof listSalesQuerySchema>;
