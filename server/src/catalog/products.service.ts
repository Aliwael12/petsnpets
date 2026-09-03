import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { products } from '../db/schema';
import { NotFoundAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { CategoriesService } from './categories.service';
import type { Actor } from '../auth/auth.types';
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly categories: CategoriesService,
  ) {}

  async list(query: ListProductsQueryDto) {
    const conditions = [
      query.activeOnly ? eq(products.active, true) : undefined,
      query.category ? eq(products.category, query.category) : undefined,
      query.search ? or(ilike(products.name, `%${query.search}%`), ilike(products.sku, `%${query.search}%`)) : undefined,
    ].filter((c) => c !== undefined);

    return this.db
      .select()
      .from(products)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(products.name));
  }

  /** Typeahead for the Price Checker page — name match only, no category/active filtering
   * beyond "still sellable", ordered by relevance (startsWith beats contains). */
  async priceCheck(q: string) {
    return this.db
      .select()
      .from(products)
      .where(and(eq(products.active, true), ilike(products.name, `%${q}%`)))
      .orderBy(
        rawSql`case when ${products.name} ilike ${q + '%'} then 0 else 1 end`,
        asc(products.name),
      )
      .limit(8);
  }

  async getOrThrow(id: string) {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) throw new NotFoundAppError('Product', id);
    return row;
  }

  async create(dto: CreateProductDto, actor: Actor) {
    // Derived from the category, never client-supplied: a product in a kind='service'
    // category is structurally unlimited, so nothing can (mis)represent a physical good as
    // unlimited stock by request shape.
    const category = await this.categories.resolveActiveOrThrow(dto.category);
    const kind = category.kind;

    return this.db.transaction(async (tx) => {
      // Insert with zero stock, then move any opening balance through InventoryService —
      // the same discipline as the seed script's "opening balance" movements — so a
      // freshly created product with initial stock never starts life already desynced
      // from its own ledger.
      const openingStock = kind === 'service' ? 0 : dto.stockQuantity;
      const [row] = await tx
        .insert(products)
        .values({
          ...dto,
          kind,
          stockQuantity: 0,
          lowStockThreshold: kind === 'service' ? 0 : dto.lowStockThreshold,
        })
        .returning();

      if (openingStock > 0) {
        await this.inventory.applyMovement(tx, {
          productId: row.id,
          delta: openingStock,
          reason: 'adjustment',
          actorId: actor.id,
          note: 'Opening balance',
        });
        row.stockQuantity = openingStock;
      }

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'product.create',
        entityType: 'product',
        entityId: row.id,
        after: row,
      });
      return row;
    });
  }

  async update(id: string, dto: UpdateProductDto, actor: Actor) {
    const [before] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!before) throw new NotFoundAppError('Product', id);

    // Resolved before opening the transaction, like create()'s and PurchasingService's own
    // category lookups: CategoriesService.resolveActiveOrThrow() queries through its own
    // non-transactional `db`, not this method's `tx`. Calling it from inside the transaction
    // used to be exactly the deadlock this comment now prevents — in production, where the
    // pool is capped at one connection per serverless invocation (db.module.ts), the open
    // transaction holds that single connection while awaiting this nested query, which can
    // never get one. Nothing times out fast either: postgres.js queues the query rather than
    // erroring, so the request just hangs until Vercel kills the function at 15s — and the
    // stuck connection isn't released, so every other request the same warm container serves
    // afterward hangs the same way, including edits that never touch the category at all.
    // The pool is 15-deep locally, so this was invisible in dev.
    const nextKind = dto.category && dto.category !== before.category ? (await this.categories.resolveActiveOrThrow(dto.category)).kind : before.kind;

    return this.db.transaction(async (tx) => {
      const becomingService = nextKind === 'service' && before.kind !== 'service';
      if (becomingService && before.stockQuantity !== 0) {
        await this.inventory.applyMovement(tx, {
          productId: id,
          delta: -before.stockQuantity,
          reason: 'adjustment',
          actorId: actor.id,
          note: 'Recategorized to service — stock cleared',
        });
      }
      const patch = {
        ...dto,
        kind: nextKind,
        ...(becomingService ? { lowStockThreshold: 0 } : {}),
      };

      const [after] = await tx.update(products).set(patch).where(eq(products.id, id)).returning();
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'product.update',
        entityType: 'product',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }
}
