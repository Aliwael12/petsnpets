import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { refundItems, refunds, transactionItems, transactions } from '../db/schema';
import { NotFoundAppError, RefundExceedsSoldError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Actor } from '../auth/auth.types';
import type { CreateRefundDto } from './dto/refund.dto';

@Injectable()
export class RefundsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly inventory: InventoryService,
  ) {}

  list() {
    return this.db.query.refunds.findMany({
      orderBy: [desc(refunds.createdAt)],
      with: {
        items: { with: { product: { columns: { id: true, name: true } } } },
        refundedByEmployee: { columns: { id: true, name: true } },
        transaction: { columns: { id: true, customerName: true, invoiceYear: true, invoiceNo: true, clientId: true } },
      },
    });
  }

  async createRefund(idempotencyKey: string, dto: CreateRefundDto, actor: Actor) {
    const result = await this.idempotency.run(idempotencyKey, 'POST /v1/refunds', actor.id, async () => {
      const refund = await this.executeRefund(dto, actor);
      return { status: 201, body: refund };
    });
    return result.body;
  }

  private async executeRefund(dto: CreateRefundDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      // Lock the parent transaction so two concurrent refund requests against the same sale
      // serialize — the second sees the first's already-inserted refund_items before it
      // computes "remaining", instead of both computing against the same stale remainder.
      const [txn] = await tx.select().from(transactions).where(eq(transactions.id, dto.transactionId)).for('update');
      if (!txn) throw new NotFoundAppError('Transaction', dto.transactionId);

      const originalItems = await tx.select().from(transactionItems).where(eq(transactionItems.transactionId, txn.id));
      const originalByProduct = new Map(originalItems.map((it) => [it.productId, it]));

      const priorRefundedQty = await tx.execute<{ product_id: string; qty: number }>(rawSql`
        select ri.product_id, sum(ri.quantity)::int as qty
        from refund_items ri
        join refunds r on r.id = ri.refund_id
        where r.transaction_id = ${txn.id}
        group by ri.product_id
      `);
      const priorQtyByProduct = new Map(priorRefundedQty.map((r) => [r.product_id, r.qty]));

      const [{ priorTotal }] = await tx.execute<{ priorTotal: number }>(rawSql`
        select coalesce(sum(total), 0)::int as "priorTotal" from refunds where transaction_id = ${txn.id}
      `);

      const requestedByProduct = new Map(dto.items.map((l) => [l.productId, l.quantity]));

      for (const line of dto.items) {
        const original = originalByProduct.get(line.productId);
        if (!original) throw new NotFoundAppError('Transaction item for product', line.productId);
        const already = priorQtyByProduct.get(line.productId) ?? 0;
        const remaining = original.quantity - already;
        if (line.quantity > remaining) {
          throw new RefundExceedsSoldError(line.productId, line.quantity, remaining);
        }
      }

      // A "full refund" is: after this request, every line of the ORIGINAL sale — not just
      // the ones mentioned in this request — is refunded down to zero. Only then do we force
      // exact reconciliation against txn.total; a refund that's partial for even one untouched
      // line is priced with ordinary per-line rounding.
      const isFullRefund = originalItems.every((it) => {
        const already = priorQtyByProduct.get(it.productId) ?? 0;
        const requested = requestedByProduct.get(it.productId) ?? 0;
        return already + requested >= it.quantity;
      });

      const scale = txn.subtotal > 0 ? txn.total / txn.subtotal : 1;
      const lineAmounts = dto.items.map((line) => {
        const original = originalByProduct.get(line.productId)!;
        return Math.round(original.unitPrice * line.quantity * scale);
      });

      if (isFullRefund) {
        const target = txn.total - priorTotal;
        const drift = target - lineAmounts.reduce((a, b) => a + b, 0);
        lineAmounts[lineAmounts.length - 1] += drift;
      }

      const refundTotal = lineAmounts.reduce((a, b) => a + b, 0);

      const [refund] = await tx
        .insert(refunds)
        .values({ transactionId: txn.id, total: refundTotal, refundedBy: actor.id, reason: dto.reason })
        .returning();

      await tx.insert(refundItems).values(
        dto.items.map((line) => ({
          refundId: refund.id,
          productId: line.productId,
          quantity: line.quantity,
          // Snapshot from the ORIGINAL sale's per-unit price, matching how transaction_items
          // itself is priced — the discount is reflected in refunds.total, not here.
          unitPrice: originalByProduct.get(line.productId)!.unitPrice,
        })),
      );

      await this.inventory.applyMovements(
        tx,
        dto.items.map((line) => ({
          productId: line.productId,
          delta: line.quantity,
          reason: 'refund' as const,
          refId: refund.id,
          actorId: actor.id,
        })),
      );

      // Deliberate default: refunding a sale — even in full — does NOT release its discount
      // for reuse. Revisit explicitly if the business wants that behavior instead.

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'refund.create',
        entityType: 'refund',
        entityId: refund.id,
        after: refund,
      });

      const items = await tx.select().from(refundItems).where(eq(refundItems.refundId, refund.id));
      return { ...refund, items };
    });
  }
}
