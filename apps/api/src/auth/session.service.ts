import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';
import type { AuthContext } from './auth.types';

const sessionUserInclude = {
  memberships: {
    where: { status: 'active' as const, organization: { archivedAt: null } },
    include: {
      organization: true,
      siteAccess: {
        where: { site: { archivedAt: null } },
        include: { site: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createRawToken() {
  return randomBytes(32).toString('base64url');
}

function unauthorized() {
  return new UnauthorizedException({
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Sign in to continue.',
  });
}

function requestMetadata(request: Request) {
  return {
    ipAddress: request.ip?.slice(0, 64),
    userAgent: request.header('user-agent')?.slice(0, 500),
  };
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: Request) {
    const token = createRawToken();
    const expiresAt = new Date(
      Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
    );
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        ...requestMetadata(request),
      },
    });
    return { token, session };
  }

  async authenticate(token: string | undefined): Promise<AuthContext> {
    if (!token) throw unauthorized();
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: sessionUserInclude } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      throw unauthorized();
    if (
      session.user.status !== 'active' ||
      !session.user.email ||
      session.user.memberships.length === 0
    ) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw unauthorized();
    }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000)
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      memberships: session.user.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
        },
        sites: membership.siteAccess.map(({ site }) => ({
          id: site.id,
          name: site.name,
          code: site.code,
        })),
      })),
    };
  }

  revoke(sessionId: string) {
    return this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAll(userId: string) {
    return this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
