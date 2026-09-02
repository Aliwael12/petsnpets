import { z } from 'zod';

/** An inclusive Cairo calendar day. z.iso.date() also rejects impossible days like
 *  2026-02-30, which a bare YYYY-MM-DD regex does not. */
export const dayKeySchema = z.iso.date();

/** Merged into every ranged query schema by spreading it into the object shape. */
export const dateRangeShape = {
  from: dayKeySchema.optional(),
  to: dayKeySchema.optional(),
};

/** An inverted range is a 400, never a silently empty window: "EGP 0" reads as a fact
 *  about the business rather than as a mistake in the form. */
export const isOrderedRange = (v: { from?: string; to?: string }) => !v.from || !v.to || v.from <= v.to;
export const ORDERED_RANGE_ISSUE = {
  message: 'The start date must not be after the end date.',
  path: ['to'],
};
