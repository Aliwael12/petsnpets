import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  monthlyReportQuerySchema,
  type MonthlyReportQueryDto,
} from './dto/report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Everything the clinic did in a month, as a PDF — income, costs and salaries included,
   *  so it sits behind the same grant as Money in / out. Returns a short-lived download link. */
  @Get('monthly')
  @Permissions('financials:read')
  async monthly(
    @Query(new ZodValidationPipe(monthlyReportQuerySchema))
    query: MonthlyReportQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    const url = await this.reports.monthlyReportUrl(query.month, actor);
    return { url };
  }
}
