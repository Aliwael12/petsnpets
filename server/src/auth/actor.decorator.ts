import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Actor, OperatorTokenPayload } from './auth.types';
import type { RequestWithActor } from './operator-auth.guard';

/** The authenticated employee for this request. Only valid on routes behind
 * OperatorAuthGuard — that guard is what populates `req.actor`. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!req.actor) {
    throw new Error('CurrentActor used on a route without OperatorAuthGuard');
  }
  return req.actor;
});

/** The decoded operator token (session id, device id) for this request. */
export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext): OperatorTokenPayload => {
  const req = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!req.operatorToken) {
    throw new Error('CurrentSession used on a route without OperatorAuthGuard');
  }
  return req.operatorToken;
});
