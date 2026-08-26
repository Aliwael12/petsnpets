import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { pinLoginSchema, type PinLoginDto } from './dto/pin-login.dto';
import { Public } from './public.decorator';
import { CurrentSession } from './actor.decorator';
import type { OperatorTokenPayload } from './auth.types';

@Controller('sessions')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('pin')
  pinLogin(@Body(new ZodValidationPipe(pinLoginSchema)) dto: PinLoginDto) {
    return this.auth.pinLogin(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentSession() session: OperatorTokenPayload) {
    await this.auth.logout(session.sessionId);
  }
}
