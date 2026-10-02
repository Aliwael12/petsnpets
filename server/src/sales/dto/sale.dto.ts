import { z } from 'zod';
import { paymentMethodEnum } from '../../db/schema/enums';
import { dateRangeShape, isOrderedRange, ORDERED_RANGE_ISSUE } from '../../common/dto/date-range.dto';

export const saleLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  // Deliberately no unitPrice here — price always comes from the database, never the
  // client. See ProductsService / SalesService.
});

export const paymentMethodSchema = z.enum(paymentMethodEnum.enumValues);

/** One method's share of a bill, in piastres. */
export const paymentLineSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().int().positive(),
});

/** How a bill was paid: empty means "not recorded"; otherwise the lines must add up to the
 *  exact total (checked in SalesService, which is where the total is known). */
export const paymentsSchema = z.array(paymentLineSchema).max(10);
export type PaymentLine = z.infer<typeof paymentLineSchema>;

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
  /** Omitted or empty means "not recorded" — shown as such in the payment breakdowns. */
  payments: paymentsSchema.optional(),
  /** Legacy single-method form, still accepted so a till tab that hasn't reloaded since
   *  split payments shipped keeps working: treated as the whole total paid that way. */
  paymentMethod: paymentMethodSchema.optional(),
});
export type CreateSaleDto = z.infer<typeof createSaleSchema>;

/** Corrections to a sale after the fact: who it was for, when it happened, how it was paid. */
export const updateSaleSchema = z
  .object({
    /** The client the sale belongs to; null makes it a walk-in. The name on the sale is
     *  re-derived from the client record, as at checkout. */
    clientId: z.uuid().nullable().optional(),
    /** Admin only: the client discount to apply (null removes it). The total is re-priced
     *  from the sale's subtotal, exactly as checkout prices it. */
    discountId: z.uuid().nullable().optional(),
    /** Clinic-local wall time, "YYYY-MM-DDTHH:mm" (what a datetime-local input gives) — the
     *  server converts it using the clinic's timezone, so the browser never has to know
     *  Cairo's UTC offset on that date. */
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Date and time must look like 2026-09-30T14:05.')
      .optional(),
    payments: paymentsSchema.optional(),
  })
  .refine((v) => v.clientId !== undefined || v.discountId !== undefined || v.occurredAt !== undefined || v.payments !== undefined, {
    message: 'Nothing to change.',
  });
export type UpdateSaleDto = z.infer<typeof updateSaleSchema>;

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
