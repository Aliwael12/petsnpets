import { Body, Controller, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { pinLoginSchema, type PinLoginDto } from './dto/pin-login.dto';
import { changePinSchema, type ChangePinDto } from './dto/change-pin.dto';
import { Public } from './public.decorator';
import { CurrentActor, CurrentSession } from './actor.decorator';
import type { Actor, OperatorTokenPayload } from './auth.types';

@Controller('sessions')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('pin')
  pinLogin(@Body(new ZodValidationPipe(pinLoginSchema)) dto: PinLoginDto) {
    return this.auth.pinLogin(dto);
  }

  /** Self-service only — an operator can change their own PIN and no one else's, so the
   * target is taken from the session, never from the request body. */
  @Patch('pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePin(@Body(new ZodValidationPipe(changePinSchema)) dto: ChangePinDto, @CurrentActor() actor: Actor) {
    await this.auth.changePin(actor.id, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentSession() session: OperatorTokenPayload) {
    await this.auth.logout(session.sessionId);
  }
}
