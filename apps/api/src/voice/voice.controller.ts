import { Controller, Get, Header, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VoiceService } from './voice.service';
import { Public } from '../auth/decorators';

@ApiTags('voice')
@Controller('api/v1/voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Public()
  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return { data: this.voice.status() };
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Mint a single-use voice credential (60-second redemption, 10-minute session cap)',
  })
  async token(@Req() request: Request) {
    return {
      data: await this.voice.mint(
        request.headers.origin,
        request.ip ?? 'unknown',
      ),
    };
  }
}
