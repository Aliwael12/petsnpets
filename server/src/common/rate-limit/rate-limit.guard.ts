import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TooManyRequestsError } from '../errors/app-error';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';

interface Bucket {
  hits: number[];
}

/**
 * A small fixed-window limiter for the handful of routes that are reachable without a
 * session (public appointment booking). Deliberately in-process: it is a speed bump against
 * a single client hammering the form, NOT a defence against a distributed flood, and it
 * resets on restart and does not coordinate across replicas. Anything internet-facing at
 * real scale wants this at the edge (Cloudflare/nginx) or in Redis instead.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(req)}`;

    this.sweep(now, options.windowMs);

    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < options.windowMs);

    if (bucket.hits.length >= options.limit) {
      this.buckets.set(key, bucket);
      throw new TooManyRequestsError(options.message);
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }

  /** Drop fully-expired buckets occasionally so the map can't grow without bound. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.hits.every((t) => now - t >= windowMs)) this.buckets.delete(key);
    }
  }
}

function clientIp(req: Request): string {
  // `req.ip` already honours Express's trust-proxy setting; the socket address is the
  // fallback for the direct-connection case.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
