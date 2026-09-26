import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateIncidentDto,
  EscalateDto,
  IncidentQuery,
  NoteDto,
  UpdateIncidentDto,
} from './dto';
import {
  lockCreationRequest,
  verifyCreationRetry,
  activeStatuses,
  conflict,
  DEMO_TECHNICIAN_ID,
  incidentInclude,
  lockAsset,
  lockIncident,
  missing,
  normalizeFaultCode,
  requireTechnician,
} from './support';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

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
      await lockIncident(tx, id);
      await requireTechnician(tx);
      return tx.incidentNote.create({
        data: { incidentId: id, ...dto, authorId: DEMO_TECHNICIAN_ID },
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
}
