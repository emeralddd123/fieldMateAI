import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [PrismaModule, AssetsModule, MaintenanceModule],
  controllers: [HealthController],
})
export class AppModule {}
