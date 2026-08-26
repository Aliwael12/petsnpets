import { z } from 'zod';

export const productCategorySchema = z.enum(['food', 'accessories', 'medicine', 'grooming', 'service']);
export const productKindSchema = z.enum(['good', 'service']);

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: productCategorySchema,
    sku: z.string().trim().min(1).max(60),
    unitPrice: z.number().int().nonnegative(), // piastres
    stockQuantity: z.number().int().nonnegative().default(0),
    lowStockThreshold: z.number().int().nonnegative().default(0),
  })
  .transform((v) => ({
    ...v,
    // Services are structurally unlimited — the kind is derived, not client-supplied,
    // so nothing can (mis)represent a physical good as unlimited stock by request shape.
    kind: (v.category === 'service' ? 'service' : 'good') as 'service' | 'good',
    stockQuantity: v.category === 'service' ? 0 : v.stockQuantity,
    lowStockThreshold: v.category === 'service' ? 0 : v.lowStockThreshold,
  }));

export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: productCategorySchema.optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  unitPrice: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  category: productCategorySchema.optional(),
  search: z.string().trim().max(200).optional(),
  activeOnly: z.coerce.boolean().default(true),
});

export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;

export const priceCheckQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export type PriceCheckQueryDto = z.infer<typeof priceCheckQuerySchema>;
