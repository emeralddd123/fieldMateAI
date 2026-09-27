import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../config/env';
import { SessionService } from './session.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const auth = await this.sessions.authenticate(
      cookies?.[env.SESSION_COOKIE_NAME],
    );
    (request as AuthenticatedRequest).auth = auth;
    return true;
  }
}
