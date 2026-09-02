import { z } from 'zod';
import { queryBooleanSchema } from '../../common/dto/query-boolean';

// Categories are rows in product_categories now, not a fixed enum, so this is just a
// well-formed-slug check — whether the category actually exists (and is still active) is
// resolved against the database in ProductsService, which also takes `kind` from it.
export const categoryNameSchema = z.string().trim().min(2).max(40);
export const productKindSchema = z.enum(['good', 'service']);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).optional(),
  category: categoryNameSchema,
  sku: z.string().trim().min(1).max(60),
  unitPrice: z.number().int().nonnegative(), // piastres
  stockQuantity: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(0),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().max(120).optional(),
  category: categoryNameSchema.optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  unitPrice: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  category: categoryNameSchema.optional(),
  search: z.string().trim().max(200).optional(),
  activeOnly: queryBooleanSchema.default(true),
});

export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;

export const priceCheckQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export type PriceCheckQueryDto = z.infer<typeof priceCheckQuerySchema>;
