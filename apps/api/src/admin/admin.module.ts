import { Module } from '@nestjs/common';
import { AdminSitesAssetsController } from './admin-sites-assets.controller';
import { AdminSitesAssetsService } from './admin-sites-assets.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [AdminUsersController, AdminSitesAssetsController],
  providers: [AdminUsersService, AdminSitesAssetsService],
  exports: [AdminUsersService, AdminSitesAssetsService],
})
export class AdminModule {}
