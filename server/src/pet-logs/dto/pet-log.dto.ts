import { z } from 'zod';

export const logTypeSchema = z.enum(['vaccination', 'shower', 'other']);

export const createPetLogSchema = z.object({
  logType: logTypeSchema,
  description: z.string().trim().min(1).max(500),
  nextDueDate: z.iso.datetime().optional(),
});
export type CreatePetLogDto = z.infer<typeof createPetLogSchema>;
