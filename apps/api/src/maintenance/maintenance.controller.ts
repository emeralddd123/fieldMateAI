import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CompleteRepairDto,
  CreateIncidentDto,
  CreateMaintenanceRecordDto,
  CreateMeasurementDto,
  EscalateDto,
  FaultParams,
  HistoryQuery,
  IncidentQuery,
  NoteDto,
  PageQuery,
  ProcedureParams,
  ProcedureQuery,
  SupervisorReviewDto,
  UpdateIncidentDto,
} from './dto';
import { IncidentsService } from './incidents.service';
import { KnowledgeService } from './knowledge.service';
import { RecordsService } from './records.service';
import { RepairsService } from './repairs.service';
import { CurrentAccess, Roles } from '../auth/decorators';
import type { AccessContext } from '../access/access.types';

@ApiTags('maintenance')
@ApiCookieAuth('fieldmate-session')
@Controller('api/v1')
export class MaintenanceController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly knowledge: KnowledgeService,
    private readonly records: RecordsService,
    private readonly repairs: RepairsService,
  ) {}

  @Get('users')
  async users(
    @Query('siteId') siteId: string | undefined,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.users(siteId, access) };
  }

  @Get('incidents/assignees')
  @ApiOperation({ summary: 'List eligible assignees for an incident site' })
  async assignees(
    @Query('siteId') siteId: string | undefined,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.assignees(siteId, access) };
  }

  @Get('assets/:assetId/faults/:faultCode')
  async fault(
    @Param() params: FaultParams,
    @CurrentAccess() access: AccessContext,
  ) {
    return {
      data: await this.knowledge.lookup(
        params.assetId,
        params.faultCode,
        access,
      ),
    };
  }

  @Get('procedures/:key')
  @ApiOperation({
    summary:
      'Retrieve approved, asset-matched steps after safe-state confirmation',
  })
  async procedure(
    @Param() params: ProcedureParams,
    @Query() query: ProcedureQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.knowledge.procedure(params.key, query, access) };
  }

  @Get('assets/:assetId/history')
  async history(
    @Param('assetId', new ParseUUIDPipe()) id: string,
    @Query() query: HistoryQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.records.history(id, query, access) };
  }

  @Get('assets/:assetId/measurements')
  async measurements(
    @Param('assetId', new ParseUUIDPipe()) id: string,
    @Query() query: PageQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.records.measurements(id, query, access) };
  }

  @Get('assets/:assetId/maintenance-records')
  async maintenanceRecords(
    @Param('assetId', new ParseUUIDPipe()) id: string,
    @Query() query: PageQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.records.maintenanceRecords(id, query, access) };
  }

  @Post('measurements')
  async recordMeasurement(
    @Body() dto: CreateMeasurementDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.records.recordMeasurement(dto, access) };
  }

  @Get('incidents')
  async list(
    @Query() query: IncidentQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.list(query, access) };
  }

  @Post('incidents')
  async create(
    @Body() dto: CreateIncidentDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.create(dto, access) };
  }

  @Get('incidents/:id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.get(id, access) };
  }

  @Patch('incidents/:id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.update(id, dto, access) };
  }

  @Post('incidents/:id/notes')
  async note(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: NoteDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.note(id, dto, access) };
  }

  @Post('incidents/:id/escalate')
  async escalate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EscalateDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.escalate(id, dto, access) };
  }

  @Post('incidents/:id/supervisor-review')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary:
      'Acknowledge an escalation and optionally assign, reprioritize, or annotate an active incident',
  })
  async supervisorReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupervisorReviewDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.incidents.supervisorReview(id, dto, access) };
  }

  @Post('incidents/:id/complete-repair')
  @ApiOperation({
    summary:
      'Atomically record verification, resolve an incident, and capture repair history. Identical retries are safe.',
  })
  async complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteRepairDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.repairs.complete(id, dto, access) };
  }

  @Post('incidents/:id/resolve')
  @ApiOperation({
    summary: 'Alias for complete-repair; always creates the maintenance record',
  })
  async resolve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteRepairDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.repairs.complete(id, dto, access) };
  }

  @Post('maintenance-records')
  @ApiOperation({
    summary:
      'Document standalone work, or complete the linked incident transactionally',
  })
  async createRecord(
    @Body() dto: CreateMaintenanceRecordDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.repairs.createRecord(dto, access) };
  }
}
