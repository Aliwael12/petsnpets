import { z } from 'zod';
import { queryBooleanSchema } from '../../common/dto/query-boolean';

export const speciesSchema = z.enum(['dog', 'cat', 'bird', 'rabbit', 'other']);

/**
 * The public booking payload. Deliberately has no `status`, `clientId` or `handledBy` —
 * an unauthenticated caller must not be able to self-confirm a booking or attach it to
 * someone else's client record, so those fields aren't in the shape at all.
 */
export const createAppointmentSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  petName: z.string().trim().min(1).max(80),
  species: speciesSchema,
  serviceId: z.uuid().optional(),
  requestedAt: z.iso.datetime(),
  notes: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
});
export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

export const appointmentStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed']);

export const listAppointmentsQuerySchema = z.object({
  status: appointmentStatusSchema.optional(),
  upcomingOnly: queryBooleanSchema.optional(),
});
export type ListAppointmentsQueryDto = z.infer<typeof listAppointmentsQuerySchema>;

export const updateAppointmentStatusSchema = z.object({
  status: appointmentStatusSchema,
  /** Optionally attach the booking to an existing client record when confirming. */
  clientId: z.uuid().optional(),
});
export type UpdateAppointmentStatusDto = z.infer<typeof updateAppointmentStatusSchema>;

export const availabilityQuerySchema = z.object({
  /** A Cairo calendar day, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.'),
});
export type AvailabilityQueryDto = z.infer<typeof availabilityQuerySchema>;
