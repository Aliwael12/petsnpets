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
  /** Optional: a walk-in who doesn't want to leave their details can still be rung up.
   *  When given, customerName is derived from the client record, never free text — see
   *  SalesService.executeCheckout. A discount still requires one (it belongs to a client). */
  clientId: z.uuid().optional(),
  items: z.array(saleLineSchema).min(1),
  discountId: z.uuid().optional(),
  /** Who actually made the sale, when that's not whoever is logged in — e.g. a cashier
   * ringing up a sale on a doctor's behalf. Omitted means "the person checking out".
   * Only admin/cashier may set this to someone else — see SalesService.executeCheckout. */
  soldBy: z.uuid().optional(),
  /** Omitted means "not recorded" — shown as such in the payment breakdowns. */
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
