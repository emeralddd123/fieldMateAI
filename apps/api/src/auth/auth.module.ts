import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OriginGuard } from './origin.guard';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    OriginGuard,
    PasswordService,
    SessionService,
  ],
  exports: [AuthGuard, PasswordService, SessionService],
})
export class AuthModule {}
