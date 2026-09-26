import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { MeasurementFields } from './dto';

export const DEMO_TECHNICIAN_ID = '00000000-0000-4000-8000-000000000001';
export const activeStatuses = ['open', 'investigating', 'escalated'] as const;
export const incidentInclude = {
  openedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  notes: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  },
  measurements: { orderBy: { recordedAt: 'desc' } },
  maintenanceRecord: { include: { technician: { select: { name: true } } } },
  escalations: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.IncidentInclude;

export function missing(code: string, message: string): never {
  throw new NotFoundException({ code, message });
}
export function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
export async function requireAsset(tx: Prisma.TransactionClient, id: string) {
  const asset = await tx.asset.findUnique({
    where: { id },
    include: { components: true },
  });
  if (!asset) missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
  return asset;
}
// All writes concerning one asset take this lock first, including completion and incident creation.
export async function lockAsset(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM assets WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
}
export async function lockIncident(tx: Prisma.TransactionClient, id: string) {
  const initial = await tx.incident.findUnique({
    where: { id },
    select: { assetId: true },
  });
  if (!initial) missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
  await lockAsset(tx, initial.assetId);
  const incident = await tx.incident.findUnique({
    where: { id },
    include: incidentInclude,
  });
  if (!incident) missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
  return incident;
}
export async function requireTechnician(tx: Prisma.TransactionClient) {
  if (!(await tx.user.findUnique({ where: { id: DEMO_TECHNICIAN_ID } }))) {
    throw new ServiceUnavailableException({
      code: 'DEMO_NOT_SEEDED',
      message: 'Demo technician has not been seeded.',
    });
  }
  return DEMO_TECHNICIAN_ID;
}
export function normalizeFaultCode(value: string) {
  // Preserve digits exactly: never turn F3 into F0003 or guess a different fault.
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
export function validateMeasurement(value: MeasurementFields) {
  const expected = { line_voltage: 'V', motor_current: 'A' }[
    value.measurementType
  ];
  if (expected && (value.unit !== expected || value.value < 0)) {
    throw new BadRequestException({
      code: 'INVALID_MEASUREMENT',
      message: `${value.measurementType} requires a nonnegative reading in ${expected}.`,
    });
  }
}

export async function lockCreationRequest(
  tx: Prisma.TransactionClient,
  kind: string,
  dto: { requestId?: string },
) {
  if (!dto.requestId) return undefined;
  // Serialize same-key retries across assets/processes before acquiring the asset lock.
  const key = `${kind}:${dto.requestId.toLowerCase()}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  const ordered = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(ordered)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key, item]) => key !== 'requestId' && item !== undefined,
              )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, ordered(item)]),
          )
        : value;
  return createHash('sha256')
    .update(JSON.stringify(ordered(dto)))
    .digest('hex');
}
export function verifyCreationRetry(
  storedHash: string | null,
  hash: string | undefined,
) {
  if (storedHash !== hash)
    conflict(
      'REQUEST_ID_REUSED',
      'This request ID was already used for different data. Review the original request.',
    );
}
