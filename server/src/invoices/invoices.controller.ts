import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** Declared before the `:transactionId` route below — Nest matches in declaration order,
   * so a literal segment has to come first or `refunds` would be parsed as a uuid param
   * and rejected by ParseUUIDPipe. */
  @Get('refunds/:refundId')
  async getRefund(@Param('refundId', ParseUUIDPipe) refundId: string) {
    const url = await this.invoices.getRefundSignedUrl(refundId);
    return { url };
  }

  @Get(':transactionId')
  async get(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    const url = await this.invoices.getSignedUrl(transactionId);
    return { url };
  }
}
