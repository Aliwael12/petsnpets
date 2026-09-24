import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { clients, pets, reminders } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateReminderDto, ListRemindersQueryDto } from './dto/reminder.dto';

@Injectable()
export class RemindersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list(query: ListRemindersQueryDto) {
    return this.db.query.reminders.findMany({
      where: query.includeCompleted ? undefined : isNull(reminders.completedAt),
      orderBy: [asc(reminders.dueAt)],
      with: {
        client: { columns: { id: true, name: true } },
        pet: { columns: { id: true, name: true } },
        createdByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  /** Just enough to fill the reminder form's pet picker. Kept here rather than opening up
   *  GET /pets or GET /clients/:id, which are doctor/nurse-only and return far more. */
  petsForClient(clientId: string) {
    return this.db
      .select({ id: pets.id, name: pets.name, species: pets.species })
      .from(pets)
      .where(eq(pets.clientId, clientId))
      .orderBy(asc(pets.name));
  }

  async create(dto: CreateReminderDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, dto.clientId)).limit(1);
      if (!client) throw new NotFoundAppError('Client', dto.clientId);

      if (dto.petId) {
        const [pet] = await tx.select({ clientId: pets.clientId }).from(pets).where(eq(pets.id, dto.petId)).limit(1);
        if (!pet) throw new NotFoundAppError('Pet', dto.petId);
        if (pet.clientId !== dto.clientId) {
          throw new ValidationAppError('That pet belongs to a different client.', { petId: dto.petId, clientId: dto.clientId });
        }
      }

      const [row] = await tx
        .insert(reminders)
        .values({
          clientId: dto.clientId,
          petId: dto.petId,
          description: dto.description,
          dueAt: new Date(dto.dueAt),
          createdBy: actor.id,
        })
        .returning();

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'reminder.create',
        entityType: 'reminder',
        entityId: row.id,
        after: row,
      });
      return row;
    });
  }

  async complete(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(reminders)
        .set({ completedAt: new Date(), completedBy: actor.id })
        .where(and(eq(reminders.id, id), isNull(reminders.completedAt)))
        .returning();
      if (!row) {
        const [existing] = await tx.select({ id: reminders.id }).from(reminders).where(eq(reminders.id, id)).limit(1);
        if (!existing) throw new NotFoundAppError('Reminder', id);
        throw new ValidationAppError('This reminder is already marked done.');
      }

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'reminder.complete',
        entityType: 'reminder',
        entityId: id,
        after: { completedAt: row.completedAt, completedBy: row.completedBy },
      });
      return row;
    });
  }
}
