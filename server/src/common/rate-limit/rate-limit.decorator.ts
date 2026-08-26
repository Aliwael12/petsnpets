import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Maximum requests allowed per IP within the window. */
  limit: number;
  windowMs: number;
  message?: string;
}

/** Applies RateLimitGuard's fixed window to a route. Only meaningful on @Public() routes —
 * authenticated routes are already bounded by needing a valid operator session. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
