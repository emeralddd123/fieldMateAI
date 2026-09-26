import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompleteRepairDto, CreateIncidentDto, CreateMaintenanceRecordDto, CreateMeasurementDto, EscalateDto, FaultParams, HistoryQuery, IncidentQuery, NoteDto, PageQuery, ProcedureParams, ProcedureQuery, UpdateIncidentDto } from './dto';
import { IncidentsService } from './incidents.service';
import { KnowledgeService } from './knowledge.service';
import { RecordsService } from './records.service';
import { RepairsService } from './repairs.service';

@ApiTags('maintenance')
@Controller('api/v1')
export class MaintenanceController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly knowledge: KnowledgeService,
    private readonly records: RecordsService,
    private readonly repairs: RepairsService,
  ) {}

  @Get('assets/:assetId/faults/:faultCode')
  async fault(@Param() params: FaultParams) {
    return { data: await this.knowledge.lookup(params.assetId, params.faultCode) };
  }
  @Get('procedures/:key')
  @ApiOperation({ summary: 'Retrieve approved, asset-matched steps after safe-state confirmation' })
  async procedure(@Param() params: ProcedureParams, @Query() query: ProcedureQuery) {
    return { data: await this.knowledge.procedure(params.key, query) };
  }
  @Get('assets/:assetId/history')
  async history(@Param('assetId', new ParseUUIDPipe()) id: string, @Query() query: HistoryQuery) {
    return { data: await this.records.history(id, query) };
  }
  @Get('assets/:assetId/measurements')
  async measurements(@Param('assetId', new ParseUUIDPipe()) id: string, @Query() query: PageQuery) {
    return { data: await this.records.measurements(id, query) };
  }
  @Get('assets/:assetId/maintenance-records')
  async maintenanceRecords(@Param('assetId', new ParseUUIDPipe()) id: string, @Query() query: PageQuery) {
    return { data: await this.records.maintenanceRecords(id, query) };
  }
  @Post('measurements')
  async recordMeasurement(@Body() dto: CreateMeasurementDto) {
    return { data: await this.records.recordMeasurement(dto) };
  }
  @Get('incidents')
  async list(@Query() query: IncidentQuery) { return { data: await this.incidents.list(query) }; }
  @Post('incidents')
  async create(@Body() dto: CreateIncidentDto) { return { data: await this.incidents.create(dto) }; }
  @Get('incidents/:id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) { return { data: await this.incidents.get(id) }; }
  @Patch('incidents/:id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateIncidentDto) {
    return { data: await this.incidents.update(id, dto) };
  }
  @Post('incidents/:id/notes')
  async note(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: NoteDto) {
    return { data: await this.incidents.note(id, dto) };
  }
  @Post('incidents/:id/escalate')
  async escalate(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EscalateDto) {
    return { data: await this.incidents.escalate(id, dto) };
  }
  @Post('incidents/:id/complete-repair')
  @ApiOperation({ summary: 'Atomically record verification, resolve an incident, and capture repair history. Identical retries are safe.' })
  async complete(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CompleteRepairDto) {
    return { data: await this.repairs.complete(id, dto) };
  }
  @Post('incidents/:id/resolve')
  @ApiOperation({ summary: 'Alias for complete-repair; always creates the maintenance record' })
  async resolve(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CompleteRepairDto) {
    return { data: await this.repairs.complete(id, dto) };
  }
  @Post('maintenance-records')
  @ApiOperation({ summary: 'Document standalone work, or complete the linked incident transactionally' })
  async createRecord(@Body() dto: CreateMaintenanceRecordDto) {
    return { data: await this.repairs.createRecord(dto) };
  }
}

