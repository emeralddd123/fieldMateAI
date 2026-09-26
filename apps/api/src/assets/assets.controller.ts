import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AssetsService } from './assets.service';

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
@Controller('api/v1/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list() {
    return { data: await this.assets.list() };
  }

  @Get('search')
  async search(@Query() query: SearchAssetsQuery) {
    return { data: await this.assets.search(query.q) };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.assets.get(id) };
  }
}
