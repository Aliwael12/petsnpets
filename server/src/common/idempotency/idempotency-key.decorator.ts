import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ValidationAppError } from '../errors/app-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads and validates the required `Idempotency-Key` header (client-generated UUID, one per
 * checkout/refund attempt — NOT per HTTP retry of the same attempt). */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const key = req.headers['idempotency-key'];
  const value = Array.isArray(key) ? key[0] : key;
  if (!value || !UUID_RE.test(value)) {
    throw new ValidationAppError('Missing or invalid Idempotency-Key header (must be a UUID).');
  }
  return value;
});
