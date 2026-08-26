import { z } from 'zod';

export const saleLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  // Deliberately no unitPrice here — price always comes from the database, never the
  // client. See ProductsService / SalesService.
});

export const createSaleSchema = z.object({
  // Every sale must be linked to a client — see SalesService.executeCheckout, which
  // derives customerName from the client record rather than accepting free text.
  clientId: z.uuid(),
  items: z.array(saleLineSchema).min(1),
  discountId: z.uuid().optional(),
});
export type CreateSaleDto = z.infer<typeof createSaleSchema>;

export const listSalesQuerySchema = z.object({
  soldBy: z.uuid().optional(),
  productId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  sinceDays: z.coerce.number().int().positive().optional(),
});
export type ListSalesQueryDto = z.infer<typeof listSalesQuerySchema>;
