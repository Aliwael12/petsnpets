import { z } from 'zod';

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
        /** Unit sale price in piastres. Required because a product can't be sold without
         * one, and a shipment is often the first time it exists at all. */
        unitPrice: z.number().int().nonnegative(),
        lowStockThreshold: z.number().int().nonnegative().default(0),
      })
      .optional(),

    quantity: z.number().int().positive(),
    costTotal: z.number().int().nonnegative(), // piastres
    expiryDate: z.iso.datetime().optional(),
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

export const listSupplierOrdersQuerySchema = z.object({
  supplierId: z.uuid().optional(),
  /** Inclusive ISO date bounds on received_at, for the Money in/out custom range filter. */
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type ListSupplierOrdersQueryDto = z.infer<typeof listSupplierOrdersQuerySchema>;
