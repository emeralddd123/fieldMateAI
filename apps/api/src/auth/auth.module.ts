import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessModule } from '../access/access.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OriginGuard } from './origin.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule, AccessModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    RolesGuard,
    OriginGuard,
    PasswordService,
    SessionService,
  ],
  exports: [AuthGuard, RolesGuard, PasswordService, SessionService],
})
export class AuthModule {}
