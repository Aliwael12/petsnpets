import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../employees/permissions';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Requires a server-enforced capability rather than a role. An admin satisfies every one of
 * these implicitly; anyone else needs the grant on their employee row.
 *
 * Use this instead of @Roles() wherever an admin should be able to delegate the action —
 * @Roles('admin') is for the handful of things that stay with the owner permanently.
 */
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
