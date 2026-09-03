import { z } from 'zod';

export const changePinSchema = z
  .object({
    // Unrestricted on purpose: an existing PIN set before this validation was widened may
    // still be pure digits, and this field only has to match what argon2 already hashed —
    // narrowing it here would lock people out of their own current PIN.
    currentPin: z.string().min(4).max(12),
    // Letters and numbers, not digits-only: this used to be \d{4,12}, which is why every
    // PIN created before this change happens to be numeric. Existing PINs aren't touched —
    // argon2 hashes whatever string it's given, so a numeric PIN keeps working unchanged.
    newPin: z.string().regex(/^[A-Za-z0-9]{4,12}$/, 'PIN must be 4–12 letters and/or numbers.'),
  })
  .refine((v) => v.currentPin !== v.newPin, {
    message: 'The new PIN must be different from the current one.',
    path: ['newPin'],
  });

export type ChangePinDto = z.infer<typeof changePinSchema>;
