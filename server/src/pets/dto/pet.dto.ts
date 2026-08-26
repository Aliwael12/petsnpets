import { z } from 'zod';

export const speciesSchema = z.enum(['dog', 'cat', 'bird', 'rabbit', 'other']);

export const createPetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    species: speciesSchema,
    breed: z.string().trim().max(200).default(''),
    clientId: z.uuid().optional(),
    newClient: z
      .object({
        name: z.string().trim().min(1).max(200),
        phones: z.array(z.string().trim().min(1).max(40)).min(1),
      })
      .optional(),
    phones: z.array(z.string().trim().min(1).max(40)).default([]),
  })
  .refine((v) => v.clientId || v.newClient, {
    message: 'Provide either clientId or newClient.',
    path: ['clientId'],
  });
export type CreatePetDto = z.infer<typeof createPetSchema>;

export const listPetsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});
export type ListPetsQueryDto = z.infer<typeof listPetsQuerySchema>;
