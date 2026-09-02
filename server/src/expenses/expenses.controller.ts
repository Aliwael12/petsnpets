import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdempotencyKey } from '../common/idempotency/idempotency-key.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
  voidExpenseSchema,
  type CreateExpenseDto,
  type ListExpensesQueryDto,
  type UpdateExpenseDto,
  type VoidExpenseDto,
} from './dto/expense.dto';

/**
 * Doctor-only for READ as well as write — deliberately stricter than PurchasingController,
 * which leaves GET open to every role. This ledger contains salaries and rent; a cashier
 * must not be able to read what colleagues are paid.
 *
 * There is no DELETE route by design: expenses are voided, never removed.
 */
@Controller('expenses')
@Roles('doctor')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQueryDto) {
    return this.expenses.list(query);
  }

  @Post()
  create(
    @IdempotencyKey() idempotencyKey: string,
    @Body(new ZodValidationPipe(createExpenseSchema)) dto: CreateExpenseDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.expenses.create(idempotencyKey, dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) dto: UpdateExpenseDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.expenses.update(id, dto, actor);
  }

  @Post(':id/void')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(voidExpenseSchema)) dto: VoidExpenseDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.expenses.void(id, dto, actor);
  }
}
