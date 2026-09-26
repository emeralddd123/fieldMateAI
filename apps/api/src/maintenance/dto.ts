import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function Text(max: number, example: string, optional = false) {
  return applyDecorators(
    ApiProperty({ example, maxLength: max, required: !optional }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    ...(optional ? [ValidateIf((_object, value) => value !== undefined)] : []),
    IsString(),
    IsNotEmpty(),
    MaxLength(max),
  );
}
function OptionalUuid() {
  return applyDecorators(
    ApiPropertyOptional({ format: 'uuid' }),
    ValidateIf((_object, value) => value !== undefined),
    IsUUID(),
  );
}

export class PageQuery {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
export class HistoryQuery extends PageQuery {
  @Text(32, 'F0003', true) faultCode?: string;
}
export class IncidentQuery extends PageQuery {
  @OptionalUuid() assetId?: string;
  @ApiPropertyOptional({
    enum: ['open', 'investigating', 'escalated', 'resolved', 'closed'],
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['open', 'investigating', 'escalated', 'resolved', 'closed'])
  status?: 'open' | 'investigating' | 'escalated' | 'resolved' | 'closed';
}
export class ProcedureQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  safeStateConfirmed = false;
}
export class FaultParams {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
  @Text(32, 'F0003') faultCode!: string;
}
export class ProcedureParams {
  @Text(100, 'vfd-undervoltage-check') key!: string;
}
export class CreateIncidentDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Stable creation request ID. Required for voice writes; reuse for identical retries.',
  })
  @ValidateIf(
    (object, value) => object.source === 'voice' || value !== undefined,
  )
  @IsUUID()
  requestId?: string;
  @ApiProperty({ enum: ['voice', 'manual'], default: 'manual' })
  @IsIn(['voice', 'manual'])
  source: 'voice' | 'manual' = 'manual';

  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
  @Text(200, 'VFD F0003 undervoltage fault') title!: string;
  @Text(4000, 'Motor stopped during production; drive reported F0003.')
  description!: string;
  @Text(32, 'F0003', true) faultCode?: string;
  @ApiProperty({
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  @ApiProperty({ enum: ['down', 'warning', 'maintenance'], default: 'down' })
  @IsIn(['down', 'warning', 'maintenance'])
  assetStatus: 'down' | 'warning' | 'maintenance' = 'down';
  @ApiPropertyOptional({
    type: [String],
    description:
      'Unassigned readings on this asset to attach to the new incident.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  measurementIds?: string[];
}
export class UpdateIncidentDto {
  @Text(200, 'VFD undervoltage fault', true) title?: string;
  @Text(4000, 'Updated observations', true) description?: string;
  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'critical'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: 'low' | 'medium' | 'high' | 'critical';
  @ApiPropertyOptional({
    enum: ['investigating', 'closed'],
    description:
      'Close only after resolution; resolve through the repair endpoint.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['investigating', 'closed'])
  status?: 'investigating' | 'closed';
  @OptionalUuid() assignedToId?: string;
}
export class NoteDto {
  @Text(4000, 'Incoming voltage measured at 347 V.') note!: string;
  @ApiProperty({ enum: ['voice', 'manual'], default: 'manual' })
  @IsIn(['voice', 'manual'])
  source: 'voice' | 'manual' = 'manual';
}
export class MeasurementFields {
  @Text(64, 'line_voltage') measurementType!: string;
  @ApiProperty({
    example: 347,
    description: 'Finite numeric reading, up to six decimal places.',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(-999999999)
  @Max(999999999)
  value!: number;
  @Text(24, 'V') unit!: string;
  @Text(2000, 'Measured at drive input', true) notes?: string;
}
export class CreateMeasurementDto extends MeasurementFields {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Stable creation request ID. Required for voice writes; reuse for identical retries.',
  })
  @ValidateIf(
    (object, value) => object.source === 'voice' || value !== undefined,
  )
  @IsUUID()
  requestId?: string;
  @ApiProperty({ enum: ['voice', 'manual'], default: 'manual' })
  @IsIn(['voice', 'manual'])
  source: 'voice' | 'manual' = 'manual';

  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
  @OptionalUuid() incidentId?: string;
}
export class CompleteRepairDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
  @Text(4000, 'Loose L2 terminal') rootCause!: string;
  @Text(4000, 'Tightened L2 terminal connection') actionTaken!: string;
  @Text(4000, 'Motor running normally at 12.4 A') verificationSummary!: string;
  @ApiPropertyOptional({ type: MeasurementFields })
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => MeasurementFields)
  verificationMeasurement?: MeasurementFields;
  @ApiProperty({
    enum: ['operational', 'warning', 'maintenance', 'down'],
    default: 'operational',
  })
  @IsIn(['operational', 'warning', 'maintenance', 'down'])
  assetStatus: 'operational' | 'warning' | 'maintenance' | 'down' =
    'operational';
  @ApiProperty({ enum: ['voice', 'manual'], default: 'manual' })
  @IsIn(['voice', 'manual'])
  source: 'voice' | 'manual' = 'manual';
}
export class EscalateDto {
  @Text(4000, 'No approved troubleshooting procedure available')
  reason!: string;
  @ApiProperty({
    enum: ['supervisor_review', 'urgent'],
    default: 'supervisor_review',
  })
  @IsIn(['supervisor_review', 'urgent'])
  severity: 'supervisor_review' | 'urgent' = 'supervisor_review';
}
export class CreateMaintenanceRecordDto extends CompleteRepairDto {
  @OptionalUuid() incidentId?: string;
  @Text(32, 'F0003', true) faultCode?: string;
  @Text(4000, 'Drive tripped and motor stopped') symptom!: string;
}
