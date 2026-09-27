import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AssetsService } from './assets.service';
import { CurrentAccess } from '../auth/decorators';
import type { AccessContext } from '../access/access.types';

class SearchAssetsQuery {
  @ApiProperty({ example: 'M-204', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q!: string;
}

@ApiTags('assets')
@ApiCookieAuth('fieldmate-session')
@Controller('api/v1/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list(@CurrentAccess() access: AccessContext) {
    return { data: await this.assets.list(access) };
  }

  @Get('search')
  async search(
    @Query() query: SearchAssetsQuery,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.assets.search(query.q, access) };
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ) {
    return { data: await this.assets.get(id, access) };
  }
}
