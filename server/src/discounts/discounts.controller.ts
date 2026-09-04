import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createDiscountSchema,
  listDiscountsQuerySchema,
  type CreateDiscountDto,
  type ListDiscountsQueryDto,
} from './dto/discount.dto';

@Controller('discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listDiscountsQuerySchema)) query: ListDiscountsQueryDto) {
    return this.discounts.list(query);
  }

  @Post()
  @Roles('admin')
  create(@Body(new ZodValidationPipe(createDiscountSchema)) dto: CreateDiscountDto, @CurrentActor() actor: Actor) {
    return this.discounts.create(dto, actor);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.discounts.revoke(id, actor);
  }
}
