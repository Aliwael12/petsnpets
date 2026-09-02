import { z } from 'zod';

/**
 * A boolean that survives the query string.
 *
 * NOT `z.coerce.boolean()`: that applies JavaScript's `Boolean(value)`, and every non-empty
 * string is truthy — so `?activeOnly=false` parses as **true**, which is the opposite of
 * what the caller asked for and fails silently. This parses the text instead.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1' || v === 'yes'));
