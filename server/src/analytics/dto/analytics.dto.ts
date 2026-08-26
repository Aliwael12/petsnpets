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
