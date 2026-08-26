import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../../db/db.constants';
import type { Database } from '../../db/db.types';
import { auditLog } from '../../db/schema';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes to audit_log. Call this with the *transactional* `tx` handle from inside the same
 * DB transaction as the mutation it's describing, so the audit trail can never exist without
 * the change it documents (or vice versa).
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async log(tx: Database, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values(this.row(entry));
  }

  /** For events with no natural surrounding transaction (login, logout). */
  async logDirect(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values(this.row(entry));
  }

  private row(entry: AuditEntry) {
    return {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? null : entry.before,
      after: entry.after === undefined ? null : entry.after,
    };
  }
}
