import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { env } from '../config/env';
import { SessionService } from './session.service';
import { AccessService } from '../access/access.service';
import { IS_PUBLIC_KEY } from './decorators';
import type { RequestWithAccess } from '../access/access.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const auth = await this.sessions.authenticate(
      cookies?.[env.SESSION_COOKIE_NAME],
    );

    const requestedOrgId = request.header('x-organization-id');
    const accessContext = await this.access.resolveAccess(
      auth,
      requestedOrgId?.trim() || undefined,
    );

    const reqWithAccess = request as RequestWithAccess;
    reqWithAccess.auth = auth;
    reqWithAccess.access = accessContext;

    return true;
  }
}
