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
import { AdminUsersService } from './admin-users.service';
import {
  InviteUserDto,
  UpdateUserDto,
  UserListQueryDto,
} from './admin.dto';

@ApiTags('admin-users')
@ApiCookieAuth('session')
@Roles('admin')
@Controller('api/v1/admin')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}


  @Get('users')
  @ApiOperation({ summary: 'List and filter organization users with pagination' })
  async listUsers(
    @CurrentAccess() access: AccessContext,
    @Query() query: UserListQueryDto,
  ) {
    return { data: await this.adminUsers.listUsers(access, query) };
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get single organization user details and audit log' })
  async getUser(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return { data: await this.adminUsers.getUser(access, id) };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user profile, role, status, or site access' })
  async updateUser(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    return { data: await this.adminUsers.updateUser(access, id, dto, request) };
  }

  @Post('users/:id/revoke-sessions')
  @ApiOperation({ summary: 'Revoke all active sessions for a user' })
  async revokeSessions(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.adminUsers.revokeUserSessions(access, id, request) };
  }

  @Post('invitations')
  @ApiOperation({ summary: 'Invite a new user to the organization' })
  async inviteUser(
    @CurrentAccess() access: AccessContext,
    @Body() dto: InviteUserDto,
    @Req() request: Request,
  ) {
    return { data: await this.adminUsers.inviteUser(access, dto, request) };
  }

  @Get('invitations')
  @ApiOperation({ summary: 'List pending organization invitations' })
  async listInvitations(@CurrentAccess() access: AccessContext) {
    return { data: await this.adminUsers.listInvitations(access) };
  }

  @Delete('invitations/:id')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revokeInvitation(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.adminUsers.revokeInvitation(access, id, request) };
  }

  @Post('invitations/:id/resend')
  @ApiOperation({ summary: 'Resend / refresh a pending invitation' })
  async resendInvitation(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return { data: await this.adminUsers.resendInvitation(access, id, request) };
  }
}
