import { CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { employees } from '../db/schema';
import { AppError } from '../common/errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { Actor, OperatorTokenPayload } from './auth.types';

export interface RequestWithActor extends Request {
  actor?: Actor;
  operatorToken?: OperatorTokenPayload;
}

class UnauthenticatedError extends AppError {
  constructor(message = 'Sign in again.') {
    super('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }
}

/**
 * Verifies the Nest-issued operator token (obtained from POST /v1/sessions/pin) and resolves
 * the acting employee FRESH from the database on every request — never trusting the JWT's
 * embedded name/role — so deactivating an employee mid-shift invalidates their session
 * immediately, without needing a token blocklist.
 */
@Injectable()
export class OperatorAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithActor>();
    const token = extractBearerToken(req);
    if (!token) throw new UnauthenticatedError('Missing bearer token.');

    let payload: OperatorTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<OperatorTokenPayload>(token);
    } catch {
      throw new UnauthenticatedError('Session expired or invalid — sign in again.');
    }

    const [employee] = await this.db.select().from(employees).where(eq(employees.id, payload.sub)).limit(1);

    if (!employee || !employee.active) {
      throw new UnauthenticatedError('This employee account is no longer active.');
    }

    req.actor = { id: employee.id, name: employee.name, role: employee.role, permissions: employee.permissions };
    req.operatorToken = payload;
    return true;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}
