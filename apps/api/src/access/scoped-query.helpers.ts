import { Prisma } from '../generated/prisma/client';
import type { AccessContext } from './access.types';

export function scopedAssetWhere(
  access: AccessContext,
  extra?: Prisma.AssetWhereInput,
): Prisma.AssetWhereInput {
  return {
    organizationId: access.organization.id,
    archivedAt: null,
    ...(access.allSites ? {} : { siteId: { in: access.siteIds } }),
    ...extra,
  };
}

export function scopedSiteWhere(
  access: AccessContext,
  extra?: Prisma.SiteWhereInput,
): Prisma.SiteWhereInput {
  return {
    organizationId: access.organization.id,
    archivedAt: null,
    ...(access.allSites ? {} : { id: { in: access.siteIds } }),
    ...extra,
  };
}

export function scopedIncidentWhere(
  access: AccessContext,
  extra?: Prisma.IncidentWhereInput,
): Prisma.IncidentWhereInput {
  return {
    asset: {
      organizationId: access.organization.id,
      archivedAt: null,
      ...(access.allSites ? {} : { siteId: { in: access.siteIds } }),
    },
    ...extra,
  };
}

export function scopedFaultWhere(
  access: AccessContext,
  extra?: Prisma.FaultDefinitionWhereInput,
): Prisma.FaultDefinitionWhereInput {
  return {
    organizationId: access.organization.id,
    archivedAt: null,
    ...extra,
  };
}

export function scopedProcedureWhere(
  access: AccessContext,
  extra?: Prisma.ProcedureWhereInput,
): Prisma.ProcedureWhereInput {
  return {
    organizationId: access.organization.id,
    archivedAt: null,
    approved: true,
    ...extra,
  };
}
