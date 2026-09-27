import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminKnowledgeController } from './admin-knowledge.controller';
import { AdminKnowledgeService } from './admin-knowledge.service';
import { AdminSitesAssetsController } from './admin-sites-assets.controller';
import { AdminSitesAssetsService } from './admin-sites-assets.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [
    AdminUsersController,
    AdminSitesAssetsController,
    AdminKnowledgeController,
    AdminAuditController,
  ],
  providers: [
    AdminUsersService,
    AdminSitesAssetsService,
    AdminKnowledgeService,
    AdminAuditService,
  ],
  exports: [
    AdminUsersService,
    AdminSitesAssetsService,
    AdminKnowledgeService,
    AdminAuditService,
  ],
})
export class AdminModule {}
