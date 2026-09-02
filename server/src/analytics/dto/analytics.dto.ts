import { z } from 'zod';

export const timeseriesQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});
export type TimeseriesQueryDto = z.infer<typeof timeseriesQuerySchema>;

export const revenueSplitQuerySchema = z.object({
  kind: z.enum(['service', 'shop']),
});
export type RevenueSplitQueryDto = z.infer<typeof revenueSplitQuerySchema>;

export const employeeSummaryQuerySchema = z.object({
  employeeId: z.uuid(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export type EmployeeSummaryQueryDto = z.infer<typeof employeeSummaryQuerySchema>;

/** Both omitted means the current month in the clinic's timezone; supplying one without the
 * other is rejected rather than silently half-applied. */
export const financialSummaryQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((v) => (v.year === undefined) === (v.month === undefined), {
    message: 'Provide both year and month, or neither.',
    path: ['month'],
  });
export type FinancialSummaryQueryDto = z.infer<typeof financialSummaryQuerySchema>;
