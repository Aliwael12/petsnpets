import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdempotencyKey } from '../common/idempotency/idempotency-key.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import { createSaleSchema, listSalesQuerySchema, type CreateSaleDto, type ListSalesQueryDto } from './dto/sale.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSalesQuerySchema)) query: ListSalesQueryDto) {
    return this.sales.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.getOrThrow(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  checkout(
    @IdempotencyKey() idempotencyKey: string,
    @Body(new ZodValidationPipe(createSaleSchema)) dto: CreateSaleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.sales.checkout(idempotencyKey, dto, actor);
  }
}
