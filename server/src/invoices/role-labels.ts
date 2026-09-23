import type { Role } from '../db/schema/enums';

/** Mirrors src/types.ts's ROLE_LABELS on the frontend — kept separate because this package
 * never imports frontend code. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  cashier: 'Cashier',
};
