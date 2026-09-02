import { z } from 'zod';
import { queryBooleanSchema } from '../../common/dto/query-boolean';

/**
 * A fixed list rather than a pgEnum or a managed table: the clinic asked to *record*
 * expenses, not to administer expense taxonomies, and validating here means adding a
 * category later is a one-line change with no migration.
 *
 * There is deliberately NO stock/inventory/supplier category. Stock bought for resale is
 * recorded as a supplier order and is already counted in the Expenses total — offering a
 * category for it here would invite double-counting.
 */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'utilities',
  'maintenance',
  'clinic-supplies',
  'marketing',
  'transport',
  'government-fees',
  'owner-drawings',
  'other',
] as const;

export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const paymentMethodSchema = z.enum(['cash', 'instapay', 'card']);

/** YYYY-MM-DD, a Cairo calendar day — see expenses.paidOn for why this is a date, not an instant. */
const paidOnSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

export const createExpenseSchema = z.object({
  category: expenseCategorySchema,
  description: z.string().trim().min(1).max(300),
  /** Integer piastres. The client converts what the doctor types in EGP. */
  amount: z.number().int().positive(),
  paymentMethod: paymentMethodSchema,
  payee: z.string().trim().max(200).optional(),
  paidOn: paidOnSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

/**
 * Cosmetic fields only. `amount`, `paidOn` and `paymentMethod` are deliberately NOT editable:
 * changing any of them silently restates a month the owner may already have looked at, so
 * they are void-and-re-enter, which leaves a trail.
 */
export const updateExpenseSchema = z.object({
  category: expenseCategorySchema.optional(),
  description: z.string().trim().min(1).max(300).optional(),
  payee: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;

export const voidExpenseSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});
export type VoidExpenseDto = z.infer<typeof voidExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  from: paidOnSchema.optional(),
  to: paidOnSchema.optional(),
  category: expenseCategorySchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  includeVoided: queryBooleanSchema.default(false),
});
export type ListExpensesQueryDto = z.infer<typeof listExpensesQuerySchema>;
