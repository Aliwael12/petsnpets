import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { petLogs, pets } from '../db/schema';
import { NotFoundAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreatePetLogDto } from './dto/pet-log.dto';

@Injectable()
export class PetLogsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  listForPet(petId: string) {
    return this.db.query.petLogs.findMany({
      where: eq(petLogs.petId, petId),
      orderBy: [desc(petLogs.performedAt)],
      with: { performedByEmployee: { columns: { id: true, name: true } } },
    });
  }

  /** Every pet with a next_due_date, oldest-due-first — overdue vs. upcoming is a
   * presentation concern the caller derives by comparing against "now" itself. */
  async listUpcoming() {
    return this.db.query.petLogs.findMany({
      where: isNotNull(petLogs.nextDueDate),
      orderBy: (l, { asc }) => [asc(l.nextDueDate)],
      with: { pet: { with: { client: { columns: { id: true, name: true } } } } },
    });
  }

  async create(petId: string, dto: CreatePetLogDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [pet] = await tx.select({ id: pets.id }).from(pets).where(eq(pets.id, petId)).limit(1);
      if (!pet) throw new NotFoundAppError('Pet', petId);

      const [row] = await tx
        .insert(petLogs)
        .values({
          petId,
          logType: dto.logType,
          description: dto.description,
          performedBy: actor.id,
          nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
        })
        .returning();

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'pet_log.create',
        entityType: 'pet_log',
        entityId: row.id,
        after: row,
      });
      return row;
    });
  }
}
