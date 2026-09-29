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
    const origin = request.header('origin');
    if (!origin) {
      throw new ForbiddenException({
        code: 'INVALID_REQUEST_ORIGIN',
        message: 'The request origin is not allowed.',
      });
    }

    if (origin === new URL(env.FRONTEND_URL).origin) return true;

    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return true;
      }
    } catch {
      /* Malformed origins are rejected below. */
    }

    throw new ForbiddenException({
      code: 'INVALID_REQUEST_ORIGIN',
      message: 'The request origin is not allowed.',
    });
  }
}
