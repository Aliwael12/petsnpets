import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, gte, inArray, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import { toDayRange, tsInRange } from '../common/date-range';
import type { Database } from '../db/db.types';
import { clients, discounts, employees, products, transactionItems, transactionPayments, transactions, type Product } from '../db/schema';
import { ForbiddenAppError, NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import { DiscountsService } from '../discounts/discounts.service';
import type { Actor } from '../auth/auth.types';
import type { CreateSaleDto, ListSalesQueryDto, PaymentLine, UpdateSaleDto } from './dto/sale.dto';

/** What an unlinked sale is billed to, on the invoice and in every list. */
const WALK_IN_CUSTOMER_NAME = 'Walk-in customer';

const PAYMENT_COLUMNS = { columns: { method: true, amount: true } } as const;

/** What every sale list and read returns alongside the sale itself. */
const SALE_RELATIONS = {
  items: { with: { product: { columns: { id: true, name: true } } } },
  payments: PAYMENT_COLUMNS,
  soldByEmployee: { columns: { id: true, name: true } },
  client: { columns: { id: true, name: true, legacyId: true } },
} as const;

/** The payment rows for a new sale: the explicit split if given, else the legacy single
 *  method as the whole total, else none ("not recorded"). */
function resolvePayments(dto: CreateSaleDto, total: number): PaymentLine[] {
  if (dto.payments && dto.payments.length > 0) return normalizePayments(dto.payments, total);
  if (dto.paymentMethod && total > 0) return [{ method: dto.paymentMethod, amount: total }];
  return [];
}

/**
 * Merges lines that name the same method, then insists they add up to exactly the bill:
 * a split that's short or over would make the drawer and the books disagree. An empty list
 * is valid and means "not recorded".
 */
function normalizePayments(lines: PaymentLine[], total: number): PaymentLine[] {
  const byMethod = new Map<PaymentLine['method'], number>();
  for (const line of lines) byMethod.set(line.method, (byMethod.get(line.method) ?? 0) + line.amount);
  const merged = [...byMethod].map(([method, amount]) => ({ method, amount }));
  const paid = merged.reduce((sum, p) => sum + p.amount, 0);
  if (merged.length > 0 && paid !== total) {
    const egp = (piastres: number) => `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    throw new ValidationAppError(`The payments add up to ${egp(paid)}, but the bill is ${egp(total)}.`, { paid, total });
  }
  return merged;
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
    config: ConfigService,
  ) {
    this.tz = config.getOrThrow<string>('TIMEZONE');
  }

  private readonly tz: string;

  async list(query: ListSalesQueryDto) {
    const conditions = [
      query.soldBy ? eq(transactions.soldBy, query.soldBy) : undefined,
      query.clientId ? eq(transactions.clientId, query.clientId) : undefined,
      query.sinceDays ? gte(transactions.createdAt, rawSql`now() - (${query.sinceDays} || ' days')::interval`) : undefined,
      // Inclusive Cairo day bounds. Independent of sinceDays: one is a rolling instant
      // window, the other a calendar window, and supplying both simply intersects them.
      ...tsInRange(transactions.createdAt, toDayRange(query), this.tz),
    ].filter((c) => c !== undefined);

    let rows = await this.db.query.transactions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(transactions.createdAt)],
      with: SALE_RELATIONS,
    });

    if (query.productId) {
      rows = rows.filter((t) => t.items.some((it) => it.productId === query.productId));
    }
    return rows;
  }

  async getOrThrow(id: string) {
    const row = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: { items: { with: { product: true } }, payments: PAYMENT_COLUMNS },
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

      let customerName = WALK_IN_CUSTOMER_NAME;
      if (dto.clientId) {
        const [client] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, dto.clientId)).limit(1);
        if (!client) throw new NotFoundAppError('Client', dto.clientId);
        customerName = client.name;
      } else if (dto.discountId) {
        throw new ValidationAppError('A discount belongs to a client — pick the customer to apply it.');
      }

      const soldBy = await this.resolveSoldBy(tx, dto.soldBy, actor);

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
      const payments = resolvePayments(dto, total);
      const { year, invoiceNo } = await this.nextInvoiceNumber(tx);

      const [txn] = await tx
        .insert(transactions)
        .values({
          invoiceYear: year,
          invoiceNo,
          soldBy,
          clientId: dto.clientId,
          customerName,
          subtotal,
          discountId: dto.discountId,
          discountAmount: dto.discountId ? discountAmount : undefined,
          total,
        })
        .returning();

      if (payments.length > 0) {
        await tx.insert(transactionPayments).values(payments.map((p) => ({ ...p, transactionId: txn.id })));
      }

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
          allowOversell: true,
        })),
      );

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'sale.create',
        entityType: 'transaction',
        entityId: txn.id,
        after: { ...txn, payments },
      });

      const items = await tx.select().from(transactionItems).where(eq(transactionItems.transactionId, txn.id)).orderBy(asc(transactionItems.id));
      return { ...txn, items, payments };
    });
  }

  /**
   * Corrects when a sale happened and/or how it was paid. Open to every role (the till is
   * everyone's), and always audited with the before and after, so a correction is never
   * silent. Nothing else about a sale is editable here: items and prices stay as rung up.
   */
  async update(id: string, dto: UpdateSaleDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
      if (!before) throw new NotFoundAppError('Transaction', id);
      const beforePayments = await tx
        .select({ method: transactionPayments.method, amount: transactionPayments.amount })
        .from(transactionPayments)
        .where(eq(transactionPayments.transactionId, id));

      let occurredAt = before.createdAt;
      if (dto.occurredAt !== undefined) {
        // Converted in Postgres with the clinic's timezone rather than in JS, the same way
        // every date bound in this app is: Cairo's UTC offset changes with daylight saving.
        const [{ at }] = await tx.execute<{ at: Date | string }>(
          rawSql`select (${dto.occurredAt}::timestamp at time zone ${this.tz}) as at`,
        );
        occurredAt = new Date(at);
        if (occurredAt.getTime() > Date.now() + 60_000) {
          throw new ValidationAppError('A sale can’t be dated in the future.');
        }
        await tx.update(transactions).set({ createdAt: occurredAt }).where(eq(transactions.id, id));
      }

      let payments: PaymentLine[] = beforePayments;
      if (dto.payments !== undefined) {
        payments = normalizePayments(dto.payments, before.total);
        await tx.delete(transactionPayments).where(eq(transactionPayments.transactionId, id));
        if (payments.length > 0) {
          await tx.insert(transactionPayments).values(payments.map((p) => ({ ...p, transactionId: id })));
        }
      }

      const snapshot = (at: Date, paid: PaymentLine[]) => ({
        invoice: `INV-${before.invoiceYear}-${String(before.invoiceNo).padStart(5, '0')}`,
        customer: before.customerName,
        occurredAt: at.toISOString(),
        payments: paid,
      });
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'sale.update',
        entityType: 'transaction',
        entityId: id,
        before: snapshot(before.createdAt, beforePayments),
        after: snapshot(occurredAt, payments),
      });

      const row = await tx.query.transactions.findFirst({ where: eq(transactions.id, id), with: SALE_RELATIONS });
      return row!;
    });
  }

  /** Only a cashier or admin may ring up a sale on someone else's behalf — a doctor or nurse
   * checking out always gets attributed to themselves, regardless of what the client sends. */
  private async resolveSoldBy(tx: Database, requested: string | undefined, actor: Actor): Promise<string> {
    if (!requested || requested === actor.id) return actor.id;
    if (actor.role !== 'admin' && actor.role !== 'cashier') {
      throw new ForbiddenAppError('Only a cashier or admin can attribute a sale to someone else.');
    }
    const [target] = await tx.select({ id: employees.id, active: employees.active }).from(employees).where(eq(employees.id, requested)).limit(1);
    if (!target) throw new NotFoundAppError('Employee', requested);
    if (!target.active) throw new ValidationAppError('That employee is not active.', { employeeId: requested });
    return target.id;
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
