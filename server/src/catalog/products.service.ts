import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { products } from '../db/schema';
import { NotFoundAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Actor } from '../auth/auth.types';
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
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
    return this.db.transaction(async (tx) => {
      // Insert with zero stock, then move any opening balance through InventoryService —
      // the same discipline as the seed script's "opening balance" movements — so a
      // freshly created product with initial stock never starts life already desynced
      // from its own ledger.
      const openingStock = dto.stockQuantity;
      const [row] = await tx.insert(products).values({ ...dto, stockQuantity: 0 }).returning();

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
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Product', id);

      // If category flips to/from 'service', kind and the stock fields must follow — matches
      // createProductSchema's derivation so a product can never end up category='service'
      // with kind='good' (or vice versa) via an edit. Zeroing stock on that transition goes
      // through InventoryService so the drop is a real ledger movement, not a silent write
      // to the cache that would desync it from stock_movements.
      const nextCategory = dto.category ?? before.category;
      const becomingService = nextCategory === 'service' && before.kind !== 'service';
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
        kind: (becomingService ? 'service' : before.kind) as 'service' | 'good',
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
