import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactInfo: z.string().trim().max(300).default(''),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export const createSupplierOrderSchema = z.object({
  supplierId: z.uuid().optional(),
  newSupplierName: z.string().trim().min(1).max(200).optional(),
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  costTotal: z.number().int().nonnegative(), // piastres
}).refine((v) => v.supplierId || v.newSupplierName, {
  message: 'Provide either supplierId or newSupplierName.',
  path: ['supplierId'],
});
export type CreateSupplierOrderDto = z.infer<typeof createSupplierOrderSchema>;
