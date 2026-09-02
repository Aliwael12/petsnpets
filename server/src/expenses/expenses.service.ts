import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { expenses } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import type { Actor } from '../auth/auth.types';
import type { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto, VoidExpenseDto } from './dto/expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  list(query: ListExpensesQueryDto) {
    const conditions = [
      // Voided rows are excluded from every read by default — they must never reach a total.
      query.includeVoided ? undefined : isNull(expenses.voidedAt),
      query.from ? gte(expenses.paidOn, query.from) : undefined,
      query.to ? lte(expenses.paidOn, query.to) : undefined,
      query.category ? eq(expenses.category, query.category) : undefined,
      query.paymentMethod ? eq(expenses.paymentMethod, query.paymentMethod) : undefined,
    ].filter((c) => c !== undefined);

    return this.db.query.expenses.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(expenses.paidOn), desc(expenses.createdAt)],
      with: {
        recordedByEmployee: { columns: { id: true, name: true } },
        voidedByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  /** Idempotent, like every other money-moving POST — a double-tap on the doctor's phone
   * must not create two rent payments and quietly move the month's Net. */
  async create(idempotencyKey: string, dto: CreateExpenseDto, actor: Actor) {
    const result = await this.idempotency.run(idempotencyKey, 'POST /v1/expenses', actor.id, async () => {
      const row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(expenses)
          .values({
            category: dto.category,
            description: dto.description,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            payee: dto.payee,
            paidOn: dto.paidOn,
            note: dto.note,
            // Never from the request body — the recorder is whoever's session this is.
            recordedBy: actor.id,
          })
          .returning();

        await this.audit.log(tx, {
          actorId: actor.id,
          action: 'expense.create',
          entityType: 'expense',
          entityId: created.id,
          after: created,
        });
        return created;
      });
      return { status: 201, body: row };
    });
    return result.body;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Expense', id);
      if (before.voidedAt) throw new ValidationAppError('This expense has been voided and can no longer be edited.');

      const [after] = await tx
        .update(expenses)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(expenses.id, id))
        .returning();

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'expense.update',
        entityType: 'expense',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }

  /** Soft delete. There is no hard-delete route: removing a row a past month's Net was
   * computed from would silently restate history. */
  async void(id: string, dto: VoidExpenseDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Expense', id);
      if (before.voidedAt) throw new ValidationAppError('This expense is already voided.');

      const [after] = await tx
        .update(expenses)
        .set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: dto.reason, updatedAt: new Date() })
        .where(eq(expenses.id, id))
        .returning();

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'expense.void',
        entityType: 'expense',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }
}
