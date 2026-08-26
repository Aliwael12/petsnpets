import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of the global OperatorAuthGuard. Every route is authenticated by
 * default — this is the explicit, auditable exception, not the other way around. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
