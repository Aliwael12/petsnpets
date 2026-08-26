import { z } from 'zod';

const phonesSchema = z.array(z.string().trim().min(1).max(40)).min(1, 'At least one phone number is required.');

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phones: phonesSchema,
});
export type CreateClientDto = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phones: phonesSchema.optional(),
});
export type UpdateClientDto = z.infer<typeof updateClientSchema>;

export const listClientsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});
export type ListClientsQueryDto = z.infer<typeof listClientsQuerySchema>;
