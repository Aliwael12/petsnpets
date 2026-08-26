import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { employees } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { DEFAULT_FEATURES_BY_ROLE } from './features';
import type { CreateEmployeeDto, UpdateEmployeeFeaturesDto } from './dto/employee.dto';

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const direct = (err as { code?: string }).code;
  if (direct) return direct;
  // Drizzle wraps the driver's PostgresError as `.cause` on its own thrown error.
  const cause = (err as { cause?: { code?: string } }).cause;
  return cause?.code;
}

function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23503';
}

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Public — just enough to drive the PIN-login picker. Never includes pinHash. */
  listActive() {
    return this.db
      .select({ id: employees.id, name: employees.name, role: employees.role })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.name));
  }

  /** Doctor-only roster view. Still never returns pinHash. */
  list() {
    return this.db
      .select({
        id: employees.id,
        name: employees.name,
        role: employees.role,
        active: employees.active,
        enabledFeatures: employees.enabledFeatures,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .orderBy(asc(employees.name));
  }

  async create(dto: CreateEmployeeDto, actor: Actor) {
    const pinHash = await argon2.hash(dto.pin);
    const enabledFeatures = DEFAULT_FEATURES_BY_ROLE[dto.role];
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(employees)
        .values({ name: dto.name, role: dto.role, pinHash, active: true, enabledFeatures })
        .returning({ id: employees.id, name: employees.name, role: employees.role, active: employees.active, enabledFeatures: employees.enabledFeatures });
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.create',
        entityType: 'employee',
        entityId: row.id,
        after: { name: row.name, role: row.role, enabledFeatures: row.enabledFeatures },
      });
      return row;
    });
  }

  async updateFeatures(id: string, dto: UpdateEmployeeFeaturesDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Employee', id);

      const [after] = await tx
        .update(employees)
        .set({ enabledFeatures: dto.enabledFeatures })
        .where(eq(employees.id, id))
        .returning({ id: employees.id, name: employees.name, role: employees.role, active: employees.active, enabledFeatures: employees.enabledFeatures });

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.update_features',
        entityType: 'employee',
        entityId: id,
        before: { enabledFeatures: before.enabledFeatures },
        after: { enabledFeatures: after.enabledFeatures },
      });
      return after;
    });
  }

  async toggleActive(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Employee', id);

      const [after] = await tx
        .update(employees)
        .set({ active: !before.active })
        .where(eq(employees.id, id))
        .returning({ id: employees.id, name: employees.name, role: employees.role, active: employees.active });

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.toggle_active',
        entityType: 'employee',
        entityId: id,
        before: { active: before.active },
        after: { active: after.active },
      });
      return after;
    });
  }

  async remove(id: string, actor: Actor) {
    if (id === actor.id) {
      throw new ValidationAppError('You cannot remove your own employee account.');
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
        if (!before) throw new NotFoundAppError('Employee', id);

        await tx.delete(employees).where(eq(employees.id, id));
        await this.audit.log(tx, {
          actorId: actor.id,
          action: 'employee.remove',
          entityType: 'employee',
          entityId: id,
          before: { name: before.name, role: before.role },
        });
      });
    } catch (err) {
      // FK restrict violation — this employee has real activity (sales, pet logs, stock
      // movements, ...) and deleting them would orphan or silently falsify that history.
      // Deactivating is the correct action for anyone who has ever actually worked a shift.
      if (isForeignKeyViolation(err)) {
        throw new ValidationAppError(
          'This employee has activity on record (sales, logs, or shipments) and cannot be deleted. Deactivate them instead.',
        );
      }
      throw err;
    }
  }
}
