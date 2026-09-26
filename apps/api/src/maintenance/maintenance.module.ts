import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { IncidentsService } from './incidents.service';
import { KnowledgeService } from './knowledge.service';
import { RecordsService } from './records.service';
import { RepairsService } from './repairs.service';

@Module({
  controllers: [MaintenanceController],
  providers: [
    IncidentsService,
    KnowledgeService,
    RecordsService,
    RepairsService,
  ],
})
export class MaintenanceModule {}
