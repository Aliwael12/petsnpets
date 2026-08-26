import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { clients, discounts, products, transactionItems, transactions, type Product } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import { DiscountsService } from '../discounts/discounts.service';
import type { Actor } from '../auth/auth.types';
import type { CreateSaleDto, ListSalesQueryDto } from './dto/sale.dto';

@Injectable()
export class SalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
  ) {}

  async list(query: ListSalesQueryDto) {
    const conditions = [
      query.soldBy ? eq(transactions.soldBy, query.soldBy) : undefined,
      query.clientId ? eq(transactions.clientId, query.clientId) : undefined,
      query.sinceDays ? gte(transactions.createdAt, rawSql`now() - (${query.sinceDays} || ' days')::interval`) : undefined,
    ].filter((c) => c !== undefined);

    let rows = await this.db.query.transactions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(transactions.createdAt)],
      with: {
        items: { with: { product: { columns: { id: true, name: true } } } },
        soldByEmployee: { columns: { id: true, name: true } },
        client: { columns: { id: true, name: true } },
      },
    });

    if (query.productId) {
      rows = rows.filter((t) => t.items.some((it) => it.productId === query.productId));
    }
    return rows;
  }

  async getOrThrow(id: string) {
    const row = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: { items: { with: { product: true } } },
    });
    if (!row) throw new NotFoundAppError('Transaction', id);
    return row;
  }

  async checkout(idempotencyKey: string, dto: CreateSaleDto, actor: Actor) {
    const result = await this.idempotency.run(idempotencyKey, 'POST /v1/sales', actor.id, async () => {
      const txn = await this.executeCheckout(dto, actor);
      return { status: 201, body: txn };
    });
    return result.body;
  }

  private async executeCheckout(dto: CreateSaleDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const productIds = [...new Set(dto.items.map((i) => i.productId))].sort();

      // Lock every involved product row up front, in a stable id order, before any pricing
      // or stock decision is made — this is what lets two concurrent baskets touching
      // overlapping products serialize instead of deadlocking.
      const rows = await tx.select().from(products).where(inArray(products.id, productIds)).for('update');
      const byId = new Map<string, Product>(rows.map((p) => [p.id, p]));

      for (const id of productIds) {
        const product = byId.get(id);
        if (!product) throw new NotFoundAppError('Product', id);
        if (!product.active) throw new ValidationAppError(`"${product.name}" is no longer available for sale.`, { productId: id });
      }

      // Prices come from the database, never the client — dto.items only carries
      // productId/quantity by construction (see CreateSaleDto).
      const subtotal = dto.items.reduce((sum, line) => sum + byId.get(line.productId)!.unitPrice * line.quantity, 0);

      const [client] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, dto.clientId)).limit(1);
      if (!client) throw new NotFoundAppError('Client', dto.clientId);
      const customerName = client.name;

      // Discount amount is computed from a plain read here; the atomic claim later (which
      // does its own read under a race-safe UPDATE ... WHERE used_in_transaction_id IS NULL)
      // is what actually enforces single-use — this read only needs to be right often
      // enough to price the sale, not to be race-proof.
      let discountAmount = 0;
      if (dto.discountId) {
        const [found] = await tx.select().from(discounts).where(eq(discounts.id, dto.discountId)).limit(1);
        if (!found) throw new NotFoundAppError('Discount', dto.discountId);
        const raw = found.kind === 'percent' ? Math.round((subtotal * found.value) / 100) : found.value;
        discountAmount = Math.min(subtotal, raw);
      }

      const total = subtotal - discountAmount;
      const { year, invoiceNo } = await this.nextInvoiceNumber(tx);

      const [txn] = await tx
        .insert(transactions)
        .values({
          invoiceYear: year,
          invoiceNo,
          soldBy: actor.id,
          clientId: dto.clientId,
          customerName,
          subtotal,
          discountId: dto.discountId,
          discountAmount: dto.discountId ? discountAmount : undefined,
          total,
        })
        .returning();

      await tx.insert(transactionItems).values(
        dto.items.map((line) => ({
          transactionId: txn.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: byId.get(line.productId)!.unitPrice,
        })),
      );

      if (dto.discountId) {
        // Atomic claim — throws DISCOUNT_ALREADY_USED and rolls back this whole
        // transaction (including the rows just inserted above) if it lost the race.
        await this.discounts.claim(tx, dto.discountId, dto.clientId!, txn.id);
      }

      await this.inventory.applyMovements(
        tx,
        dto.items.map((line) => ({
          productId: line.productId,
          delta: -line.quantity,
          reason: 'sale' as const,
          refId: txn.id,
          actorId: actor.id,
        })),
      );

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'sale.create',
        entityType: 'transaction',
        entityId: txn.id,
        after: txn,
      });

      const items = await tx.select().from(transactionItems).where(eq(transactionItems.transactionId, txn.id)).orderBy(asc(transactionItems.id));
      return { ...txn, items };
    });
  }

  /** Gapless, monotonic per year. The row lock implicit in the UPSERT serializes concurrent
   * checkouts on the SAME year row — at this business's volume that's irrelevant; at
   * high-throughput retail it would become the checkout bottleneck, a trade made knowingly. */
  private async nextInvoiceNumber(tx: Database): Promise<{ year: number; invoiceNo: number }> {
    const year = new Date().getFullYear();
    const [row] = await tx.execute<{ next_number: number }>(rawSql`
      insert into invoice_counters (year, next_number) values (${year}, 2)
      on conflict (year) do update set next_number = invoice_counters.next_number + 1
      returning next_number - 1 as next_number
    `);
    return { year, invoiceNo: row.next_number };
  }
}
