import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangePasswordDto,
  LoginDto,
  PasswordResetRequestDto,
} from './dto';
import { PasswordService } from './password.service';
import { createRawToken, hashToken, SessionService } from './session.service';
import type { AuthContext } from './auth.types';

function invalidCredentials() {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'The email or password is incorrect.',
  });
}

function invalidToken() {
  return new UnauthorizedException({
    code: 'INVALID_OR_EXPIRED_TOKEN',
    message: 'This link is invalid or has expired.',
  });
}

function metadata(request: Request) {
  return {
    requestId: request.header('x-request-id'),
    ipAddress: request.ip?.slice(0, 64),
    userAgent: request.header('user-agent')?.slice(0, 500),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  private async auditForMemberships(
    tx: Prisma.TransactionClient,
    memberships: Array<{ id: string; organizationId: string }>,
    actorUserId: string,
    action: string,
    request: Request,
    details: Prisma.InputJsonValue = {},
  ) {
    if (!memberships.length) return;
    await tx.auditEvent.createMany({
      data: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        actorUserId,
        actorMembershipId: membership.id,
        action,
        resourceType: 'user',
        resourceId: actorUserId,
        details,
        ...metadata(request),
      })),
    });
  }

  private async sessionResult(userId: string, request: Request) {
    const created = await this.sessions.create(userId, request);
    return {
      token: created.token,
      auth: await this.sessions.authenticate(created.token),
    };
  }

  async login(dto: LoginDto, request: Request) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
      include: {
        memberships: { where: { status: 'active' } },
      },
    });
    if (
      !user ||
      user.status !== 'active' ||
      user.memberships.length === 0 ||
      !(await this.passwords.verify(user.passwordHash, dto.password))
    )
      throw invalidCredentials();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        user.memberships,
        user.id,
        'auth.login',
        request,
      );
    });
    return this.sessionResult(user.id, request);
  }

  async logout(auth: AuthContext, request: Request) {
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { id: auth.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        auth.memberships.map((item) => ({
          id: item.id,
          organizationId: item.organization.id,
        })),
        auth.user.id,
        'auth.logout',
        request,
      );
    });
  }

  async logoutAll(auth: AuthContext, request: Request) {
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { userId: auth.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        auth.memberships.map((item) => ({
          id: item.id,
          organizationId: item.organization.id,
        })),
        auth.user.id,
        'auth.logout_all',
        request,
      );
    });
  }

  async changePassword(
    auth: AuthContext,
    dto: ChangePasswordDto,
    request: Request,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { passwordHash: true },
    });
    if (
      !user ||
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    )
      throw invalidCredentials();
    if (await this.passwords.verify(user.passwordHash, dto.newPassword))
      throw new ConflictException({
        code: 'PASSWORD_UNCHANGED',
        message: 'Choose a different password.',
      });
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await tx.authSession.updateMany({
        where: { userId: auth.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        auth.memberships.map((item) => ({
          id: item.id,
          organizationId: item.organization.id,
        })),
        auth.user.id,
        'auth.password_changed',
        request,
      );
    });
    return this.sessionResult(auth.user.id, request);
  }

  async acceptInvitation(token: string, password: string, request: Request) {
    const passwordHash = await this.passwords.hash(password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.userInvite.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (
        !invite ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt <= new Date()
      )
        throw invalidToken();
      const existing = await tx.user.findFirst({
        where: { email: { equals: invite.email, mode: 'insensitive' } },
      });
      if (existing?.status === 'disabled') throw invalidToken();
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: invite.name,
              email: invite.email.toLowerCase(),
              status: 'active',
              passwordHash,
              passwordChangedAt: new Date(),
            },
          })
        : await tx.user.create({
            data: {
              name: invite.name,
              email: invite.email.toLowerCase(),
              status: 'active',
              passwordHash,
              passwordChangedAt: new Date(),
            },
          });
      const membership = await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId: user.id,
          },
        },
        update: { role: invite.role, status: 'active' },
        create: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
        },
      });
      const siteIds = Array.isArray(invite.siteIds)
        ? invite.siteIds.filter((id): id is string => typeof id === 'string')
        : [];
      const validSites = await tx.site.findMany({
        where: {
          id: { in: siteIds },
          organizationId: invite.organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (validSites.length !== new Set(siteIds).size) throw invalidToken();
      await tx.membershipSiteAccess.deleteMany({
        where: { membershipId: membership.id },
      });
      if (validSites.length)
        await tx.membershipSiteAccess.createMany({
          data: validSites.map((site) => ({
            membershipId: membership.id,
            siteId: site.id,
          })),
        });
      await tx.userInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        [{ id: membership.id, organizationId: invite.organizationId }],
        user.id,
        'auth.invitation_accepted',
        request,
      );
      return user.id;
    });
    return this.sessionResult(userId, request);
  }

  async requestPasswordReset(dto: PasswordResetRequestDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: dto.email, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true },
    });
    let token: string | undefined;
    if (user) {
      token = createRawToken();
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token!),
            expiresAt: new Date(
              Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
            ),
          },
        });
      });
    }
    return {
      accepted: true,
      ...(env.APP_ENV !== 'production' && env.AUTH_RETURN_RESET_TOKEN && token
        ? { resetToken: token }
        : {}),
    };
  }

  async resetPassword(token: string, password: string, request: Request) {
    const passwordHash = await this.passwords.hash(password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: {
          user: { include: { memberships: { where: { status: 'active' } } } },
        },
      });
      if (
        !reset ||
        reset.usedAt ||
        reset.expiresAt <= new Date() ||
        reset.user.status !== 'active'
      )
        throw invalidToken();
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });
      await tx.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditForMemberships(
        tx,
        reset.user.memberships,
        reset.userId,
        'auth.password_reset',
        request,
      );
      return reset.userId;
    });
    return this.sessionResult(userId, request);
  }
}
