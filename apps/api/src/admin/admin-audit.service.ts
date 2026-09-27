import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessContext } from '../access/access.types';
import type { AuditListQueryDto } from './admin.dto';
import type { Prisma } from '../generated/prisma/client';

@Injectable()
export class AdminAuditService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuditService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run background expired session & token cleanup every 60 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.purgeExpired().catch((err) =>
          this.logger.error(`Periodic cleanup job failed: ${err.message}`, err.stack),
        );
      },
      60 * 60 * 1000,
    );
  }

  async listAuditEvents(access: AccessContext, query: AuditListQueryDto) {
    const where: Prisma.AuditEventWhereInput = {
      organizationId: access.organization.id,
    };

    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }

    if (query.actorId) {
      where.actorUserId = query.actorId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    const [total, events] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          actorMembership: {
            select: {
              id: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      events: events.map((e: any) => ({
        id: e.id,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        targetMembershipId: e.targetMembershipId,
        requestId: e.requestId,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
        actor: e.actorUser
          ? {
              id: e.actorUser.id,
              name: e.actorUser.name,
              email: e.actorUser.email,
            }
          : null,
        membership: e.actorMembership
          ? {
              id: e.actorMembership.id,
              role: e.actorMembership.role,
            }
          : null,
      })),
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async listActions(access: AccessContext): Promise<string[]> {
    const results = await this.prisma.auditEvent.findMany({
      where: { organizationId: access.organization.id },
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return results.map((r: { action: string }) => r.action);
  }

  async purgeExpired(access?: AccessContext) {
    const now = new Date();

    const [purgedSessions, purgedResetTokens, purgedInvites] = await Promise.all([
      this.prisma.authSession.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.userInvite.deleteMany({
        where: { expiresAt: { lt: now }, acceptedAt: null },
      }),
    ]);

    const result = {
      purgedSessions: purgedSessions.count,
      purgedResetTokens: purgedResetTokens.count,
      purgedInvites: purgedInvites.count,
      timestamp: now.toISOString(),
    };

    if (access) {
      await this.prisma.auditEvent.create({
        data: {
          organizationId: access.organization.id,
          actorUserId: access.user.id,
          actorMembershipId: access.membershipId,
          action: 'system.cleanup_executed',
          resourceType: 'system',
          resourceId: access.organization.id,
          details: result,
        },
      });
    }

    this.logger.log(
      `Cleanup job completed: purged ${result.purgedSessions} sessions, ${result.purgedResetTokens} reset tokens, ${result.purgedInvites} invites.`,
    );

    return result;
  }
}
