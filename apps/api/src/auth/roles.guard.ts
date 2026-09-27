import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators';
import type { RequestWithAccess, UserRole } from '../access/access.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAccess>();
    if (!request.access) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'No access context available to evaluate roles.',
      });
    }

    request.access.assertRole(requiredRoles);
    return true;
  }
}
