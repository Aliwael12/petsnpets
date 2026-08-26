import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { clientPhones, clients, petPhones, pets } from '../db/schema';
import { NotFoundAppError } from '../common/errors/app-error';
import type { CreatePetDto, ListPetsQueryDto } from './dto/pet.dto';

@Injectable()
export class PetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

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
        .values({ name: dto.name, species: dto.species, breed: dto.breed, clientId: clientId! })
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
