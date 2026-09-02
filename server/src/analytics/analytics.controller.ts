import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { toDayRange } from '../common/date-range';
import {
  employeeSummaryQuerySchema,
  financialSummaryQuerySchema,
  rangeOnlyQuerySchema,
  revenueSplitQuerySchema,
  timeseriesQuerySchema,
  type EmployeeSummaryQueryDto,
  type FinancialSummaryQueryDto,
  type RangeOnlyQueryDto,
  type RevenueSplitQueryDto,
  type TimeseriesQueryDto,
} from './dto/analytics.dto';

/**
 * Doctor-only at the class level — these endpoints expose payroll-shaped totals. Do not
 * split any of them into a second controller: the guard lives here.
 *
 * Every query below takes an optional `from`/`to` pair of inclusive Cairo calendar days.
 * Omitting both means what it has always meant for that endpoint.
 */
@Controller('analytics')
@Roles('doctor')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('revenue-timeseries')
  revenueTimeseries(@Query(new ZodValidationPipe(timeseriesQuerySchema)) query: TimeseriesQueryDto) {
    return this.analytics.revenueTimeseries(query);
  }

  @Get('best-sellers')
  bestSellers(@Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto) {
    return this.analytics.bestSellers(toDayRange(query));
  }

  @Get('revenue-by-employee')
  revenueByEmployee(@Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto) {
    return this.analytics.revenueByEmployee(toDayRange(query));
  }

  @Get('revenue-by-category')
  revenueByCategory(@Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto) {
    return this.analytics.revenueByCategory(toDayRange(query));
  }

  @Get('revenue-split')
  revenueSplit(@Query(new ZodValidationPipe(revenueSplitQuerySchema)) query: RevenueSplitQueryDto) {
    return this.analytics.revenueSplit(query.kind, toDayRange(query));
  }

  @Get('financial-summary')
  financialSummary(@Query(new ZodValidationPipe(financialSummaryQuerySchema)) query: FinancialSummaryQueryDto) {
    return this.analytics.financialSummary(query);
  }

  @Get('employee-summary')
  employeeSummary(@Query(new ZodValidationPipe(employeeSummaryQuerySchema)) query: EmployeeSummaryQueryDto) {
    return this.analytics.employeeSummary(query);
  }
}
