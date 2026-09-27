import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../config/env';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method)) return true;
    if (request.header('origin') === new URL(env.FRONTEND_URL).origin)
      return true;
    throw new ForbiddenException({
      code: 'INVALID_REQUEST_ORIGIN',
      message: 'The request origin is not allowed.',
    });
  }
}
