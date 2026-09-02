import { z } from 'zod';

/** Lowercase kebab slug — this is the value stored on products.category, so it must stay
 * URL/query friendly and stable. The display string lives in `label`. */
const categoryNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  label: z.string().trim().min(1).max(60),
  kind: z.enum(['good', 'service']).default('good'),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

/**
 * `name` and `kind` are deliberately not editable. Renaming would cascade across every
 * product row (and every historical analytics grouping) and flipping `kind` would silently
 * turn stocked goods into un-stocked services or vice versa, desyncing the ledger. Both are
 * "delete and recreate" operations, not edits.
 */
export const updateCategorySchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
