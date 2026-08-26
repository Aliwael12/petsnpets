import { z } from 'zod';

export const pinLoginSchema = z.object({
  employeeId: z.uuid(),
  pin: z.string().min(4).max(12),
  deviceId: z.string().min(1).max(200),
});

export type PinLoginDto = z.infer<typeof pinLoginSchema>;
