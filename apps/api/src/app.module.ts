import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AssetsModule } from './assets/assets.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { VoiceModule } from './voice/voice.module';
import { env } from './config/env';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { ttl: env.API_RATE_LIMIT_TTL_MS, limit: env.API_RATE_LIMIT_MAX },
      ],
    }),
    PrismaModule,
    AssetsModule,
    MaintenanceModule,
    VoiceModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
