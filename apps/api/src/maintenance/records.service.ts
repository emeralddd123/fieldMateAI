import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMeasurementDto, HistoryQuery, PageQuery } from './dto';
import type { AccessContext } from '../access/access.types';
import {
  lockCreationRequest,
  verifyCreationRetry,
  activeStatuses,
  conflict,
  incidentInclude,
  lockAsset,
  missing,
  normalizeFaultCode,
  requireAsset,
  validateMeasurement,
} from './support';

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async history(assetId: string, query: HistoryQuery, access: AccessContext) {
    const asset = await requireAsset(this.prisma, assetId, access);
    const where = {
      assetId,
      ...(query.faultCode
        ? { faultCode: normalizeFaultCode(query.faultCode) }
        : {}),
    };
    const [totalMatchingIncidents, incidents, maintenanceRecords] =
      await this.prisma.$transaction([
        this.prisma.incident.count({ where }),
        this.prisma.incident.findMany({
          where,
          include: incidentInclude,
          orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
        }),
        this.prisma.maintenanceRecord.findMany({
          where,
          include: { technician: { select: { name: true } } },
          orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
        }),
      ]);
    return {
      assetId,
      assetTag: asset.assetTag,
      totalMatchingIncidents,
      incidents,
      maintenanceRecords,
    };
  }

  async measurements(assetId: string, query: PageQuery, access: AccessContext) {
    await requireAsset(this.prisma, assetId, access);
    return this.prisma.measurement.findMany({
      where: { assetId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
  }

  async maintenanceRecords(
    assetId: string,
    query: PageQuery,
    access: AccessContext,
  ) {
    await requireAsset(this.prisma, assetId, access);
    return this.prisma.maintenanceRecord.findMany({
      where: { assetId },
      include: { technician: { select: { name: true } } },
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
  }

  async recordMeasurement(dto: CreateMeasurementDto, access: AccessContext) {
    validateMeasurement(dto);
    return this.prisma.$transaction(async (tx) => {
      const requestHash = await lockCreationRequest(tx, 'measurement', dto);
      if (dto.requestId) {
        const existing = await tx.measurement.findUnique({
          where: { requestId: dto.requestId },
        });
        if (existing) {
          verifyCreationRetry(existing.requestHash, requestHash);
          return existing;
        }
      }

      await lockAsset(tx, dto.assetId, access);
      if (dto.incidentId) {
        const incident = await tx.incident.findUnique({
          where: { id: dto.incidentId },
        });
        if (!incident)
          missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
        if (incident.assetId !== dto.assetId)
          conflict(
            'ASSET_MISMATCH',
            'The incident belongs to a different asset.',
          );
        if (!activeStatuses.some((status) => status === incident.status))
          conflict(
            'INCIDENT_FINISHED',
            'This incident is already resolved or closed.',
          );
      }
      return tx.measurement.create({
        data: { ...dto, requestHash, recordedById: access.user.id },
      });
    });
  }
}
