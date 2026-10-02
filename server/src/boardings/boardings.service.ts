import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { boardingPayments, boardings, pets } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateBoardingDto, UpdateBoardingDto } from './dto/boarding.dto';

@Injectable()
export class BoardingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.query.boardings.findMany({
      orderBy: [desc(boardings.startDate), desc(boardings.createdAt)],
      with: {
        client: { columns: { id: true, name: true } },
        pet: { columns: { id: true, name: true, species: true } },
        createdByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  async create(dto: CreateBoardingDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [pet] = await tx.select({ clientId: pets.clientId }).from(pets).where(eq(pets.id, dto.petId)).limit(1);
      if (!pet) throw new NotFoundAppError('Pet', dto.petId);
      if (pet.clientId !== dto.clientId) {
        throw new ValidationAppError('That pet belongs to a different client.', { petId: dto.petId, clientId: dto.clientId });
      }

      const { paymentMethod, ...fields } = dto;
      const [row] = await tx
        .insert(boardings)
        .values({ ...fields, createdBy: actor.id })
        .returning();
      if (row.paidAmount > 0) {
        await tx.insert(boardingPayments).values({ boardingId: row.id, amount: row.paidAmount, method: paymentMethod ?? null, loggedBy: actor.id });
      }

      await this.audit.log(tx, { actorId: actor.id, action: 'boarding.create', entityType: 'boarding', entityId: row.id, after: row });
      return row;
    });
  }

  async update(id: string, dto: UpdateBoardingDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(boardings).where(eq(boardings.id, id)).for('update');
      if (!before) throw new NotFoundAppError('Boarding', id);

      // Checked against the merged row: an update may change only one of the two dates.
      const startDate = dto.startDate ?? before.startDate;
      const endDate = dto.endDate ?? before.endDate;
      if (endDate < startDate) throw new ValidationAppError('The stay has to end on or after the day it starts.');

      const { paymentMethod, ...fields } = dto;
      const [after] = await tx
        .update(boardings)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(boardings.id, id))
        .returning();

      // The difference in what's been paid is income (or, if it went down, money given back
      // or a correction) on today's date. A decrease with no method named comes off the
      // method of the stay's latest payment, so the correction lands where the money was.
      const delta = after.paidAmount - before.paidAmount;
      if (delta !== 0) {
        let method = paymentMethod ?? null;
        if (!method && delta < 0) {
          const [last] = await tx
            .select({ method: boardingPayments.method })
            .from(boardingPayments)
            .where(eq(boardingPayments.boardingId, id))
            .orderBy(desc(boardingPayments.paidAt))
            .limit(1);
          method = last?.method ?? null;
        }
        await tx.insert(boardingPayments).values({ boardingId: id, amount: delta, method, loggedBy: actor.id });
      }

      await this.audit.log(tx, { actorId: actor.id, action: 'boarding.update', entityType: 'boarding', entityId: id, before, after });
      return after;
    });
  }
}
