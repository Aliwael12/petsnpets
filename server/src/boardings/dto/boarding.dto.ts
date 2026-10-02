import { z } from 'zod';
import { dayKeySchema } from '../../common/dto/date-range.dto';
import { paymentMethodEnum } from '../../db/schema/enums';

const piastres = z.number().int().nonnegative();

const endNotBeforeStart = (v: { startDate?: string; endDate?: string }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;
const DATES_ISSUE = { message: 'The stay has to end on or after the day it starts.', path: ['endDate'] };

export const createBoardingSchema = z
  .object({
    clientId: z.uuid(),
    petId: z.uuid(),
    kind: z.enum(['boarding', 'hospitalization']).default('boarding'),
    totalAmount: piastres,
    paidAmount: piastres.default(0),
    /** How the money paid now was taken. Optional; omitted means "not recorded". */
    paymentMethod: z.enum(paymentMethodEnum.enumValues).optional(),
    startDate: dayKeySchema,
    endDate: dayKeySchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine(endNotBeforeStart, DATES_ISSUE);
export type CreateBoardingDto = z.infer<typeof createBoardingSchema>;

/** Everything that changes during a stay: another payment, an extension, a corrected price. */
export const updateBoardingSchema = z
  .object({
    kind: z.enum(['boarding', 'hospitalization']).optional(),
    totalAmount: piastres.optional(),
    paidAmount: piastres.optional(),
    /** How the change in paidAmount was taken (or given back). */
    paymentMethod: z.enum(paymentMethodEnum.enumValues).optional(),
    startDate: dayKeySchema.optional(),
    endDate: dayKeySchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(endNotBeforeStart, DATES_ISSUE);
export type UpdateBoardingDto = z.infer<typeof updateBoardingSchema>;
