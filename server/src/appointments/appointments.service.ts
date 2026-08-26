import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { appointments, products } from '../db/schema';
import { NotFoundAppError, SlotUnavailableError, ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { OPENING_HOURS, SLOT_MINUTES, slotsForDay, validateSlot } from './clinic-hours';
import type {
  CreateAppointmentDto,
  ListAppointmentsQueryDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';

/** Postgres unique-violation. Drizzle wraps the driver error as `.cause`, so check both. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const direct = (err as { code?: string }).code;
  const cause = (err as { cause?: { code?: string } }).cause?.code;
  return direct === '23505' || cause === '23505';
}

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Public: the services a visitor can book, priced live from the catalog. */
  listBookableServices() {
    return this.db
      .select({ id: products.id, name: products.name, unitPrice: products.unitPrice })
      .from(products)
      .where(and(eq(products.kind, 'service'), eq(products.active, true)))
      .orderBy(asc(products.name));
  }

  /** Public: every slot for a Cairo day, each marked taken or free. */
  async availability(dayKey: string) {
    const slots = slotsForDay(dayKey);
    if (slots.length === 0) return { date: dayKey, slots: [] };

    const taken = await this.db
      .select({ requestedAt: appointments.requestedAt })
      .from(appointments)
      .where(
        and(
          inArray(appointments.requestedAt, slots.map((s) => new Date(s))),
          inArray(appointments.status, ['pending', 'confirmed']),
        ),
      );

    const takenSet = new Set(taken.map((t) => t.requestedAt.toISOString()));
    const now = new Date();

    return {
      date: dayKey,
      slots: slots.map((iso) => ({
        at: iso,
        available: !takenSet.has(iso) && validateSlot(new Date(iso), now) === null,
      })),
    };
  }

  /** Public booking. Everything in `dto` is untrusted; status is always 'pending'. */
  async create(dto: CreateAppointmentDto) {
    const requestedAt = new Date(dto.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new ValidationAppError('That appointment time could not be understood.');
    }

    // Re-validated here rather than trusting the form: a caller can post straight to the
    // API without ever loading the page that greys out closed hours.
    const rejection = validateSlot(requestedAt);
    if (rejection) throw new ValidationAppError(rejection.message, { reason: rejection.code });

    let serviceName = 'General consultation';
    if (dto.serviceId) {
      const [service] = await this.db
        .select({ name: products.name, active: products.active, kind: products.kind })
        .from(products)
        .where(eq(products.id, dto.serviceId))
        .limit(1);
      if (!service || !service.active || service.kind !== 'service') {
        throw new ValidationAppError('That service is not available for booking.');
      }
      serviceName = service.name;
    }

    try {
      const [row] = await this.db
        .insert(appointments)
        .values({
          ownerName: dto.ownerName,
          phone: dto.phone,
          email: dto.email,
          petName: dto.petName,
          species: dto.species,
          serviceId: dto.serviceId,
          serviceName,
          requestedAt,
          notes: dto.notes,
          status: 'pending',
        })
        .returning();

      await this.audit.logDirect({
        actorId: null,
        action: 'appointment.request',
        entityType: 'appointment',
        entityId: row.id,
        after: { petName: row.petName, requestedAt: row.requestedAt, serviceName: row.serviceName },
      });

      // Only what the booker needs to see confirmed back — not the whole row.
      return {
        id: row.id,
        ownerName: row.ownerName,
        petName: row.petName,
        serviceName: row.serviceName,
        requestedAt: row.requestedAt,
        status: row.status,
      };
    } catch (err) {
      // The partial unique index rejected it: someone else took this slot in the
      // milliseconds between the availability check and this insert.
      if (isUniqueViolation(err)) throw new SlotUnavailableError(requestedAt.toISOString());
      throw err;
    }
  }

  /** Staff view — the full record, including contact details. */
  list(query: ListAppointmentsQueryDto) {
    const conditions = [
      query.status ? eq(appointments.status, query.status) : undefined,
      query.upcomingOnly ? gte(appointments.requestedAt, rawSql`now()`) : undefined,
    ].filter((c) => c !== undefined);

    return this.db.query.appointments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [asc(appointments.requestedAt)],
      with: {
        client: { columns: { id: true, name: true } },
        handledByEmployee: { columns: { id: true, name: true } },
      },
    });
  }

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
      if (!before) throw new NotFoundAppError('Appointment', id);

      try {
        const [after] = await tx
          .update(appointments)
          .set({
            status: dto.status,
            clientId: dto.clientId ?? before.clientId,
            handledBy: actor.id,
          })
          .where(eq(appointments.id, id))
          .returning();

        await this.audit.log(tx, {
          actorId: actor.id,
          action: `appointment.${dto.status}`,
          entityType: 'appointment',
          entityId: id,
          before: { status: before.status },
          after: { status: after.status, clientId: after.clientId },
        });
        return after;
      } catch (err) {
        // Re-opening a cancelled booking whose slot has since been taken by someone else.
        if (isUniqueViolation(err)) throw new SlotUnavailableError(before.requestedAt.toISOString());
        throw err;
      }
    });
  }

  /** Public: what the website prints on its "opening hours" panel. */
  openingHours() {
    return { timezone: 'Africa/Cairo', slotMinutes: SLOT_MINUTES, hoursByWeekday: OPENING_HOURS };
  }
}
