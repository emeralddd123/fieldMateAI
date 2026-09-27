import {
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccess, Roles } from '../auth/decorators';
import type { AccessContext } from '../access/access.types';
import { AdminAuditService } from './admin-audit.service';
import { AuditListQueryDto } from './admin.dto';

@ApiTags('admin-audit')
@ApiCookieAuth('fieldmate-session')
@Roles('admin')
@Controller('api/v1/admin')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get('audit')
  @ApiOperation({ summary: 'Query immutable security and operational audit trail' })
  async getAuditEvents(
    @Query() query: AuditListQueryDto,
    @CurrentAccess() access: AccessContext,
  ) {
    const data = await this.auditService.listAuditEvents(access, query);
    return { data };
  }

  @Get('audit/actions')
  @ApiOperation({ summary: 'List distinct audit actions for filtering' })
  async getAuditActions(@CurrentAccess() access: AccessContext) {
    const data = await this.auditService.listActions(access);
    return { data };
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Trigger manual purge of expired sessions and tokens' })
  async triggerCleanup(@CurrentAccess() access: AccessContext) {
    const data = await this.auditService.purgeExpired(access);
    return { data };
  }
}
