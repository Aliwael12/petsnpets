import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { boardings, pets } from '../db/schema';
import { SalesService } from '../sales/sales.service';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateBoardingDto, UpdateBoardingDto } from './dto/boarding.dto';

@Injectable()
export class BoardingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
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
        await this.sales.recordBoardingPayment(tx, { boardingId: row.id, clientId: row.clientId, amount: row.paidAmount, method: paymentMethod, actor });
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

      // Every increase in what's been paid is rung up as a sale for the difference. It can't
      // go down here: that money is already a sale. The admin deletes that sale instead,
      // which takes the stay's paid amount down with it.
      const delta = after.paidAmount - before.paidAmount;
      if (delta < 0) {
        throw new ValidationAppError(
          'Money already paid on a stay is recorded as a sale, so it can\u2019t be lowered here. Ask the admin to delete that boarding sale on the Transactions page; the stay\u2019s paid amount goes down with it.',
        );
      }
      if (delta > 0) {
        await this.sales.recordBoardingPayment(tx, { boardingId: id, clientId: after.clientId, amount: delta, method: paymentMethod, actor });
      }

      await this.audit.log(tx, { actorId: actor.id, action: 'boarding.update', entityType: 'boarding', entityId: id, before, after });
      return after;
    });
  }
}
