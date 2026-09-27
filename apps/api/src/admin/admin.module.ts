import { Module } from '@nestjs/common';
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
  ],
  providers: [
    AdminUsersService,
    AdminSitesAssetsService,
    AdminKnowledgeService,
  ],
  exports: [
    AdminUsersService,
    AdminSitesAssetsService,
    AdminKnowledgeService,
  ],
})
export class AdminModule {}
