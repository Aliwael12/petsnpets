import { z } from 'zod';
import { dateRangeShape, isOrderedRange, ORDERED_RANGE_ISSUE } from '../../common/dto/date-range.dto';

export const paymentMethodSchema = z.enum(['cash', 'instapay', 'card']);

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactInfo: z.string().trim().max(300).default(''),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

/**
 * A shipment names its product one of two ways: an existing `productId`, or free text
 * (`newProduct`) for stock arriving for the first time. The free-text branch splits the
 * name into brand / category / product name rather than one blob so the catalog stays
 * filterable — "Royal Canin" + "food" + "Adult Cat 2kg" is queryable in a way that
 * "Royal Canin Adult Cat Food 2kg" is not.
 */
export const createSupplierOrderSchema = z
  .object({
    supplierId: z.uuid().optional(),
    newSupplierName: z.string().trim().min(1).max(200).optional(),

    productId: z.uuid().optional(),
    newProduct: z
      .object({
        brand: z.string().trim().max(120).optional(),
        category: z.string().trim().min(2).max(40),
        name: z.string().trim().min(1).max(200),
        /** Unit sale price in piastres. Optional — a shipment is often the first time a
         * product exists at all, and the price isn't always known yet at receiving time.
         * Omitted means 0 (not yet priced) until someone sets it from Products. */
        unitPrice: z.number().int().nonnegative().optional(),
        lowStockThreshold: z.number().int().nonnegative().default(0),
      })
      .optional(),

    quantity: z.number().int().positive(),
    /** Cost per unit, in piastres — what staff actually reads off the supplier's invoice.
     * The shipment's total cost is quantity * unitCost, computed server-side (see
     * PurchasingService.createOrder) rather than trusted from the client, so it can never
     * drift from the two numbers that produced it. */
    unitCost: z.number().int().nonnegative(),
    expiryDate: z.iso.datetime().optional(),
    /** When the shipment actually arrived, for backdating a shipment logged late. Omitted
     * means "now" — the column's own defaultNow(), the same as before this field existed. */
    receivedAt: z.iso.datetime().optional(),
    /** How the shipment was paid for. Optional so an older client keeps working; omitted
     * reads as "not recorded" in the expense breakdown. */
    paymentMethod: paymentMethodSchema.optional(),
  })
  .refine((v) => v.supplierId || v.newSupplierName, {
    message: 'Provide either supplierId or newSupplierName.',
    path: ['supplierId'],
  })
  .refine((v) => Boolean(v.productId) !== Boolean(v.newProduct), {
    message: 'Provide exactly one of productId or newProduct.',
    path: ['productId'],
  });
export type CreateSupplierOrderDto = z.infer<typeof createSupplierOrderSchema>;

/**
 * A payment toward a supplier's running balance, not tied to any one order — see
 * PurchasingService.supplierBalances() for how "owed" is derived from orders and payments
 * together. paymentMethod is purely informational (how the money left, for the user's own
 * record); nothing computed from it, unlike a supplier order's own paymentMethod.
 */
export const createSupplierPaymentSchema = z.object({
  supplierId: z.uuid(),
  amount: z.number().int().positive(),
  paymentMethod: paymentMethodSchema.optional(),
});
export type CreateSupplierPaymentDto = z.infer<typeof createSupplierPaymentSchema>;

export const listSupplierPaymentsQuerySchema = z
  .object({
    supplierId: z.uuid().optional(),
    /** Inclusive Cairo calendar days (YYYY-MM-DD) on paid_at — same convention as
     *  listSupplierOrdersQuerySchema's received_at bounds. */
    ...dateRangeShape,
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type ListSupplierPaymentsQueryDto = z.infer<typeof listSupplierPaymentsQuerySchema>;

export const listSupplierOrdersQuerySchema = z
  .object({
    supplierId: z.uuid().optional(),
    /** Inclusive Cairo calendar days (YYYY-MM-DD) on received_at. Deliberately NOT ISO
     *  instants: a <input type="date"> cannot know Cairo's offset on a historical date,
     *  and the previous `lte(receivedAt, new Date(to))` bound resolved to 03:00 Cairo and
     *  so silently dropped 21 hours of the last day. */
    ...dateRangeShape,
    paymentMethod: paymentMethodSchema.optional(),
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type ListSupplierOrdersQueryDto = z.infer<typeof listSupplierOrdersQuerySchema>;
