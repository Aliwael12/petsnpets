import { z } from 'zod';
import { queryBooleanSchema } from '../../common/dto/query-boolean';

export const createReminderSchema = z.object({
  clientId: z.uuid(),
  petId: z.uuid().optional(),
  description: z.string().trim().min(1).max(500),
  dueAt: z.iso.datetime(),
});
export type CreateReminderDto = z.infer<typeof createReminderSchema>;

export const listRemindersQuerySchema = z.object({
  includeCompleted: queryBooleanSchema.default(false),
});
export type ListRemindersQueryDto = z.infer<typeof listRemindersQuerySchema>;

export const clientPetsQuerySchema = z.object({
  clientId: z.uuid(),
});
export type ClientPetsQueryDto = z.infer<typeof clientPetsQuerySchema>;
