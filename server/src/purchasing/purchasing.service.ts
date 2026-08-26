import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { products, suppliers, supplierOrders } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Actor } from '../auth/auth.types';
import type { CreateSupplierDto, CreateSupplierOrderDto } from './dto/supplier.dto';

@Injectable()
export class PurchasingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  listSuppliers() {
    return this.db.select().from(suppliers).orderBy(asc(suppliers.name));
  }

  async createSupplier(dto: CreateSupplierDto) {
    const [row] = await this.db.insert(suppliers).values(dto).returning();
    return row;
  }

  listOrders() {
    return this.db.query.supplierOrders.findMany({
      orderBy: (o, { desc }) => [desc(o.receivedAt)],
      with: {
        supplier: { columns: { id: true, name: true } },
        product: { columns: { id: true, name: true } },
        loggedByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  /**
   * Records a shipment and, in the same transaction, restocks it through InventoryService —
   * the same code path a sale or refund would use, so the ledger invariant holds regardless
   * of which direction stock is moving.
   */
  async createOrder(dto: CreateSupplierOrderDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, dto.productId)).limit(1);
      if (!product) throw new NotFoundAppError('Product', dto.productId);
      if (product.kind === 'service') {
        throw new ValidationAppError('Services cannot be received as a supplier shipment — there is no stock to receive.', {
          productId: product.id,
        });
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
          productId: dto.productId,
          quantity: dto.quantity,
          costTotal: dto.costTotal,
          loggedBy: actor.id,
        })
        .returning();

      await this.inventory.applyMovement(tx, {
        productId: dto.productId,
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
