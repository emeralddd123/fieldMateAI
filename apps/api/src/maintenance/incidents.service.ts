import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateIncidentDto,
  EscalateDto,
  IncidentQuery,
  NoteDto,
  SupervisorReviewDto,
  UpdateIncidentDto,
} from './dto';
import type { AccessContext } from '../access/access.types';
import { scopedIncidentWhere } from '../access/scoped-query.helpers';
import {
  lockCreationRequest,
  verifyCreationRetry,
  activeStatuses,
  conflict,
  incidentInclude,
  lockAsset,
  lockIncident,
  missing,
  normalizeFaultCode,
  requireAsset,
  requireAssignableUser,
} from './support';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assignees(siteId: string | undefined, access: AccessContext) {
    if (siteId) {
      access.assertSite(siteId);
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: access.organization.id,
        status: 'active',
        user: { status: 'active' },
      },
      include: {
        user: { select: { id: true, name: true } },
        siteAccess: { select: { siteId: true } },
      },
      orderBy: [{ role: 'desc' }, { user: { name: 'asc' } }],
    });

    return memberships
      .filter((membership) => {
        if (!siteId) return true;
        if (membership.role === 'admin') return true;
        return membership.siteAccess.some((sa) => sa.siteId === siteId);
      })
      .map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        role: membership.role,
      }));
  }

  async users(siteId?: string, access?: AccessContext) {
    if (access) {
      return this.assignees(siteId, access);
    }
    return this.prisma.user.findMany({
      where: { role: { in: ['technician', 'supervisor', 'admin'] } },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
    });
  }

  async list(query: IncidentQuery, access: AccessContext) {
    if (query.assetId) {
      await requireAsset(this.prisma, query.assetId, access);
    }
    return this.prisma.incident.findMany({
      where: {
        ...scopedIncidentWhere(access),
        ...(query.assetId ? { assetId: query.assetId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: incidentInclude,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
  }

  async get(id: string, access: AccessContext) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: incidentInclude,
    });
    if (!incident || incident.asset.archivedAt !== null) {
      missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
    }
    if (
      incident.asset.organizationId !== access.organization.id ||
      !access.hasSite(incident.asset.siteId)
    ) {
      missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
    }
    return incident;
  }

  async create(dto: CreateIncidentDto, access: AccessContext) {
    return this.prisma.$transaction(async (tx) => {
      const requestHash = await lockCreationRequest(tx, 'incident', dto);
      if (dto.requestId) {
        const existing = await tx.incident.findUnique({
          where: { requestId: dto.requestId },
          include: incidentInclude,
        });
        if (existing) {
          verifyCreationRetry(existing.requestHash, requestHash);
          return existing;
        }
      }

      await lockAsset(tx, dto.assetId, access);
      const { measurementIds = [], assetStatus, ...data } = dto;
      if (measurementIds.length) {
        const count = await tx.measurement.count({
          where: {
            id: { in: measurementIds },
            assetId: dto.assetId,
            incidentId: null,
          },
        });
        if (count !== measurementIds.length)
          conflict(
            'INVALID_MEASUREMENT_LINK',
            'Every reading must exist, belong to this asset, and be unassigned.',
          );
      }
      const incident = await tx.incident.create({
        data: {
          ...data,
          requestHash,
          faultCode: dto.faultCode ? normalizeFaultCode(dto.faultCode) : null,
          openedById: access.user.id,
        },
      });
      await tx.measurement.updateMany({
        where: { id: { in: measurementIds } },
        data: { incidentId: incident.id },
      });
      const asset = await tx.asset.findUniqueOrThrow({
        where: { id: dto.assetId },
      });
      await tx.asset.update({
        where: { id: dto.assetId },
        data: { status: asset.status === 'down' ? 'down' : assetStatus },
      });
      return tx.incident.findUniqueOrThrow({
        where: { id: incident.id },
        include: incidentInclude,
      });
    });
  }

  async update(id: string, dto: UpdateIncidentDto, access: AccessContext) {
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id, access);
      if (incident.status === 'closed')
        conflict('INCIDENT_FINISHED', 'Closed incidents cannot be edited.');
      if (dto.status === 'closed' && incident.status !== 'resolved')
        conflict(
          'INVALID_TRANSITION',
          'Complete the repair before closing the incident.',
        );
      if (
        dto.status === 'investigating' &&
        !['open', 'investigating'].includes(incident.status)
      )
        conflict(
          'INVALID_TRANSITION',
          'Only open incidents can enter investigation.',
        );
      if (dto.assignedToId) {
        await requireAssignableUser(
          tx,
          dto.assignedToId,
          incident.asset.siteId,
          access.organization.id,
        );
      }
      return tx.incident.update({
        where: { id },
        data: dto,
        include: incidentInclude,
      });
    });
  }

  async note(id: string, dto: NoteDto, access: AccessContext) {
    return this.prisma.$transaction(async (tx) => {
      const request = {
        incidentId: id,
        ...dto,
      };
      const requestHash = await lockCreationRequest(
        tx,
        'incident-note',
        request,
      );
      if (dto.requestId) {
        const existing = await tx.incidentNote.findUnique({
          where: { requestId: dto.requestId },
        });
        if (existing) {
          verifyCreationRetry(existing.requestHash, requestHash);
          return existing;
        }
      }
      await lockIncident(tx, id, access);
      return tx.incidentNote.create({
        data: {
          incidentId: id,
          ...dto,
          requestHash,
          authorId: access.user.id,
        },
      });
    });
  }

  async escalate(id: string, dto: EscalateDto, access: AccessContext) {
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id, access);
      if (!activeStatuses.some((status) => status === incident.status))
        conflict(
          'INCIDENT_FINISHED',
          'Resolved or closed incidents cannot be escalated.',
        );
      let escalation = await tx.escalation.findFirst({
        where: { incidentId: id, status: 'pending', ...dto },
      });
      escalation ??= await tx.escalation.create({
        data: { incidentId: id, ...dto },
      });
      await tx.incident.update({
        where: { id },
        data: { status: 'escalated' },
      });
      return {
        escalation,
        notification: 'simulated',
        message:
          'Escalation recorded for supervisor review. No external notification was sent.',
      };
    });
  }

  async supervisorReview(
    id: string,
    dto: SupervisorReviewDto,
    access: AccessContext,
  ) {
    access.assertRole(['supervisor', 'admin']);
    if (
      !dto.acknowledgeEscalation &&
      dto.assignedToId === undefined &&
      !dto.priority &&
      !dto.note
    )
      conflict(
        'EMPTY_SUPERVISOR_REVIEW',
        'Choose an escalation, assignment, priority, or note update.',
      );
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id, access);
      if (!activeStatuses.some((status) => status === incident.status))
        conflict(
          'INCIDENT_FINISHED',
          'Resolved or closed incidents cannot receive a supervisor review.',
        );
      if (typeof dto.assignedToId === 'string') {
        await requireAssignableUser(
          tx,
          dto.assignedToId,
          incident.asset.siteId,
          access.organization.id,
        );
      }
      if (dto.acknowledgeEscalation) {
        const pending = incident.escalations.find(
          (escalation) => escalation.status === 'pending',
        );
        if (!pending)
          conflict(
            'NO_PENDING_ESCALATION',
            'This incident has no pending escalation to acknowledge.',
          );
        await tx.escalation.update({
          where: { id: pending.id },
          data: {
            status: 'acknowledged',
            acknowledgedAt: new Date(),
            acknowledgedById: access.user.id,
          },
        });
      }
      if (dto.assignedToId !== undefined || dto.priority) {
        await tx.incident.update({
          where: { id },
          data: {
            assignedToId: dto.assignedToId,
            priority: dto.priority,
          },
        });
      }
      if (dto.note) {
        await tx.incidentNote.create({
          data: {
            incidentId: id,
            note: dto.note,
            source: 'manual',
            authorId: access.user.id,
          },
        });
      }
      return tx.incident.findUniqueOrThrow({
        where: { id },
        include: incidentInclude,
      });
    });
  }
}
