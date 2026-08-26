import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { clientPhones, clients, pets } from '../db/schema';
import { ClientHasPetsError, NotFoundAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { CreateClientDto, ListClientsQueryDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListClientsQueryDto) {
    const all = await this.db.query.clients.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
      with: { phones: true, pets: { columns: { id: true } } },
    });
    if (!query.search) return all;
    const q = query.search.toLowerCase();
    return all.filter((c) => c.name.toLowerCase().includes(q) || c.phones.some((p) => p.phone.toLowerCase().includes(q)));
  }

  async getOrThrow(id: string) {
    const row = await this.db.query.clients.findFirst({
      where: eq(clients.id, id),
      with: { phones: true, pets: true },
    });
    if (!row) throw new NotFoundAppError('Client', id);
    return row;
  }

  async create(dto: CreateClientDto) {
    return this.db.transaction(async (tx) => {
      const [client] = await tx.insert(clients).values({ name: dto.name }).returning();
      const phoneRows = await tx
        .insert(clientPhones)
        .values(dto.phones.map((phone, i) => ({ clientId: client.id, phone, isPrimary: i === 0 })))
        .returning();
      return { ...client, phones: phoneRows };
    });
  }

  async update(id: string, dto: UpdateClientDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Client', id);

      if (dto.name !== undefined) {
        await tx.update(clients).set({ name: dto.name }).where(eq(clients.id, id));
      }
      if (dto.phones !== undefined) {
        await tx.delete(clientPhones).where(eq(clientPhones.clientId, id));
        await tx.insert(clientPhones).values(dto.phones.map((phone, i) => ({ clientId: id, phone, isPrimary: i === 0 })));
      }

      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'client.update',
        entityType: 'client',
        entityId: id,
        before,
        after: dto,
      });

      const phones = await tx.select().from(clientPhones).where(eq(clientPhones.clientId, id));
      const [client] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
      return { ...client, phones };
    });
  }

  async remove(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Client', id);

      const linkedPets = await tx.select({ id: pets.id }).from(pets).where(eq(pets.clientId, id));
      if (linkedPets.length > 0) throw new ClientHasPetsError(id);

      await tx.delete(clientPhones).where(eq(clientPhones.clientId, id));
      await tx.delete(clients).where(eq(clients.id, id));

      await this.audit.log(tx, { actorId: actor.id, action: 'client.delete', entityType: 'client', entityId: id, before });
    });
  }
}
