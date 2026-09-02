import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { productCategories, products } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const direct = (err as { code?: string }).code;
  const cause = (err as { cause?: { code?: string } }).cause?.code;
  return direct === '23505' || cause === '23505';
}

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Every category plus how many products reference it — the count is what the UI needs
   * to explain why a given category can't be deleted, so it comes back with the list
   * rather than requiring a follow-up request per row. */
  async list() {
    // A LEFT JOIN + GROUP BY rather than a correlated subquery: an inline
    // sql`(select count(*) ... )` referencing both tables did not render as a correlated
    // subquery through Drizzle's interpolation here and silently returned 0 for every row.
    // count() over the join is both correct and plain query-builder code.
    return this.db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        label: productCategories.label,
        kind: productCategories.kind,
        active: productCategories.active,
        isSystem: productCategories.isSystem,
        sortOrder: productCategories.sortOrder,
        createdAt: productCategories.createdAt,
        // count() of the joined column, not count(*) — the latter would count the single
        // all-NULL row a LEFT JOIN produces for a category with no products, reporting 1.
        productCount: rawSql<number>`count(${products.id})::int`,
      })
      .from(productCategories)
      .leftJoin(products, eq(products.category, productCategories.name))
      .groupBy(productCategories.id)
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.label));
  }

  async create(dto: CreateCategoryDto, actor: Actor) {
    try {
      const [row] = await this.db
        .insert(productCategories)
        .values({ ...dto, isSystem: false })
        .returning();
      await this.audit.logDirect({
        actorId: actor.id,
        action: 'category.create',
        entityType: 'product_category',
        entityId: row.id,
        after: row,
      });
      return { ...row, productCount: 0 };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ValidationAppError(`A category named "${dto.name}" already exists.`, { name: dto.name });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Category', id);

      // Deactivating hides a category from the "create a product" pickers but leaves
      // existing products (and their history) untouched — that's the whole point of having
      // `active` separate from deletion.
      const [after] = await tx
        .update(productCategories)
        .set(dto)
        .where(eq(productCategories.id, id))
        .returning();

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'category.update',
        entityType: 'product_category',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }

  async remove(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Category', id);

      if (before.isSystem) {
        throw new ValidationAppError(
          `"${before.label}" is a built-in category the system depends on and cannot be deleted. Deactivate it instead.`,
        );
      }

      // Checked explicitly rather than relying on the FK's ON DELETE RESTRICT purely so the
      // message can name the count — the constraint is still the real guarantee underneath,
      // and would reject this even if two deletes raced past this check.
      const [{ count }] = await tx
        .select({ count: rawSql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.category, before.name));
      if (count > 0) {
        throw new ValidationAppError(
          `"${before.label}" still has ${count} product${count === 1 ? '' : 's'} in it. Move or remove them first, or deactivate the category instead.`,
          { productCount: count },
        );
      }

      await tx.delete(productCategories).where(eq(productCategories.id, id));
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'category.delete',
        entityType: 'product_category',
        entityId: id,
        before,
      });
    });
  }

  /** Resolves a category by name for product creation/import, rejecting unknown or
   * deactivated ones. Returns the row so callers can take `kind` from it. */
  async resolveActiveOrThrow(name: string) {
    const [row] = await this.db.select().from(productCategories).where(eq(productCategories.name, name)).limit(1);
    if (!row) throw new ValidationAppError(`Unknown category "${name}".`, { category: name });
    if (!row.active) throw new ValidationAppError(`Category "${row.label}" is no longer active.`, { category: name });
    return row;
  }
}
