import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenAppError } from '../common/errors/app-error';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { hasPermission, PERMISSION_LABELS, type Permission } from '../employees/permissions';
import type { Actor } from './auth.types';

interface RequestWithActor extends Request {
  actor?: Actor;
}

/**
 * Checks @Permissions() against the grants on req.actor, set by OperatorAuthGuard. Always
 * pair the two, OperatorAuthGuard first — same contract as RolesGuard.
 *
 * All listed permissions must be held (AND, not OR): a handler asking for two capabilities
 * is asking for both.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithActor>();
    if (!req.actor) {
      throw new Error('PermissionsGuard used without OperatorAuthGuard running first');
    }

    const missing = required.filter((permission) => !hasPermission(req.actor!, permission));
    if (missing.length > 0) {
      // Named in the operator's own vocabulary, not the permission key — the person reading
      // this is a vet, and "products:write" tells them nothing about who to ask.
      const names = missing.map((permission) => PERMISSION_LABELS[permission].label.toLowerCase());
      throw new ForbiddenAppError(`This needs "${names.join('" and "')}" access — ask an admin to grant it.`);
    }
    return true;
  }
}
