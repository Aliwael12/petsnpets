import { z } from 'zod';
import { ALL_FEATURES } from '../features';
import { ALL_PERMISSIONS } from '../permissions';

export const roleSchema = z.enum(['admin', 'doctor', 'nurse', 'cashier']);
export const permissionSchema = z.enum(ALL_PERMISSIONS);

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

/**
 * Tabs and grants travel together because the admin edits them on one screen and expects
 * one save. `permissions` is optional so an older client that only knows about tabs can
 * still PATCH them without silently wiping every grant on the row.
 */
export const updateEmployeeFeaturesSchema = z.object({
  enabledFeatures: z.array(z.enum(ALL_FEATURES)),
  permissions: z.array(permissionSchema).optional(),
});
export type UpdateEmployeeFeaturesDto = z.infer<typeof updateEmployeeFeaturesSchema>;
