import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, gte, inArray, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import { toDayRange, tsInRange } from '../common/date-range';
import type { Database } from '../db/db.types';
import {
  boardings,
  clients,
  discounts,
  employees,
  products,
  refunds,
  stockMovements,
  transactionItems,
  transactionPayments,
  transactions,
  type Discount,
  type Product,
} from '../db/schema';
import { ForbiddenAppError, NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import { DiscountsService } from '../discounts/discounts.service';
import type { Actor } from '../auth/auth.types';
import type { CreateSaleDto, ListSalesQueryDto, PaymentLine, UpdateSaleDto } from './dto/sale.dto';

/** The hidden service product every boarding payment is rung up as (seeded by migration). */
export const BOARDING_SKU = 'BOARDING';

/** What an unlinked sale is billed to, on the invoice and in every list. */
const WALK_IN_CUSTOMER_NAME = 'Walk-in customer';

const PAYMENT_COLUMNS = { columns: { method: true, amount: true } } as const;

const egpLabel = (piastres: number) => `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** What every sale list and read returns alongside the sale itself. */
const SALE_RELATIONS = {
  items: { with: { product: { columns: { id: true, name: true } } } },
  payments: PAYMENT_COLUMNS,
  soldByEmployee: { columns: { id: true, name: true } },
  client: { columns: { id: true, name: true, legacyId: true } },
  discount: { columns: { id: true, kind: true, value: true, note: true } },
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
    throw new ValidationAppError(`The payments add up to ${egpLabel(paid)}, but the bill is ${egpLabel(total)}.`, { paid, total });
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
   * Corrects who a sale was for, when it happened, how it was paid and (admin only) which
   * discount it carries. Always audited with the before and after, so a correction is never
   * silent. Items and prices stay as rung up — that's what a refund is for.
   */
  async update(id: string, dto: UpdateSaleDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
      if (!before) throw new NotFoundAppError('Transaction', id);
      const beforePayments = await tx
        .select({ method: transactionPayments.method, amount: transactionPayments.amount })
        .from(transactionPayments)
        .where(eq(transactionPayments.transactionId, id));
      const [beforeDiscount] = before.discountId
        ? await tx.select().from(discounts).where(eq(discounts.id, before.discountId)).limit(1)
        : [];

      const discountChanging = dto.discountId !== undefined && dto.discountId !== before.discountId;
      if (discountChanging && before.boardingId) {
        throw new ValidationAppError('A boarding payment can\u2019t take a discount. Lower the stay\u2019s total on the Boarding page instead.');
      }
      if (discountChanging) {
        // Changes what the customer was charged, so it stays with the owner.
        if (actor.role !== 'admin') throw new ForbiddenAppError('Only an admin can change the discount on a sale.');
        const [{ refunded }] = await tx.select({ refunded: rawSql<number>`count(*)::int` }).from(refunds).where(eq(refunds.transactionId, id));
        if (refunded > 0) {
          throw new ValidationAppError('This sale has been partly or fully refunded, so its discount can’t be changed — the refunds were priced on the old total.');
        }
      }

      let customer = { clientId: before.clientId, customerName: before.customerName };
      if (dto.clientId !== undefined && dto.clientId !== before.clientId) {
        if (dto.clientId === null) {
          customer = { clientId: null, customerName: WALK_IN_CUSTOMER_NAME };
        } else {
          // Same rule as checkout: the name comes from the client record, never free text.
          const [client] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, dto.clientId)).limit(1);
          if (!client) throw new NotFoundAppError('Client', dto.clientId);
          customer = { clientId: dto.clientId, customerName: client.name };
        }
        await tx.update(transactions).set(customer).where(eq(transactions.id, id));
      }

      // The discount the sale ends up with, and what it takes off. A discount belongs to one
      // client, so it must belong to whoever the sale ends up being for.
      const finalDiscountId = discountChanging ? dto.discountId! : before.discountId;
      let finalDiscount: Discount | null = beforeDiscount ?? null;
      if (discountChanging && finalDiscountId) {
        const [found] = await tx.select().from(discounts).where(eq(discounts.id, finalDiscountId)).limit(1);
        if (!found) throw new NotFoundAppError('Discount', finalDiscountId);
        finalDiscount = found;
      } else if (discountChanging) {
        finalDiscount = null;
      }
      if (finalDiscount && finalDiscount.clientId !== customer.clientId) {
        throw new ValidationAppError(
          discountChanging
            ? 'That discount belongs to a different client than this sale.'
            : 'This sale used a customer discount, so its customer can’t be changed. Remove the discount first.',
        );
      }

      let total = before.total;
      let discountAmount = before.discountAmount;
      if (discountChanging) {
        if (before.discountId) {
          // Hand the old discount back to its client, unused.
          await tx.update(discounts).set({ usedInTransactionId: null }).where(eq(discounts.id, before.discountId));
        }
        if (finalDiscount) {
          await this.discounts.claim(tx, finalDiscount.id, customer.clientId!, id);
          const raw = finalDiscount.kind === 'percent' ? Math.round((before.subtotal * finalDiscount.value) / 100) : finalDiscount.value;
          discountAmount = Math.min(before.subtotal, raw);
        } else {
          discountAmount = null;
        }
        total = before.subtotal - (discountAmount ?? 0);
        await tx.update(transactions).set({ discountId: finalDiscount?.id ?? null, discountAmount, total }).where(eq(transactions.id, id));
      }

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

      // Payments always add up to the total. When a discount moves the total and no new split
      // was sent, a single-method sale simply follows it; a split one has to be re-split.
      let payments: PaymentLine[] = beforePayments;
      if (dto.payments !== undefined) {
        payments = normalizePayments(dto.payments, total);
      } else if (total !== before.total && beforePayments.length === 1) {
        payments = total > 0 ? [{ method: beforePayments[0].method, amount: total }] : [];
      } else if (total !== before.total && beforePayments.length > 1) {
        throw new ValidationAppError(`This sale was split between methods — adjust the split to the new total of ${egpLabel(total)}.`);
      }
      if (payments !== beforePayments) {
        await tx.delete(transactionPayments).where(eq(transactionPayments.transactionId, id));
        if (payments.length > 0) {
          await tx.insert(transactionPayments).values(payments.map((p) => ({ ...p, transactionId: id })));
        }
      }

      const discountLabel = (d: typeof finalDiscount) =>
        d ? `${d.kind === 'percent' ? `${d.value}%` : egpLabel(d.value)} off${d.note ? ` (${d.note})` : ''}` : null;
      const snapshot = (name: string, at: Date, paid: PaymentLine[], d: typeof finalDiscount, sum: number) => ({
        invoice: `INV-${before.invoiceYear}-${String(before.invoiceNo).padStart(5, '0')}`,
        customer: name,
        occurredAt: at.toISOString(),
        discount: discountLabel(d),
        total: sum,
        payments: paid,
      });
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'sale.update',
        entityType: 'transaction',
        entityId: id,
        before: snapshot(before.customerName, before.createdAt, beforePayments, beforeDiscount ?? null, before.total),
        after: snapshot(customer.customerName, occurredAt, payments, finalDiscount, total),
      });

      const row = await tx.query.transactions.findFirst({ where: eq(transactions.id, id), with: SALE_RELATIONS });
      return row!;
    });
  }

  /**
   * Admin only: removes a sale as if it had never been rung up — its items and payments go,
   * every stock movement it made is reversed (so the ledger still sums to the count), and a
   * discount it used goes back to the client unused. A full copy is kept in the audit log.
   * A refunded sale can't be deleted: the refund has its own money and stock trail.
   */
  async remove(id: string, actor: Actor) {
    await this.db.transaction((tx) => this.removeInTx(tx, id, actor));
  }

  /** remove(), inside a caller's transaction: deleting a boarding stay removes its sales. */
  async removeInTx(tx: Database, id: string, actor: Actor) {
    const [txn] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
    if (!txn) throw new NotFoundAppError('Transaction', id);
    const [{ refunded }] = await tx.select({ refunded: rawSql<number>`count(*)::int` }).from(refunds).where(eq(refunds.transactionId, id));
    if (refunded > 0) {
      throw new ValidationAppError('This sale has refunds recorded against it, so it can’t be deleted.');
    }

    const items = await tx.select().from(transactionItems).where(eq(transactionItems.transactionId, id));
    const payments = await tx
      .select({ method: transactionPayments.method, amount: transactionPayments.amount })
      .from(transactionPayments)
      .where(eq(transactionPayments.transactionId, id));
    const movements = await tx.select().from(stockMovements).where(eq(stockMovements.refId, id));

    // Undo the sale's net effect on each product's count (including any "topped up"
    // adjustment it triggered), then drop its ledger rows.
    const netByProduct = new Map<string, number>();
    for (const m of movements) netByProduct.set(m.productId, (netByProduct.get(m.productId) ?? 0) + m.delta);
    for (const productId of [...netByProduct.keys()].sort()) {
      await tx
        .update(products)
        .set({ stockQuantity: rawSql`${products.stockQuantity} - ${netByProduct.get(productId)!}` })
        .where(eq(products.id, productId));
    }
    await tx.delete(stockMovements).where(eq(stockMovements.refId, id));
    if (txn.discountId) {
      await tx.update(discounts).set({ usedInTransactionId: null }).where(eq(discounts.id, txn.discountId));
    }
    if (txn.boardingId) {
      // The money this sale recorded is no longer paid on the stay.
      await tx
        .update(boardings)
        .set({ paidAmount: rawSql`greatest(${boardings.paidAmount} - ${txn.total}, 0)`, updatedAt: new Date() })
        .where(eq(boardings.id, txn.boardingId));
    }
    await tx.delete(transactions).where(eq(transactions.id, id)); // items and payments cascade

    await this.audit.log(tx, {
      actorId: actor.id,
      action: 'sale.delete',
      entityType: 'transaction',
      entityId: id,
      before: {
        invoice: `INV-${txn.invoiceYear}-${String(txn.invoiceNo).padStart(5, '0')}`,
        customer: txn.customerName,
        total: txn.total,
        transaction: txn,
        items,
        payments,
        stockMovements: movements,
      },
    });
  }

  /**
   * Rings up money paid on a boarding stay as an ordinary sale: one "Boarding" line at the
   * amount paid, for the stay's client, sold by whoever entered it, paid by `method` (or
   * not recorded). Runs inside the boarding's own transaction so the stay and its sale
   * commit together.
   */
  async recordBoardingPayment(
    tx: Database,
    p: { boardingId: string; clientId: string; amount: number; method?: PaymentLine['method']; actor: Actor },
  ) {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, BOARDING_SKU)).limit(1);
    if (!product) throw new NotFoundAppError('Product', BOARDING_SKU);
    const [client] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, p.clientId)).limit(1);
    if (!client) throw new NotFoundAppError('Client', p.clientId);

    const { year, invoiceNo } = await this.nextInvoiceNumber(tx);
    const [txn] = await tx
      .insert(transactions)
      .values({
        invoiceYear: year,
        invoiceNo,
        soldBy: p.actor.id,
        clientId: p.clientId,
        customerName: client.name,
        subtotal: p.amount,
        total: p.amount,
        boardingId: p.boardingId,
      })
      .returning();
    await tx.insert(transactionItems).values({ transactionId: txn.id, productId: product.id, quantity: 1, unitPrice: p.amount });
    const payments = p.method ? [{ method: p.method, amount: p.amount }] : [];
    if (payments.length > 0) {
      await tx.insert(transactionPayments).values(payments.map((x) => ({ ...x, transactionId: txn.id })));
    }
    await this.audit.log(tx, {
      actorId: p.actor.id,
      action: 'sale.create',
      entityType: 'transaction',
      entityId: txn.id,
      after: { ...txn, payments, via: 'boarding' },
    });
    return txn;
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
