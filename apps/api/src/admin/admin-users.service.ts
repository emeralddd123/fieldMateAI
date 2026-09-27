import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessContext } from '../access/access.types';
import { env } from '../config/env';
import { createRawToken, hashToken } from '../auth/session.service';
import type {
  InviteUserDto,
  UpdateUserDto,
  UserListQueryDto,
} from './admin.dto';

function requestMetadata(request: Request) {
  return {
    requestId: request.header('x-request-id'),
    ipAddress: request.ip?.slice(0, 64),
    userAgent: request.header('user-agent')?.slice(0, 500),
  };
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(
    tx: Prisma.TransactionClient,
    access: AccessContext,
    action: string,
    resourceType: string,
    resourceId: string,
    request: Request,
    details: Prisma.InputJsonValue = {},
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: access.organization.id,
        actorUserId: access.user.id,
        actorMembershipId: access.membershipId,
        action,
        resourceType,
        resourceId,
        details,
        ...requestMetadata(request),
      },
    });
  }

  async listSites(access: AccessContext) {
    return this.prisma.site.findMany({
      where: {
        organizationId: access.organization.id,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async listUsers(access: AccessContext, query: UserListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId: access.organization.id,
    };

    if (query.role) {
      where.role = query.role;
    }

    const userWhere: Prisma.UserWhereInput = {};
    if (query.status === 'active' || query.status === 'disabled') {
      userWhere.status = query.status;
    }

    if (query.q) {
      const search = query.q.trim();
      userWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (Object.keys(userWhere).length > 0) {
      where.user = userWhere;
    }

    if (query.siteId) {
      where.siteAccess = {
        some: { siteId: query.siteId },
      };
    }

    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
              updatedAt: true,
              sessions: {
                where: {
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
                select: { id: true },
              },
            },
          },
          siteAccess: {
            where: { site: { archivedAt: null } },
            include: {
              site: {
                select: { id: true, name: true, code: true },
              },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const users = memberships.map((membership) => ({
      id: membership.user.id,
      membershipId: membership.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      status: membership.user.status,
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      sites: membership.siteAccess.map((sa) => sa.site),
      activeSessionCount: membership.user.sessions.length,
    }));

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(access: AccessContext, userId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: access.organization.id,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            sessions: {
              where: {
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
              select: {
                id: true,
                createdAt: true,
                lastSeenAt: true,
                ipAddress: true,
                userAgent: true,
              },
              orderBy: { lastSeenAt: 'desc' },
            },
          },
        },
        siteAccess: {
          where: { site: { archivedAt: null } },
          include: {
            site: {
              select: { id: true, name: true, code: true, location: true },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'The requested user was not found in this organization.',
      });
    }

    const recentAudit = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: access.organization.id,
        OR: [{ actorUserId: userId }, { resourceId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      id: membership.user.id,
      membershipId: membership.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      status: membership.user.status,
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      sites: membership.siteAccess.map((sa) => sa.site),
      activeSessions: membership.user.sessions,
      recentAuditEvents: recentAudit,
    };
  }

  async updateUser(
    access: AccessContext,
    userId: string,
    dto: UpdateUserDto,
    request: Request,
  ) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: access.organization.id,
          userId,
        },
      },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'The requested user was not found in this organization.',
      });
    }

    // Self-deactivation protection
    if (userId === access.user.id && dto.status === 'disabled') {
      throw new ConflictException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate your own account.',
      });
    }

    // Last admin protection
    const isDemotingAdmin =
      membership.role === 'admin' && dto.role && dto.role !== 'admin';
    const isDisablingAdmin =
      membership.role === 'admin' && dto.status === 'disabled';

    if (isDemotingAdmin || isDisablingAdmin) {
      const activeAdminCount = await this.prisma.organizationMembership.count({
        where: {
          organizationId: access.organization.id,
          role: 'admin',
          status: 'active',
          user: { status: 'active' },
          userId: { not: userId },
        },
      });

      if (activeAdminCount === 0) {
        throw new ConflictException({
          code: 'LAST_ADMIN_PROTECTED',
          message: 'Cannot demote or deactivate the last active administrator.',
        });
      }
    }

    // Validate site IDs if provided
    let validSites: { id: string }[] = [];
    if (dto.siteIds) {
      validSites = await this.prisma.site.findMany({
        where: {
          id: { in: dto.siteIds },
          organizationId: access.organization.id,
          archivedAt: null,
        },
        select: { id: true },
      });

      if (validSites.length !== new Set(dto.siteIds).size) {
        throw new BadRequestException({
          code: 'INVALID_SITE_SELECTION',
          message: 'One or more selected sites do not exist in this organization.',
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // If user status is disabled, immediately revoke all active sessions
      if (dto.status === 'disabled') {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // Update user name/status
      if (dto.name !== undefined || dto.status !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            name: dto.name !== undefined ? dto.name.trim() : undefined,
            status: dto.status,
          },
        });
      }

      // Update membership role
      if (dto.role !== undefined) {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: { role: dto.role },
        });
      }

      // Reconcile site access
      if (dto.siteIds !== undefined) {
        await tx.membershipSiteAccess.deleteMany({
          where: { membershipId: membership.id },
        });
        if (validSites.length > 0) {
          await tx.membershipSiteAccess.createMany({
            data: validSites.map((site) => ({
              membershipId: membership.id,
              siteId: site.id,
            })),
          });
        }
      }

      let auditAction = 'admin.user.update';
      if (dto.status === 'disabled') {
        auditAction = 'admin.user.deactivate';
      } else if (dto.status === 'active' && membership.user.status === 'disabled') {
        auditAction = 'admin.user.reactivate';
      }

      await this.audit(
        tx,
        access,
        auditAction,
        'user',
        userId,
        request,
        {
          previousRole: membership.role,
          newRole: dto.role ?? membership.role,
          previousStatus: membership.user.status,
          newStatus: dto.status ?? membership.user.status,
          sitesUpdated: dto.siteIds !== undefined,
        },
      );

      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: membership.id },
        include: {
          user: true,
          siteAccess: {
            include: {
              site: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });
    });

    return {
      id: updated.user.id,
      membershipId: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role,
      status: updated.user.status,
      sites: updated.siteAccess.map((sa) => sa.site),
      updatedAt: updated.updatedAt,
    };
  }

  async revokeUserSessions(
    access: AccessContext,
    userId: string,
    request: Request,
  ) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: access.organization.id,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'The requested user was not found in this organization.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit(
        tx,
        access,
        'admin.user.revoke_sessions',
        'user',
        userId,
        request,
        { count: revoked.count },
      );

      return revoked;
    });

    return { revokedCount: result.count };
  }

  async inviteUser(
    access: AccessContext,
    dto: InviteUserDto,
    request: Request,
  ) {
    const email = dto.email.trim().toLowerCase();

    // Check if active member already exists
    const existingMembership =
      await this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: access.organization.id,
          user: { email: { equals: email, mode: 'insensitive' } },
        },
        include: { user: true },
      });

    if (
      existingMembership &&
      existingMembership.status === 'active' &&
      existingMembership.user.status === 'active'
    ) {
      throw new ConflictException({
        code: 'USER_ALREADY_MEMBER',
        message:
          'A user with this email is already an active member of this organization.',
      });
    }

    // Validate site IDs
    const siteIds = dto.siteIds || [];
    if (siteIds.length > 0) {
      const validSites = await this.prisma.site.findMany({
        where: {
          id: { in: siteIds },
          organizationId: access.organization.id,
          archivedAt: null,
        },
        select: { id: true },
      });

      if (validSites.length !== new Set(siteIds).size) {
        throw new BadRequestException({
          code: 'INVALID_SITE_SELECTION',
          message:
            'One or more selected sites do not exist in this organization.',
        });
      }
    }

    const token = createRawToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1000,
    );

    const invite = await this.prisma.$transaction(async (tx) => {
      // Revoke any prior unaccepted invite for this email in this org
      await tx.userInvite.updateMany({
        where: {
          organizationId: access.organization.id,
          email: { equals: email, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      const created = await tx.userInvite.create({
        data: {
          organizationId: access.organization.id,
          email,
          name: dto.name.trim(),
          role: dto.role,
          siteIds,
          tokenHash,
          expiresAt,
          createdById: access.user.id,
        },
      });

      await this.audit(
        tx,
        access,
        'admin.user.invite',
        'user_invite',
        created.id,
        request,
        {
          invitedEmail: email,
          role: dto.role,
          siteIds,
          expiresAt: expiresAt.toISOString(),
        },
      );

      return created;
    });

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        siteIds: invite.siteIds,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
      inviteToken: token,
      inviteUrl: `${env.FRONTEND_URL}/accept-invite/${token}`,
    };
  }

  async listInvitations(access: AccessContext) {
    const invites = await this.prisma.userInvite.findMany({
      where: {
        organizationId: access.organization.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      siteIds: invite.siteIds,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      createdBy: invite.createdBy,
    }));
  }

  async revokeInvitation(
    access: AccessContext,
    inviteId: string,
    request: Request,
  ) {
    const invite = await this.prisma.userInvite.findFirst({
      where: {
        id: inviteId,
        organizationId: access.organization.id,
      },
    });

    if (!invite) {
      throw new NotFoundException({
        code: 'INVITE_NOT_FOUND',
        message: 'The requested invitation was not found.',
      });
    }

    if (invite.acceptedAt) {
      throw new ConflictException({
        code: 'INVITE_ALREADY_ACCEPTED',
        message: 'This invitation has already been accepted.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });

      await this.audit(
        tx,
        access,
        'admin.user.invite_revoked',
        'user_invite',
        invite.id,
        request,
        { email: invite.email },
      );
    });

    return { success: true };
  }

  async resendInvitation(
    access: AccessContext,
    inviteId: string,
    request: Request,
  ) {
    const invite = await this.prisma.userInvite.findFirst({
      where: {
        id: inviteId,
        organizationId: access.organization.id,
      },
    });

    if (!invite) {
      throw new NotFoundException({
        code: 'INVITE_NOT_FOUND',
        message: 'The requested invitation was not found.',
      });
    }

    if (invite.acceptedAt) {
      throw new ConflictException({
        code: 'INVITE_ALREADY_ACCEPTED',
        message: 'This invitation has already been accepted.',
      });
    }

    const token = createRawToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1000,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const renewed = await tx.userInvite.update({
        where: { id: invite.id },
        data: {
          tokenHash,
          expiresAt,
          revokedAt: null,
        },
      });

      await this.audit(
        tx,
        access,
        'admin.user.invite_resent',
        'user_invite',
        invite.id,
        request,
        { email: invite.email, expiresAt: expiresAt.toISOString() },
      );

      return renewed;
    });

    return {
      invite: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        siteIds: updated.siteIds,
        expiresAt: updated.expiresAt,
        createdAt: updated.createdAt,
      },
      inviteToken: token,
      inviteUrl: `${env.FRONTEND_URL}/accept-invite/${token}`,
    };
  }
}
