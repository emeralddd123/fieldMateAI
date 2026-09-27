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
import {
  lockCreationRequest,
  verifyCreationRetry,
  activeStatuses,
  conflict,
  DEMO_SUPERVISOR_ID,
  DEMO_TECHNICIAN_ID,
  incidentInclude,
  lockAsset,
  lockIncident,
  missing,
  normalizeFaultCode,
  requireTechnician,
  requireSupervisor,
} from './support';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async users() {
    return this.prisma.user.findMany({
      where: { role: { in: ['technician', 'supervisor'] } },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
    });
  }

  async list(query: IncidentQuery) {
    return this.prisma.incident.findMany({
      where: { assetId: query.assetId, status: query.status },
      include: incidentInclude,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
  }
  async get(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: incidentInclude,
    });
    if (!incident)
      missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
    return incident;
  }
  async create(dto: CreateIncidentDto) {
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

      await lockAsset(tx, dto.assetId);
      await requireTechnician(tx);
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
          openedById: DEMO_TECHNICIAN_ID,
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
  async update(id: string, dto: UpdateIncidentDto) {
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id);
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
      if (
        dto.assignedToId &&
        !(await tx.user.findUnique({ where: { id: dto.assignedToId } }))
      )
        missing('USER_NOT_FOUND', 'No user matched the assignee.');
      return tx.incident.update({
        where: { id },
        data: dto,
        include: incidentInclude,
      });
    });
  }
  async note(id: string, dto: NoteDto) {
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
      await lockIncident(tx, id);
      await requireTechnician(tx);
      return tx.incidentNote.create({
        data: {
          incidentId: id,
          ...dto,
          requestHash,
          authorId: DEMO_TECHNICIAN_ID,
        },
      });
    });
  }
  async escalate(id: string, dto: EscalateDto) {
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id);
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

  async supervisorReview(id: string, dto: SupervisorReviewDto) {
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
      const incident = await lockIncident(tx, id);
      if (!activeStatuses.some((status) => status === incident.status))
        conflict(
          'INCIDENT_FINISHED',
          'Resolved or closed incidents cannot receive a supervisor review.',
        );
      await requireSupervisor(tx);
      if (typeof dto.assignedToId === 'string') {
        const assignee = await tx.user.findUnique({
          where: { id: dto.assignedToId },
        });
        if (!assignee || !['technician', 'supervisor'].includes(assignee.role))
          missing('USER_NOT_FOUND', 'No eligible user matched the assignee.');
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
            acknowledgedById: DEMO_SUPERVISOR_ID,
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
            authorId: DEMO_SUPERVISOR_ID,
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
