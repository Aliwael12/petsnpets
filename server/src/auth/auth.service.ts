import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { employees, operatorSessions } from '../db/schema';
import { InvalidPinError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { PinLoginDto } from './dto/pin-login.dto';
import type { ChangePinDto } from './dto/change-pin.dto';
import type { Actor } from './auth.types';

export interface PinLoginResult {
  token: string;
  expiresAt: string;
  employee: Actor & { enabledFeatures: string[] };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async pinLogin(dto: PinLoginDto): Promise<PinLoginResult> {
    const [employee] = await this.db.select().from(employees).where(eq(employees.id, dto.employeeId)).limit(1);

    // Constant-shape failure for "no such employee" and "wrong PIN" alike — don't let the
    // response distinguish a valid employee id from an invalid one.
    if (!employee || !employee.active || !employee.pinHash) {
      await argon2.hash(dto.pin).catch(() => undefined); // keep timing roughly constant
      throw new InvalidPinError();
    }

    const valid = await argon2.verify(employee.pinHash, dto.pin);
    if (!valid) throw new InvalidPinError();

    const ttlHours = this.config.getOrThrow<number>('OPERATOR_SESSION_TTL_HOURS');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const [session] = await this.db
      .insert(operatorSessions)
      .values({ employeeId: employee.id, deviceId: dto.deviceId, expiresAt })
      .returning({ id: operatorSessions.id });

    const token = await this.jwt.signAsync(
      { sub: employee.id, sessionId: session.id, deviceId: dto.deviceId },
      { expiresIn: `${ttlHours}h` },
    );

    await this.audit.logDirect({
      actorId: employee.id,
      action: 'operator.pin_login',
      entityType: 'operator_session',
      entityId: session.id,
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      employee: { id: employee.id, name: employee.name, role: employee.role, enabledFeatures: employee.enabledFeatures },
    };
  }

  /**
   * Self-service PIN change. Deliberately re-verifies the current PIN even though the
   * request already carries a valid session token: a token proves "this terminal was
   * unlocked at some point", not "the person typing right now is the account holder", and
   * a shared POS terminal makes that distinction real.
   */
  async changePin(actorId: string, dto: ChangePinDto): Promise<void> {
    const [employee] = await this.db.select().from(employees).where(eq(employees.id, actorId)).limit(1);
    if (!employee || !employee.pinHash) throw new InvalidPinError();

    const valid = await argon2.verify(employee.pinHash, dto.currentPin);
    if (!valid) throw new InvalidPinError();

    const pinHash = await argon2.hash(dto.newPin);
    await this.db.update(employees).set({ pinHash }).where(eq(employees.id, actorId));

    // The PIN itself is never logged, only that it changed and by whom.
    await this.audit.logDirect({
      actorId,
      action: 'operator.pin_change',
      entityType: 'employee',
      entityId: actorId,
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.update(operatorSessions).set({ endedAt: new Date() }).where(eq(operatorSessions.id, sessionId));
  }
}
