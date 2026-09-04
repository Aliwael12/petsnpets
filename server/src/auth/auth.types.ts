import type { Role } from '../db/schema';

/** The authenticated operator for the current request — resolved fresh from the `employees`
 * table on every request (never trusted purely from the JWT), so a deactivated employee's
 * still-unexpired token stops working immediately. */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** Server-enforced grants, resolved fresh from the employees row on every request so a
   *  revoked permission stops working immediately rather than at the next sign-in. Empty
   *  for an admin, who holds everything implicitly — always ask hasPermission(), never
   *  this array directly. */
  permissions: string[];
}

export interface OperatorTokenPayload {
  sub: string; // employee id
  sessionId: string; // operator_sessions.id, for audit / future revocation
  deviceId: string;
}
