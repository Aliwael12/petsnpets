import { z } from 'zod';

export const changePinSchema = z
  .object({
    currentPin: z.string().min(4).max(12),
    newPin: z.string().regex(/^\d{4,12}$/, 'PIN must be 4–12 digits.'),
  })
  .refine((v) => v.currentPin !== v.newPin, {
    message: 'The new PIN must be different from the current one.',
    path: ['newPin'],
  });

export type ChangePinDto = z.infer<typeof changePinSchema>;
