import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type AdminUserRole = 'technician' | 'supervisor' | 'admin';
export type AdminUserStatus = 'active' | 'disabled';

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class InviteUserDto {
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsIn(['technician', 'supervisor', 'admin'])
  role!: AdminUserRole;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  siteIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['technician', 'supervisor', 'admin'])
  role?: AdminUserRole;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: AdminUserStatus;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  siteIds?: string[];

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

export class UserListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['technician', 'supervisor', 'admin'])
  role?: AdminUserRole;

  @IsOptional()
  @IsIn(['active', 'disabled', 'invited'])
  status?: string;

  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

function normalizeTag(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(({ value }: { value: unknown }) => normalizeTag(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeTag(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location?: string;
}

export class SiteListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  includeArchived?: boolean;
}

export class ComponentInputDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  componentType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  identifier?: string;
}

export class CreateAssetDto {
  @Transform(({ value }: { value: unknown }) => normalizeTag(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assetTag!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsUUID('4')
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  equipmentType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['operational', 'warning', 'down', 'maintenance'])
  status?: 'operational' | 'warning' | 'down' | 'maintenance';

  @IsOptional()
  @Type(() => Number)
  nominalVoltageV?: number;

  @IsOptional()
  @Type(() => Number)
  nominalCurrentA?: number;

  @IsOptional()
  @IsString()
  commissionedAt?: string;

  @IsOptional()
  @IsArray()
  components?: ComponentInputDto[];
}

export class UpdateAssetDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeTag(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assetTag?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['operational', 'warning', 'down', 'maintenance'])
  status?: 'operational' | 'warning' | 'down' | 'maintenance';

  @IsOptional()
  @Type(() => Number)
  nominalVoltageV?: number;

  @IsOptional()
  @Type(() => Number)
  nominalCurrentA?: number;

  @IsOptional()
  @IsString()
  commissionedAt?: string;

  @IsOptional()
  @IsArray()
  components?: ComponentInputDto[];
}

export class AssetListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsIn(['operational', 'warning', 'down', 'maintenance'])
  status?: 'operational' | 'warning' | 'down' | 'maintenance';

  @IsOptional()
  @IsString()
  equipmentType?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  includeArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

