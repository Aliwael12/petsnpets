import { SetMetadata } from '@nestjs/common';
import type { Role } from '../db/schema';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Enforced by RolesGuard, which reads the actor
 * resolved by OperatorAuthGuard — always apply both (OperatorAuthGuard first). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
