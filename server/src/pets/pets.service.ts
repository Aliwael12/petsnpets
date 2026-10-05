import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { boardings, clientPhones, clients, petLogs, petPhones, pets, reminders } from '../db/schema';
import { NotFoundAppError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreatePetDto, ListPetsQueryDto, UpdatePetDto } from './dto/pet.dto';

@Injectable()
export class PetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /**
   * Admin only. Edits a pet's details and/or moves it to another client. Moving it also moves
   * its open reminders, so they follow the new owner; past stays, logs and sales keep the
   * client they happened under.
   */
  async update(id: string, dto: UpdatePetDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(pets).where(eq(pets.id, id)).for('update');
      if (!before) throw new NotFoundAppError('Pet', id);
      if (dto.clientId && dto.clientId !== before.clientId) {
        const [owner] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, dto.clientId)).limit(1);
        if (!owner) throw new NotFoundAppError('Client', dto.clientId);
        await tx
          .update(reminders)
          .set({ clientId: dto.clientId })
          .where(and(eq(reminders.petId, id), isNull(reminders.completedAt)));
      }
      const [after] = await tx.update(pets).set(dto).where(eq(pets.id, id)).returning();
      await this.audit.log(tx, { actorId: actor.id, action: 'pet.update', entityType: 'pet', entityId: id, before, after });
      return this.getOrThrowTx(tx, id);
    });
  }

  /**
   * Admin only. Refused while the pet has medical logs or boarding stays — those are its
   * history, so a pet that has any is moved to the right client instead of deleted.
   */
  async remove(id: string, actor: Actor) {
    await this.db.transaction(async (tx) => {
      const [pet] = await tx.select().from(pets).where(eq(pets.id, id)).for('update');
      if (!pet) throw new NotFoundAppError('Pet', id);
      const [{ logs }] = await tx.select({ logs: count() }).from(petLogs).where(eq(petLogs.petId, id));
      const [{ stays }] = await tx.select({ stays: count() }).from(boardings).where(eq(boardings.petId, id));
      if (logs > 0 || stays > 0) {
        const parts = [logs > 0 ? `${logs} log${logs === 1 ? '' : 's'}` : null, stays > 0 ? `${stays} boarding stay${stays === 1 ? '' : 's'}` : null].filter(Boolean);
        throw new ValidationAppError(
          `${pet.name} has ${parts.join(' and ')}, so it can\u2019t be deleted. To take it off this client, move it to the right client instead.`,
        );
      }
      await tx.delete(pets).where(eq(pets.id, id)); // its phones and reminders cascade
      await this.audit.log(tx, { actorId: actor.id, action: 'pet.delete', entityType: 'pet', entityId: id, before: pet });
    });
  }

  async list(query: ListPetsQueryDto) {
    const all = await this.db
      .select({ pet: pets, client: { id: clients.id, name: clients.name } })
      .from(pets)
      .innerJoin(clients, eq(pets.clientId, clients.id))
      .orderBy(pets.name);

    const shaped = all.map((row) => ({ ...row.pet, client: row.client }));
    if (!query.search) return shaped;
    const q = query.search.toLowerCase();
    return shaped.filter((p) => p.name.toLowerCase().includes(q) || p.client.name.toLowerCase().includes(q));
  }

  async getOrThrow(id: string) {
    const row = await this.db.query.pets.findFirst({
      where: eq(pets.id, id),
      with: { client: { with: { phones: true } }, phones: true },
    });
    if (!row) throw new NotFoundAppError('Pet', id);
    return row;
  }

  async create(dto: CreatePetDto) {
    return this.db.transaction(async (tx) => {
      let clientId = dto.clientId;
      if (!clientId && dto.newClient) {
        const [newClient] = await tx.insert(clients).values({ name: dto.newClient.name }).returning({ id: clients.id });
        clientId = newClient.id;
        await tx.insert(clientPhones).values(
          dto.newClient.phones.map((phone, i) => ({ clientId: newClient.id, phone, isPrimary: i === 0 })),
        );
      } else if (clientId) {
        const [existing] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
        if (!existing) throw new NotFoundAppError('Client', clientId);
      }

      const [pet] = await tx
        .insert(pets)
        .values({
          name: dto.name,
          species: dto.species,
          breed: dto.breed,
          sex: dto.sex,
          birthDate: dto.birthDate,
          clientId: clientId!,
        })
        .returning();

      if (dto.phones.length > 0) {
        await tx.insert(petPhones).values(dto.phones.map((phone) => ({ petId: pet.id, phone })));
      }

      return this.getOrThrowTx(tx, pet.id);
    });
  }

  private async getOrThrowTx(tx: Database, id: string) {
    const row = await tx.query.pets.findFirst({
      where: eq(pets.id, id),
      with: { client: { with: { phones: true } }, phones: true },
    });
    if (!row) throw new NotFoundAppError('Pet', id);
    return row;
  }
}
