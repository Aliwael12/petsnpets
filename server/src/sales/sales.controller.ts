import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdempotencyKey } from '../common/idempotency/idempotency-key.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createSaleSchema,
  listSalesQuerySchema,
  updateSaleSchema,
  type CreateSaleDto,
  type ListSalesQueryDto,
  type UpdateSaleDto,
} from './dto/sale.dto';

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

  /** Every role, like checkout: whoever rang it up can fix who it was for, when, and how it was paid. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSaleSchema)) dto: UpdateSaleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.sales.update(id, dto, actor);
  }
}
