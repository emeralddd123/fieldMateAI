import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAccess, Roles } from '../auth/decorators';
import type { AccessContext } from '../access/access.types';
import { AdminSitesAssetsService } from './admin-sites-assets.service';
import {
  AssetListQueryDto,
  CreateAssetDto,
  CreateSiteDto,
  SiteListQueryDto,
  UpdateAssetDto,
  UpdateSiteDto,
} from './admin.dto';

@ApiTags('admin-resources')
@ApiCookieAuth('session')
@Roles('admin')
@Controller('api/v1/admin')
export class AdminSitesAssetsController {
  constructor(private readonly service: AdminSitesAssetsService) {}

  // --- SITES ---

  @Get('sites')
  @ApiOperation({ summary: 'List and filter organization sites' })
  async listSites(
    @CurrentAccess() access: AccessContext,
    @Query() query: SiteListQueryDto,
  ) {
    return { data: await this.service.listSites(access, query) };
  }

  @Post('sites')
  @ApiOperation({ summary: 'Create a new site' })
  async createSite(
    @CurrentAccess() access: AccessContext,
    @Body() dto: CreateSiteDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.createSite(access, dto, request) };
  }

  @Get('sites/:id')
  @ApiOperation({ summary: 'Get site details by ID' })
  async getSite(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return { data: await this.service.getSite(access, id) };
  }

  @Patch('sites/:id')
  @ApiOperation({ summary: 'Update a site' })
  async updateSite(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.updateSite(access, id, dto, request) };
  }

  @Delete('sites/:id')
  @ApiOperation({ summary: 'Archive a site' })
  async archiveSite(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.archiveSite(access, id, request) };
  }

  // --- ASSETS ---

  @Get('assets')
  @ApiOperation({ summary: 'List and filter organization assets' })
  async listAssets(
    @CurrentAccess() access: AccessContext,
    @Query() query: AssetListQueryDto,
  ) {
    return { data: await this.service.listAssets(access, query) };
  }

  @Post('assets')
  @ApiOperation({ summary: 'Create a new asset' })
  async createAsset(
    @CurrentAccess() access: AccessContext,
    @Body() dto: CreateAssetDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.createAsset(access, dto, request) };
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset details by ID' })
  async getAsset(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return { data: await this.service.getAsset(access, id) };
  }

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Update an asset and reconcile components' })
  async updateAsset(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.updateAsset(access, id, dto, request) };
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Archive an asset' })
  async archiveAsset(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.archiveAsset(access, id, request) };
  }
}
