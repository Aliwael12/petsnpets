import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { discounts, type Discount } from '../db/schema';
import { DiscountAlreadyUsedError, NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateDiscountDto, ListDiscountsQueryDto } from './dto/discount.dto';

@Injectable()
export class DiscountsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListDiscountsQueryDto) {
    const conditions = [
      query.clientId ? eq(discounts.clientId, query.clientId) : undefined,
      query.availableOnly ? isNull(discounts.usedInTransactionId) : undefined,
    ].filter((c) => c !== undefined);

    return this.db.query.discounts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(discounts.createdAt)],
      with: {
        client: { columns: { id: true, name: true } },
        createdByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  async create(dto: CreateDiscountDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(discounts)
        .values({ clientId: dto.clientId, kind: dto.kind, value: dto.value, note: dto.note, createdBy: actor.id })
        .returning();
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'discount.create',
        entityType: 'discount',
        entityId: row.id,
        after: row,
      });
      return row;
    });
  }

  async revoke(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(discounts).where(eq(discounts.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Discount', id);
      if (before.usedInTransactionId) {
        throw new ValidationAppError('This discount has already been used and cannot be revoked.');
      }
      await tx.delete(discounts).where(eq(discounts.id, id));
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'discount.revoke',
        entityType: 'discount',
        entityId: id,
        before,
      });
    });
  }

  /**
   * Atomically claims a discount for a transaction. The `WHERE used_in_transaction_id IS
   * NULL` in the same UPDATE as the write is what makes this race-safe — two concurrent
   * sales racing the same discount will see exactly one UPDATE affect a row; the loser gets
   * zero rows back and must fail the whole sale. A plain "check then use" (SELECT to see if
   * it's used, then UPDATE) has a window between the two statements where both requests can
   * pass the check — this collapses that window to zero.
   */
  async claim(tx: Database, discountId: string, clientId: string, transactionId: string): Promise<Discount> {
    const [existing] = await tx.select().from(discounts).where(eq(discounts.id, discountId)).limit(1);
    if (!existing) throw new NotFoundAppError('Discount', discountId);
    if (existing.clientId !== clientId) {
      throw new ValidationAppError('This discount does not belong to the selected client.', { discountId, clientId });
    }

    const [claimed] = await tx
      .update(discounts)
      .set({ usedInTransactionId: transactionId })
      .where(and(eq(discounts.id, discountId), isNull(discounts.usedInTransactionId)))
      .returning();

    if (!claimed) {
      throw new DiscountAlreadyUsedError(discountId);
    }
    return claimed;
  }
}
