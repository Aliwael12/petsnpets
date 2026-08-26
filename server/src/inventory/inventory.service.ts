import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { products, stockMovements, type Product } from '../db/schema';
import { InsufficientStockError } from '../common/errors/app-error';

export interface MovementRequest {
  productId: string;
  delta: number; // negative = stock leaving (sale), positive = stock arriving (refund, shipment)
  reason: (typeof stockMovements.$inferInsert)['reason'];
  refId?: string;
  actorId: string;
  note?: string;
}

/**
 * The sole writer of stock. Every other module that needs to move stock — sales, refunds,
 * supplier orders — goes through this service so the "cached quantity == sum(ledger)"
 * invariant has exactly one implementation to get right.
 *
 * Callers MUST pass the transactional `tx` handle from their own DB transaction; this
 * service never opens its own transaction, so its writes are always atomic with whatever
 * business operation triggered them.
 */
@Injectable()
export class InventoryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Applies one or more stock movements atomically. Rows are locked `FOR UPDATE` in a
   * stable order (sorted by product id) before any check runs, so two concurrent baskets
   * touching overlapping products can never deadlock against each other — one simply waits
   * for the other's lock, exactly as an ordinary index-order lock protocol requires.
   *
   * Service-kind products are structurally exempt: they never oversell and never accumulate
   * a movement row, regardless of what `delta` was requested for them.
   */
  async applyMovements(tx: Database, requests: MovementRequest[]): Promise<void> {
    if (requests.length === 0) return;

    const productIds = [...new Set(requests.map((r) => r.productId))].sort();

    const rows = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .for('update');

    const byId = new Map<string, Product>(rows.map((p) => [p.id, p]));

    const movementRows: (typeof stockMovements.$inferInsert)[] = [];
    const newQuantityById = new Map<string, number>();

    for (const req of requests) {
      const product = byId.get(req.productId);
      if (!product) continue; // caller is responsible for existence checks up front
      if (product.kind === 'service') continue; // unlimited — never ledgered, never checked

      const current = newQuantityById.get(product.id) ?? product.stockQuantity;
      const next = current + req.delta;
      if (next < 0) {
        throw new InsufficientStockError(product.id, -req.delta, current);
      }
      newQuantityById.set(product.id, next);

      movementRows.push({
        productId: req.productId,
        delta: req.delta,
        reason: req.reason,
        refId: req.refId,
        actorId: req.actorId,
        note: req.note,
      });
    }

    if (movementRows.length > 0) {
      await tx.insert(stockMovements).values(movementRows);
    }

    for (const [productId, quantity] of newQuantityById.entries()) {
      await tx.update(products).set({ stockQuantity: quantity }).where(eq(products.id, productId));
    }
  }

  async applyMovement(tx: Database, request: MovementRequest): Promise<void> {
    await this.applyMovements(tx, [request]);
  }

  async listMovements(productId: string, limit = 100) {
    return this.db.query.stockMovements.findMany({
      where: eq(stockMovements.productId, productId),
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit,
      with: { actor: { columns: { id: true, name: true } } },
    });
  }

  /** Sum of all movements per good product — used by the reconciliation check and by any
   * "does the cache still match the ledger" diagnostics. */
  async reconciliationReport() {
    return this.db.execute<{ id: string; name: string; cached: number; ledgerSum: number }>(rawSql`
      select p.id, p.name, p.stock_quantity as cached, coalesce(sum(m.delta), 0)::int as "ledgerSum"
      from products p
      left join stock_movements m on m.product_id = p.id
      where p.kind = 'good'
      group by p.id, p.name, p.stock_quantity
      having p.stock_quantity <> coalesce(sum(m.delta), 0)
    `);
  }
}
