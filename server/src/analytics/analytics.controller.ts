import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import { hasPermission } from '../employees/permissions';
import { ForbiddenAppError } from '../common/errors/app-error';
import { toDayRange } from '../common/date-range';
import type { Actor } from '../auth/auth.types';
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
 * Analytics is readable by anyone signed in, but WHAT it counts depends on the caller.
 *
 * Without the analytics:all grant you see only the sales you personally rang up — the
 * scoping happens in SQL, not by filtering a clinic-wide answer afterwards, so a wider
 * figure is never computed for someone who isn't allowed to see it. Admins, and anyone the
 * admin has granted analytics:all, get the clinic-wide numbers.
 *
 * The two endpoints that cannot be meaningfully self-scoped are gated outright: money
 * (income/expenses/net, which includes rent and salaries) behind financials:read, and the
 * staff league table behind analytics:all.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** null = count the whole clinic; an id = count only what that person sold. */
  private scopeFor(actor: Actor): string | null {
    return hasPermission(actor, 'analytics:all') ? null : actor.id;
  }

  @Get('revenue-timeseries')
  revenueTimeseries(
    @Query(new ZodValidationPipe(timeseriesQuerySchema)) query: TimeseriesQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.analytics.revenueTimeseries(query, this.scopeFor(actor));
  }

  @Get('best-sellers')
  bestSellers(@Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto, @CurrentActor() actor: Actor) {
    return this.analytics.bestSellers(toDayRange(query), this.scopeFor(actor));
  }

  /** Ranks staff against each other, so there is no honest self-scoped version of it —
   *  a one-bar chart of yourself is not the question this answers. */
  @Get('revenue-by-employee')
  @Permissions('analytics:all')
  revenueByEmployee(@Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto) {
    return this.analytics.revenueByEmployee(toDayRange(query));
  }

  @Get('revenue-by-category')
  revenueByCategory(
    @Query(new ZodValidationPipe(rangeOnlyQuerySchema)) query: RangeOnlyQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.analytics.revenueByCategory(toDayRange(query), this.scopeFor(actor));
  }

  @Get('revenue-split')
  revenueSplit(
    @Query(new ZodValidationPipe(revenueSplitQuerySchema)) query: RevenueSplitQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.analytics.revenueSplit(query.kind, toDayRange(query), this.scopeFor(actor));
  }

  /** Income, expenses and net — rent and salaries included, which is why this one is a
   *  grant rather than something that self-scopes. */
  @Get('financial-summary')
  @Permissions('financials:read')
  financialSummary(@Query(new ZodValidationPipe(financialSummaryQuerySchema)) query: FinancialSummaryQueryDto) {
    return this.analytics.financialSummary(query);
  }

  @Get('employee-summary')
  employeeSummary(
    @Query(new ZodValidationPipe(employeeSummaryQuerySchema)) query: EmployeeSummaryQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    // Without analytics:all you may still open this card — but only on yourself. Checked
    // here rather than silently rewriting employeeId to the caller, so asking for a
    // colleague's numbers is refused rather than quietly answered about someone else.
    if (query.employeeId !== actor.id && !hasPermission(actor, 'analytics:all')) {
      throw new ForbiddenAppError('You can only view your own activity — ask an admin for clinic-wide analytics.');
    }
    return this.analytics.employeeSummary(query);
  }
}
