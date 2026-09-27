import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import {
  clearSessionCookieOptions,
  sessionCookieOptions,
} from '../config/session-cookie';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';
import { CurrentAuth, Public } from './decorators';
import {
  ChangePasswordDto,
  LoginDto,
  PasswordDto,
  PasswordResetDto,
  PasswordResetRequestDto,
  TokenParams,
} from './dto';
import { OriginGuard } from './origin.guard';

@ApiTags('authentication')
@Controller('api/v1/auth')
@UseGuards(OriginGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setSession(response: Response, token: string) {
    response.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions);
  }

  private clearSession(response: Response) {
    response.cookie(env.SESSION_COOKIE_NAME, '', {
      ...clearSessionCookieOptions,
      maxAge: 0,
      expires: new Date(0),
    });
  }

  @Public()
  @Post('login')
  @Throttle({
    default: {
      ttl: env.AUTH_RATE_LIMIT_TTL_MS,
      limit: env.AUTH_RATE_LIMIT_MAX,
    },
  })
  @ApiOperation({ summary: 'Start a revocable browser session' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, request);
    this.setSession(response, result.token);
    return { data: result.auth };
  }

  @Get('me')
  @ApiCookieAuth('fieldmate-session')
  me(@CurrentAuth() auth: AuthContext) {
    return { data: auth };
  }

  @Post('logout')
  @ApiCookieAuth('fieldmate-session')
  async logout(
    @CurrentAuth() current: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(current, request);
    this.clearSession(response);
    return { data: { loggedOut: true } };
  }

  @Post('logout-all')
  @ApiCookieAuth('fieldmate-session')
  async logoutAll(
    @CurrentAuth() current: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(current, request);
    this.clearSession(response);
    return { data: { loggedOut: true } };
  }

  @Post('change-password')
  @ApiCookieAuth('fieldmate-session')
  async changePassword(
    @CurrentAuth() current: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.changePassword(current, dto, request);
    this.setSession(response, result.token);
    return { data: result.auth };
  }

  @Public()
  @Post('invitations/:token/accept')
  @Throttle({
    default: {
      ttl: env.AUTH_RATE_LIMIT_TTL_MS,
      limit: env.AUTH_RATE_LIMIT_MAX,
    },
  })
  async acceptInvitation(
    @Param() params: TokenParams,
    @Body() dto: PasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.acceptInvitation(
      params.token,
      dto.password,
      request,
    );
    this.setSession(response, result.token);
    return { data: result.auth };
  }

  @Public()
  @Post('password-reset/request')
  @Throttle({
    default: {
      ttl: env.AUTH_RATE_LIMIT_TTL_MS,
      limit: env.AUTH_RATE_LIMIT_MAX,
    },
  })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return { data: await this.auth.requestPasswordReset(dto) };
  }

  @Public()
  @Post('password-reset/:token')
  @Throttle({
    default: {
      ttl: env.AUTH_RATE_LIMIT_TTL_MS,
      limit: env.AUTH_RATE_LIMIT_MAX,
    },
  })
  async resetPassword(
    @Param() params: TokenParams,
    @Body() dto: PasswordResetDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.resetPassword(
      params.token,
      dto.password,
      request,
    );
    this.setSession(response, result.token);
    return { data: result.auth };
  }
}
