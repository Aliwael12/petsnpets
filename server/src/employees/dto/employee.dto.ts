import { z } from 'zod';
import { ALL_FEATURES } from '../features';

export const roleSchema = z.enum(['doctor', 'nurse', 'cashier']);

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: roleSchema,
  pin: z.string().min(4).max(12),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeFeaturesSchema = z.object({
  enabledFeatures: z.array(z.enum(ALL_FEATURES)),
});
export type UpdateEmployeeFeaturesDto = z.infer<typeof updateEmployeeFeaturesSchema>;
