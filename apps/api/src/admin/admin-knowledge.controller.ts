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
import { AdminKnowledgeService } from './admin-knowledge.service';
import {
  CreateFaultDefinitionDto,
  CreateProcedureDto,
  FaultListQueryDto,
  ProcedureListQueryDto,
  UpdateFaultDefinitionDto,
  UpdateProcedureDto,
} from './admin.dto';

@ApiTags('admin-knowledge')
@ApiCookieAuth('session')
@Roles('admin')
@Controller('api/v1/admin')
export class AdminKnowledgeController {
  constructor(private readonly service: AdminKnowledgeService) {}

  // =========================================================================
  // FAULT DEFINITIONS
  // =========================================================================

  @Get('faults')
  @ApiOperation({ summary: 'List and filter equipment fault definitions' })
  async listFaults(
    @CurrentAccess() access: AccessContext,
    @Query() query: FaultListQueryDto,
  ) {
    return { data: await this.service.listFaults(access, query) };
  }

  @Post('faults')
  @ApiOperation({ summary: 'Create a new fault definition' })
  async createFault(
    @CurrentAccess() access: AccessContext,
    @Body() dto: CreateFaultDefinitionDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.createFault(access, dto, request) };
  }

  @Get('faults/:id')
  @ApiOperation({ summary: 'Get fault definition details' })
  async getFault(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return { data: await this.service.getFault(access, id) };
  }

  @Patch('faults/:id')
  @ApiOperation({ summary: 'Update a fault definition' })
  async updateFault(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateFaultDefinitionDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.updateFault(access, id, dto, request) };
  }

  @Delete('faults/:id')
  @ApiOperation({ summary: 'Archive a fault definition' })
  async archiveFault(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.archiveFault(access, id, request) };
  }

  // =========================================================================
  // PROCEDURES
  // =========================================================================

  @Get('procedures')
  @ApiOperation({ summary: 'List and filter standard operating procedures' })
  async listProcedures(
    @CurrentAccess() access: AccessContext,
    @Query() query: ProcedureListQueryDto,
  ) {
    return { data: await this.service.listProcedures(access, query) };
  }

  @Post('procedures')
  @ApiOperation({ summary: 'Create a new procedure draft' })
  async createProcedure(
    @CurrentAccess() access: AccessContext,
    @Body() dto: CreateProcedureDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.createProcedure(access, dto, request) };
  }

  @Get('procedures/:id')
  @ApiOperation({ summary: 'Get procedure details and steps' })
  async getProcedure(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return { data: await this.service.getProcedure(access, id) };
  }

  @Patch('procedures/:id')
  @ApiOperation({ summary: 'Update a procedure draft' })
  async updateProcedure(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateProcedureDto,
    @Req() request: Request,
  ) {
    return { data: await this.service.updateProcedure(access, id, dto, request) };
  }

  @Post('procedures/:id/approve')
  @ApiOperation({ summary: 'Approve and publish a procedure for technician and voice access' })
  async approveProcedure(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.approveProcedure(access, id, request) };
  }

  @Post('procedures/:id/withdraw')
  @ApiOperation({ summary: 'Withdraw approval for a procedure' })
  async withdrawProcedure(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.withdrawProcedure(access, id, request) };
  }

  @Delete('procedures/:id')
  @ApiOperation({ summary: 'Archive a procedure' })
  async archiveProcedure(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.service.archiveProcedure(access, id, request) };
  }
}
