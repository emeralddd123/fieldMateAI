import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { MeasurementFields } from './dto';
import type { AccessContext } from '../access/access.types';

export const activeStatuses = ['open', 'investigating', 'escalated'] as const;

export const incidentInclude = {
  asset: {
    select: {
      id: true,
      assetTag: true,
      name: true,
      location: true,
      siteId: true,
      organizationId: true,
      archivedAt: true,
    },
  },
  openedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  notes: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  },
  measurements: { orderBy: { recordedAt: 'desc' } },
  maintenanceRecord: { include: { technician: { select: { name: true } } } },
  escalations: {
    orderBy: { createdAt: 'desc' },
    include: { acknowledgedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.IncidentInclude;

export function missing(code: string, message: string): never {
  throw new NotFoundException({ code, message });
}

export function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

export async function requireAsset(
  tx: Prisma.TransactionClient,
  id: string,
  access?: AccessContext,
) {
  const asset = await tx.asset.findUnique({
    where: { id },
    include: { components: true },
  });
  if (!asset || asset.archivedAt !== null) {
    missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
  }
  if (access) {
    if (
      asset.organizationId !== access.organization.id ||
      !access.hasSite(asset.siteId)
    ) {
      missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
    }
  }
  return asset;
}

// All writes concerning one asset take this lock first, including completion and incident creation.
export async function lockAsset(
  tx: Prisma.TransactionClient,
  id: string,
  access?: AccessContext,
) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      organization_id: string;
      site_id: string;
      archived_at: Date | null;
    }>
  >`SELECT id, organization_id, site_id, archived_at FROM assets WHERE id = ${id}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row || row.archived_at !== null) {
    missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
  }
  if (access) {
    if (
      row.organization_id !== access.organization.id ||
      !access.hasSite(row.site_id)
    ) {
      missing('ASSET_NOT_FOUND', 'No asset matched that ID.');
    }
  }
}

export async function lockIncident(
  tx: Prisma.TransactionClient,
  id: string,
  access?: AccessContext,
) {
  const initial = await tx.incident.findUnique({
    where: { id },
    select: {
      assetId: true,
      asset: {
        select: {
          id: true,
          organizationId: true,
          siteId: true,
          archivedAt: true,
        },
      },
    },
  });
  if (!initial || initial.asset.archivedAt !== null) {
    missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
  }
  if (access) {
    if (
      initial.asset.organizationId !== access.organization.id ||
      !access.hasSite(initial.asset.siteId)
    ) {
      missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
    }
  }
  await lockAsset(tx, initial.assetId, access);
  const incident = await tx.incident.findUnique({
    where: { id },
    include: incidentInclude,
  });
  if (!incident) missing('INCIDENT_NOT_FOUND', 'No incident matched that ID.');
  return incident;
}

export async function requireAssignableUser(
  tx: Prisma.TransactionClient,
  userId: string,
  siteId: string,
  organizationId: string,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { organizationId, status: 'active' },
        include: { siteAccess: true },
      },
    },
  });
  if (!user || user.status !== 'active' || user.memberships.length === 0) {
    missing('USER_NOT_FOUND', 'No eligible user matched the assignee.');
  }
  const membership = user.memberships[0];
  if (
    !membership ||
    !['technician', 'supervisor', 'admin'].includes(membership.role)
  ) {
    missing('USER_NOT_FOUND', 'No eligible user matched the assignee.');
  }
  if (membership.role !== 'admin') {
    const hasSite = membership.siteAccess.some((sa) => sa.siteId === siteId);
    if (!hasSite) {
      missing('USER_NOT_FOUND', 'Assignee does not have access to this site.');
    }
  }
  return user;
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
