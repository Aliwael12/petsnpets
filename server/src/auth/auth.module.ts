import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

// OperatorAuthGuard and RolesGuard are registered globally (as APP_GUARD) in AppModule —
// every route is authenticated by default. They live in this directory but aren't provided
// here to avoid a second, redundant instance; AppModule's DI resolves their constructor
// dependencies (JwtService, DB, Reflector) through this module's exports.
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('OPERATOR_JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
