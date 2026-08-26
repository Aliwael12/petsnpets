import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import {
  employeeSummaryQuerySchema,
  revenueSplitQuerySchema,
  timeseriesQuerySchema,
  type EmployeeSummaryQueryDto,
  type RevenueSplitQueryDto,
  type TimeseriesQueryDto,
} from './dto/analytics.dto';

@Controller('analytics')
@Roles('doctor')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('revenue-timeseries')
  revenueTimeseries(@Query(new ZodValidationPipe(timeseriesQuerySchema)) query: TimeseriesQueryDto) {
    return this.analytics.revenueTimeseries(query.days);
  }

  @Get('best-sellers')
  bestSellers() {
    return this.analytics.bestSellers();
  }

  @Get('revenue-by-employee')
  revenueByEmployee() {
    return this.analytics.revenueByEmployee();
  }

  @Get('revenue-by-category')
  revenueByCategory() {
    return this.analytics.revenueByCategory();
  }

  @Get('revenue-split')
  revenueSplit(@Query(new ZodValidationPipe(revenueSplitQuerySchema)) query: RevenueSplitQueryDto) {
    return this.analytics.revenueSplit(query.kind);
  }

  @Get('employee-summary')
  employeeSummary(@Query(new ZodValidationPipe(employeeSummaryQuerySchema)) query: EmployeeSummaryQueryDto) {
    return this.analytics.employeeSummary(query.employeeId, query.year, query.month);
  }
}
