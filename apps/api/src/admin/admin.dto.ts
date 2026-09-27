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
