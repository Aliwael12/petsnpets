import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import { toDayRange, tsInRange } from '../common/date-range';
import type { Database } from '../db/db.types';
import { products, suppliers, supplierOrders } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { CategoriesService } from '../catalog/categories.service';
import type { Actor } from '../auth/auth.types';
import type { CreateSupplierDto, CreateSupplierOrderDto, ListSupplierOrdersQueryDto } from './dto/supplier.dto';

/** Builds a stable SKU for a product first seen on a shipment. Human-readable so it's
 * recognisable on the shelf, suffixed so two similarly-named products can't collide. */
function deriveSku(brand: string | undefined, name: string): string {
  const slug = [brand, name]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug || 'ITEM'}-${suffix}`;
}

@Injectable()
export class PurchasingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly categories: CategoriesService,
    config: ConfigService,
  ) {
    this.tz = config.getOrThrow<string>('TIMEZONE');
  }

  private readonly tz: string;

  listSuppliers() {
    return this.db.select().from(suppliers).orderBy(asc(suppliers.name));
  }

  async createSupplier(dto: CreateSupplierDto) {
    const [row] = await this.db.insert(suppliers).values(dto).returning();
    return row;
  }

  listOrders(query: ListSupplierOrdersQueryDto = {}) {
    const conditions = [
      query.supplierId ? eq(supplierOrders.supplierId, query.supplierId) : undefined,
      query.paymentMethod ? eq(supplierOrders.paymentMethod, query.paymentMethod) : undefined,
      ...tsInRange(supplierOrders.receivedAt, toDayRange(query), this.tz),
    ].filter((c) => c !== undefined);

    return this.db.query.supplierOrders.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (o, { desc }) => [desc(o.receivedAt)],
      with: {
        supplier: { columns: { id: true, name: true } },
        product: { columns: { id: true, name: true, brand: true, category: true } },
        loggedByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  /**
   * Records a shipment and, in the same transaction, restocks it through InventoryService —
   * the same code path a sale or refund would use, so the ledger invariant holds regardless
   * of which direction stock is moving. A shipment for a product that doesn't exist yet
   * creates it here (with zero opening stock, since this very shipment is what stocks it).
   */
  async createOrder(dto: CreateSupplierOrderDto, actor: Actor) {
    // Resolved before opening the transaction: it reads a separate table and can throw a
    // plain validation error, so there's nothing to roll back if the category is bad.
    const category = dto.newProduct ? await this.categories.resolveActiveOrThrow(dto.newProduct.category) : null;
    if (category && category.kind === 'service') {
      throw new ValidationAppError(
        `"${category.label}" is a service category — services aren't received as physical stock.`,
        { category: category.name },
      );
    }

    return this.db.transaction(async (tx) => {
      let productId: string;

      if (dto.newProduct) {
        const [created] = await tx
          .insert(products)
          .values({
            name: dto.newProduct.name,
            brand: dto.newProduct.brand,
            category: dto.newProduct.category,
            kind: 'good',
            sku: deriveSku(dto.newProduct.brand, dto.newProduct.name),
            unitPrice: dto.newProduct.unitPrice,
            stockQuantity: 0,
            lowStockThreshold: dto.newProduct.lowStockThreshold,
          })
          .returning();
        productId = created.id;

        await this.audit.log(tx, {
          actorId: actor.id,
          action: 'product.create',
          entityType: 'product',
          entityId: created.id,
          after: { ...created, via: 'supplier_order' },
        });
      } else {
        const [product] = await tx.select().from(products).where(eq(products.id, dto.productId!)).limit(1);
        if (!product) throw new NotFoundAppError('Product', dto.productId!);
        if (product.kind === 'service') {
          throw new ValidationAppError('Services cannot be received as a supplier shipment — there is no stock to receive.', {
            productId: product.id,
          });
        }
        productId = product.id;
      }

      let supplierId = dto.supplierId;
      if (!supplierId) {
        const [newSupplier] = await tx
          .insert(suppliers)
          .values({ name: dto.newSupplierName!, contactInfo: '' })
          .returning({ id: suppliers.id });
        supplierId = newSupplier.id;
      } else {
        const [existing] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
        if (!existing) throw new NotFoundAppError('Supplier', supplierId);
      }

      const [order] = await tx
        .insert(supplierOrders)
        .values({
          supplierId,
          productId,
          quantity: dto.quantity,
          costTotal: dto.costTotal,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          paymentMethod: dto.paymentMethod,
          loggedBy: actor.id,
        })
        .returning();

      await this.inventory.applyMovement(tx, {
        productId,
        delta: dto.quantity,
        reason: 'supplier_order',
        refId: order.id,
        actorId: actor.id,
      });

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'supplier_order.create',
        entityType: 'supplier_order',
        entityId: order.id,
        after: order,
      });

      return order;
    });
  }
}
