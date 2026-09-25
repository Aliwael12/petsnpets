import { z } from 'zod';

export const monthlyReportQuerySchema = z.object({
  /** YYYY-MM. Omitted means the current month in the clinic's timezone. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must look like 2026-09.')
    .optional(),
});
export type MonthlyReportQueryDto = z.infer<typeof monthlyReportQuerySchema>;
