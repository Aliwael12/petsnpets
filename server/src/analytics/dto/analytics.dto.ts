import { z } from 'zod';
import { dateRangeShape, isOrderedRange, ORDERED_RANGE_ISSUE } from '../../common/dto/date-range.dto';

/** `days` is the legacy rolling "last N days" window, kept for callers that already send
 *  it. Deliberately NOT defaulted: a default would silently govern the cleared-range chart
 *  and cap it at 30 days while every sibling card on the screen showed all time. */
export const timeseriesQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(3650).optional(),
    ...dateRangeShape,
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type TimeseriesQueryDto = z.infer<typeof timeseriesQuerySchema>;

/** Omitting both sides means all time — i.e. exactly the behaviour before ranges existed. */
export const rangeOnlyQuerySchema = z.object({ ...dateRangeShape }).refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type RangeOnlyQueryDto = z.infer<typeof rangeOnlyQuerySchema>;

export const revenueSplitQuerySchema = z
  .object({ kind: z.enum(['service', 'shop']), ...dateRangeShape })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type RevenueSplitQueryDto = z.infer<typeof revenueSplitQuerySchema>;

export const employeeSummaryQuerySchema = z
  .object({
    employeeId: z.uuid(),
    year: z.coerce.number().int().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    ...dateRangeShape,
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type EmployeeSummaryQueryDto = z.infer<typeof employeeSummaryQuerySchema>;

/**
 * `year`/`month` selects the `month` window; `from`/`to` selects the `range` window. They
 * are independent windows on the same response, so supplying both is legal and unambiguous.
 * An omitted `from`/`to` side is UNBOUNDED, so omitting both means ALL TIME — not the
 * current month. `month` and `allTime` are unaffected by the range either way.
 */
export const financialSummaryQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    ...dateRangeShape,
  })
  .refine((v) => (v.year === undefined) === (v.month === undefined), {
    message: 'Provide both year and month, or neither.',
    path: ['month'],
  })
  .refine(isOrderedRange, ORDERED_RANGE_ISSUE);
export type FinancialSummaryQueryDto = z.infer<typeof financialSummaryQuerySchema>;
