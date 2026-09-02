import { z } from 'zod';
import { ALL_FEATURES } from '../features';

export const roleSchema = z.enum(['doctor', 'nurse', 'cashier']);

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: roleSchema,
  pin: z.string().min(4).max(12),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeRoleSchema = z.object({
  role: roleSchema,
  /** When true, the employee's enabled tabs are reset to the new role's defaults. Off by
   * default so a deliberately customised tab set survives a role correction. */
  resetFeatures: z.boolean().default(false),
});
export type UpdateEmployeeRoleDto = z.infer<typeof updateEmployeeRoleSchema>;

export const updateEmployeeFeaturesSchema = z.object({
  enabledFeatures: z.array(z.enum(ALL_FEATURES)),
});
export type UpdateEmployeeFeaturesDto = z.infer<typeof updateEmployeeFeaturesSchema>;
