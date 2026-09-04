import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql as rawSql } from 'drizzle-orm';
import argon2 from 'argon2';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { employees } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { DEFAULT_FEATURES_BY_ROLE } from './features';
import { DEFAULT_PERMISSIONS_BY_ROLE } from './permissions';
import type { CreateEmployeeDto, UpdateEmployeeFeaturesDto, UpdateEmployeeRoleDto } from './dto/employee.dto';

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

  /** Roster view for whoever holds employees:manage. Still never returns pinHash. */
  list() {
    return this.db
      .select({
        id: employees.id,
        name: employees.name,
        role: employees.role,
        active: employees.active,
        enabledFeatures: employees.enabledFeatures,
        permissions: employees.permissions,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .orderBy(asc(employees.name));
  }

  async create(dto: CreateEmployeeDto, actor: Actor) {
    const pinHash = await argon2.hash(dto.pin);
    const enabledFeatures = DEFAULT_FEATURES_BY_ROLE[dto.role];
    // Only an admin is born with grants; everyone else starts at zero and receives them
    // one at a time, so a new hire can never quietly arrive holding the keys.
    const permissions = DEFAULT_PERMISSIONS_BY_ROLE[dto.role];
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(employees)
        .values({ name: dto.name, role: dto.role, pinHash, active: true, enabledFeatures, permissions })
        .returning({
          id: employees.id,
          name: employees.name,
          role: employees.role,
          active: employees.active,
          enabledFeatures: employees.enabledFeatures,
          permissions: employees.permissions,
        });
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.create',
        entityType: 'employee',
        entityId: row.id,
        after: { name: row.name, role: row.role, enabledFeatures: row.enabledFeatures, permissions: row.permissions },
      });
      return row;
    });
  }

  /**
   * Changes an employee's role. Guarded against self-demotion: giving away the role that
   * authorized the request revokes the caller's own access mid-flight, and if they were the
   * last admin nobody is left who can undo it.
   */
  async updateRole(id: string, dto: UpdateEmployeeRoleDto, actor: Actor) {
    if (id === actor.id) {
      throw new ValidationAppError('You cannot change your own role. Ask an admin to do it.');
    }

    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Employee', id);

      if (before.role === dto.role && !dto.resetFeatures) return before;

      // Losing the last active admin would leave nobody able to manage staff, the catalog
      // or the books, and no way to grant anyone else those rights — the clinic would be
      // permanently locked out of its own system.
      if (before.role === 'admin' && dto.role !== 'admin') {
        await this.assertNotLastAdmin(tx, 'change this role');
      }

      const [after] = await tx
        .update(employees)
        .set({
          role: dto.role,
          ...(dto.resetFeatures
            ? { enabledFeatures: DEFAULT_FEATURES_BY_ROLE[dto.role], permissions: DEFAULT_PERMISSIONS_BY_ROLE[dto.role] }
            : {}),
        })
        .where(eq(employees.id, id))
        .returning({
          id: employees.id,
          name: employees.name,
          role: employees.role,
          active: employees.active,
          enabledFeatures: employees.enabledFeatures,
          permissions: employees.permissions,
        });

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.update_role',
        entityType: 'employee',
        entityId: id,
        before: { role: before.role, enabledFeatures: before.enabledFeatures, permissions: before.permissions },
        after: { role: after.role, enabledFeatures: after.enabledFeatures, permissions: after.permissions },
      });
      return after;
    });
  }

  /**
   * Refuses anything that would remove the clinic's only remaining way in.
   *
   * Admin is the only role that can grant permissions, so if the last one disappears there
   * is no path back — not through the UI, not through another role, not by asking a
   * colleague. Every operation that could drop the count runs through here.
   */
  private async assertNotLastAdmin(tx: Database, action: string) {
    const [{ count }] = await tx
      .select({ count: rawSql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.role, 'admin'), eq(employees.active, true)));
    if (count <= 1) {
      throw new ValidationAppError(
        `This is the last active admin — nobody else could manage staff or grant access. Make someone else an admin before you ${action}.`,
      );
    }
  }

  /**
   * Saves the nav tabs and the permission grants together — one screen, one save.
   *
   * Grants are only written when the caller actually sent them, so a client that predates
   * permissions can still change tabs without silently revoking everything on the row.
   */
  async updateFeatures(id: string, dto: UpdateEmployeeFeaturesDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Employee', id);

      const [after] = await tx
        .update(employees)
        .set({
          enabledFeatures: dto.enabledFeatures,
          ...(dto.permissions ? { permissions: dto.permissions } : {}),
        })
        .where(eq(employees.id, id))
        .returning({
          id: employees.id,
          name: employees.name,
          role: employees.role,
          active: employees.active,
          enabledFeatures: employees.enabledFeatures,
          permissions: employees.permissions,
        });

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'employee.update_features',
        entityType: 'employee',
        entityId: id,
        before: { enabledFeatures: before.enabledFeatures, permissions: before.permissions },
        after: { enabledFeatures: after.enabledFeatures, permissions: after.permissions },
      });
      return after;
    });
  }

  async toggleActive(id: string, actor: Actor) {
    // Deactivating yourself takes effect on the very next request — OperatorAuthGuard
    // rejects inactive employees — so it is an instant self-lockout, and if you were the
    // last admin nobody is left who can undo it. Both guards below close that door.
    if (id === actor.id) {
      throw new ValidationAppError('You cannot deactivate your own account.');
    }

    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Employee', id);

      if (before.active && before.role === 'admin') {
        await this.assertNotLastAdmin(tx, 'deactivate this account');
      }

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
        if (before.role === 'admin' && before.active) {
          await this.assertNotLastAdmin(tx, 'remove this account');
        }

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
