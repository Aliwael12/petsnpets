import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenAppError } from '../common/errors/app-error';
import { ROLES_KEY } from './roles.decorator';
import type { Actor } from './auth.types';
import type { Role } from '../db/schema';

interface RequestWithActor extends Request {
  actor?: Actor;
}

/** Reads the roles required by @Roles() and checks them against req.actor.role, set by
 * OperatorAuthGuard. Always pair the two guards, OperatorAuthGuard first. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithActor>();
    if (!req.actor) {
      throw new Error('RolesGuard used without OperatorAuthGuard running first');
    }
    if (!required.includes(req.actor.role)) {
      throw new ForbiddenAppError(`This action requires one of: ${required.join(', ')}.`);
    }
    return true;
  }
}
