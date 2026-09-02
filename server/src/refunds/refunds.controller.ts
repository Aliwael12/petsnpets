import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdempotencyKey } from '../common/idempotency/idempotency-key.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createRefundSchema,
  listRefundsQuerySchema,
  type CreateRefundDto,
  type ListRefundsQueryDto,
} from './dto/refund.dto';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listRefundsQuerySchema)) query: ListRefundsQueryDto) {
    return this.refunds.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @IdempotencyKey() idempotencyKey: string,
    @Body(new ZodValidationPipe(createRefundSchema)) dto: CreateRefundDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.refunds.createRefund(idempotencyKey, dto, actor);
  }
}
