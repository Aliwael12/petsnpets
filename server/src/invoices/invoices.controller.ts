import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':transactionId')
  async get(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    const url = await this.invoices.getSignedUrl(transactionId);
    return { url };
  }
}
