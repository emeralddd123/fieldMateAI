import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { CompleteRepairDto, CreateMaintenanceRecordDto } from './dto';
import type { AccessContext } from '../access/access.types';
import {
  activeStatuses,
  conflict,
  incidentInclude,
  lockAsset,
  lockIncident,
  normalizeFaultCode,
  validateMeasurement,
} from './support';

function completionPayload(dto: CompleteRepairDto): Prisma.InputJsonObject {
  const measurement = dto.verificationMeasurement;
  return {
    assetId: dto.assetId,
    rootCause: dto.rootCause,
    actionTaken: dto.actionTaken,
    verificationSummary: dto.verificationSummary,
    assetStatus: dto.assetStatus,
    source: dto.source,
    verificationMeasurement: measurement
      ? {
          measurementType: measurement.measurementType,
          value: measurement.value,
          unit: measurement.unit,
          notes: measurement.notes ?? null,
        }
      : null,
  };
}

function samePayload(left: unknown, right: unknown): boolean {
  // PostgreSQL JSONB changes key order, so raw JSON.stringify equality is unsafe.
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => samePayload(a[key], b[key]))
  );
}

@Injectable()
export class RepairsService {
  constructor(private readonly prisma: PrismaService) {}

  async complete(id: string, dto: CompleteRepairDto, access: AccessContext) {
    if (dto.verificationMeasurement)
      validateMeasurement(dto.verificationMeasurement);
    return this.prisma.$transaction(async (tx) => {
      const incident = await lockIncident(tx, id, access);
      if (incident.assetId !== dto.assetId)
        conflict(
          'ASSET_MISMATCH',
          'The incident belongs to a different asset.',
        );
      const payload = completionPayload(dto);
      if (!activeStatuses.some((status) => status === incident.status)) {
        if (!samePayload(incident.completionPayload, payload))
          conflict(
            'INCIDENT_FINISHED',
            'This incident already has a different completion record.',
          );
        return this.result(tx, id);
      }
      if (dto.verificationMeasurement) {
        await tx.measurement.create({
          data: {
            ...dto.verificationMeasurement,
            assetId: dto.assetId,
            incidentId: id,
            recordedById: access.user.id,
          },
        });
      }
      await tx.maintenanceRecord.create({
        data: {
          assetId: dto.assetId,
          incidentId: id,
          technicianId: access.user.id,
          faultCode: incident.faultCode,
          symptom: incident.description,
          rootCause: dto.rootCause,
          actionTaken: dto.actionTaken,
          verification: dto.verificationSummary,
          source: dto.source,
        },
      });
      await tx.incident.update({
        where: { id },
        data: {
          status: 'resolved',
          rootCause: dto.rootCause,
          actionTaken: dto.actionTaken,
          resolutionSummary: dto.verificationSummary,
          resolvedAt: new Date(),
          completionPayload: payload,
        },
      });
      await tx.escalation.updateMany({
        where: { incidentId: id, status: { in: ['pending', 'acknowledged'] } },
        data: { status: 'resolved' },
      });
      const remaining = await tx.incident.count({
        where: { assetId: dto.assetId, status: { in: [...activeStatuses] } },
      });
      if (!remaining || dto.assetStatus !== 'operational') {
        await tx.asset.update({
          where: { id: dto.assetId },
          data: { status: dto.assetStatus },
        });
      }
      return this.result(tx, id);
    });
  }

  private async result(tx: Prisma.TransactionClient, id: string) {
    const incident = await tx.incident.findUniqueOrThrow({
      where: { id },
      include: incidentInclude,
    });
    const asset = await tx.asset.findUniqueOrThrow({
      where: { id: incident.assetId },
      select: { id: true, assetTag: true, status: true },
    });
    return {
      incident,
      asset,
      maintenanceRecord: incident.maintenanceRecord,
      measurements: incident.measurements,
    };
  }

  async createRecord(dto: CreateMaintenanceRecordDto, access: AccessContext) {
    if (dto.incidentId) {
      const existing = await this.prisma.incident.findUnique({
        where: { id: dto.incidentId },
      });
      if (
        existing &&
        dto.faultCode &&
        normalizeFaultCode(dto.faultCode) !== existing.faultCode
      )
        conflict(
          'FAULT_MISMATCH',
          'Use the incident fault code when completing its repair.',
        );
      return (await this.complete(dto.incidentId, dto, access))
        .maintenanceRecord;
    }
    if (dto.verificationMeasurement)
      validateMeasurement(dto.verificationMeasurement);
    return this.prisma.$transaction(async (tx) => {
      await lockAsset(tx, dto.assetId, access);
      if (dto.verificationMeasurement) {
        await tx.measurement.create({
          data: {
            ...dto.verificationMeasurement,
            assetId: dto.assetId,
            recordedById: access.user.id,
          },
        });
      }
      // A standalone work log documents work but does not close incidents or clear asset status.
      return tx.maintenanceRecord.create({
        data: {
          assetId: dto.assetId,
          technicianId: access.user.id,
          faultCode: dto.faultCode ? normalizeFaultCode(dto.faultCode) : null,
          symptom: dto.symptom,
          rootCause: dto.rootCause,
          actionTaken: dto.actionTaken,
          verification: dto.verificationSummary,
          source: dto.source,
        },
        include: { technician: { select: { name: true } } },
      });
    });
  }
}
