import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessContext } from '../access/access.types';
import type {
  AssetListQueryDto,
  CreateAssetDto,
  CreateSiteDto,
  SiteListQueryDto,
  UpdateAssetDto,
  UpdateSiteDto,
} from './admin.dto';

function requestMetadata(request: Request) {
  return {
    requestId: request.header('x-request-id'),
    ipAddress: request.ip?.slice(0, 64),
    userAgent: request.header('user-agent')?.slice(0, 500),
  };
}

@Injectable()
export class AdminSitesAssetsService {
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

  // --- SITES ---

  async listSites(access: AccessContext, query?: SiteListQueryDto) {
    const where: Prisma.SiteWhereInput = {
      organizationId: access.organization.id,
    };

    if (!query?.includeArchived) {
      where.archivedAt = null;
    }

    if (query?.q) {
      const search = query.q.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sites = await this.prisma.site.findMany({
      where,
      include: {
        _count: {
          select: {
            assets: { where: { archivedAt: null } },
            membershipAccess: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      code: site.code,
      location: site.location,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      archivedAt: site.archivedAt,
      activeAssetCount: site._count.assets,
      assignedUserCount: site._count.membershipAccess,
    }));
  }

  async getSite(access: AccessContext, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId: access.organization.id,
      },
      include: {
        assets: {
          where: { archivedAt: null },
          select: {
            id: true,
            assetTag: true,
            name: true,
            status: true,
            equipmentType: true,
          },
          take: 20,
        },
        _count: {
          select: {
            assets: { where: { archivedAt: null } },
            membershipAccess: true,
          },
        },
      },
    });

    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'The requested site was not found in this organization.',
      });
    }

    return {
      id: site.id,
      name: site.name,
      code: site.code,
      location: site.location,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      archivedAt: site.archivedAt,
      activeAssetCount: site._count.assets,
      assignedUserCount: site._count.membershipAccess,
      assets: site.assets,
    };
  }

  async createSite(
    access: AccessContext,
    dto: CreateSiteDto,
    request: Request,
  ) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.site.findUnique({
      where: { code },
    });

    if (existing) {
      throw new ConflictException({
        code: 'SITE_CODE_EXISTS',
        message: `Site code '${code}' is already registered.`,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const site = await tx.site.create({
        data: {
          organizationId: access.organization.id,
          name: dto.name.trim(),
          code,
          location: dto.location.trim(),
        },
      });

      await this.audit(
        tx,
        access,
        'admin.site.create',
        'site',
        site.id,
        request,
        { name: site.name, code: site.code, location: site.location },
      );

      return site;
    });

    return created;
  }

  async updateSite(
    access: AccessContext,
    siteId: string,
    dto: UpdateSiteDto,
    request: Request,
  ) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId: access.organization.id,
      },
    });

    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'The requested site was not found in this organization.',
      });
    }

    let code: string | undefined;
    if (dto.code) {
      code = dto.code.trim().toUpperCase();
      if (code !== site.code) {
        const existing = await this.prisma.site.findUnique({ where: { code } });
        if (existing) {
          throw new ConflictException({
            code: 'SITE_CODE_EXISTS',
            message: `Site code '${code}' is already registered.`,
          });
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.site.update({
        where: { id: siteId },
        data: {
          name: dto.name?.trim(),
          code,
          location: dto.location?.trim(),
        },
      });

      await this.audit(
        tx,
        access,
        'admin.site.update',
        'site',
        saved.id,
        request,
        {
          previous: { name: site.name, code: site.code, location: site.location },
          updated: { name: saved.name, code: saved.code, location: saved.location },
        },
      );

      return saved;
    });

    return updated;
  }

  async archiveSite(
    access: AccessContext,
    siteId: string,
    request: Request,
  ) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'The requested site was not found or is already archived.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.site.update({
        where: { id: siteId },
        data: { archivedAt: new Date() },
      });

      await this.audit(
        tx,
        access,
        'admin.site.archive',
        'site',
        siteId,
        request,
        { name: site.name, code: site.code },
      );
    });

    return { archived: true };
  }

  // --- ASSETS ---

  async listAssets(access: AccessContext, query: AssetListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AssetWhereInput = {
      organizationId: access.organization.id,
    };

    if (!query.includeArchived) {
      where.archivedAt = null;
    }

    if (query.siteId) {
      where.siteId = query.siteId;
    }

    if (query.status) {
      where.status = query.status as Prisma.EnumAssetStatusFilter;
    }

    if (query.equipmentType) {
      where.equipmentType = {
        contains: query.equipmentType.trim(),
        mode: 'insensitive',
      };
    }

    if (query.q) {
      const search = query.q.trim();
      where.OR = [
        { assetTag: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, assets] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        include: {
          site: {
            select: { id: true, name: true, code: true },
          },
          components: {
            where: { archivedAt: null },
            select: {
              id: true,
              componentType: true,
              manufacturer: true,
              model: true,
              identifier: true,
            },
          },
          _count: {
            select: {
              incidents: true,
            },
          },
        },
        orderBy: [{ status: 'desc' }, { assetTag: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      assets: assets.map((asset) => ({
        id: asset.id,
        assetTag: asset.assetTag,
        name: asset.name,
        description: asset.description,
        equipmentType: asset.equipmentType,
        manufacturer: asset.manufacturer,
        model: asset.model,
        serialNumber: asset.serialNumber,
        location: asset.location,
        status: asset.status,
        nominalVoltageV: asset.nominalVoltageV ? Number(asset.nominalVoltageV) : null,
        nominalCurrentA: asset.nominalCurrentA ? Number(asset.nominalCurrentA) : null,
        commissionedAt: asset.commissionedAt,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        archivedAt: asset.archivedAt,
        retiredAt: asset.retiredAt,
        site: asset.site,
        components: asset.components,
        incidentCount: asset._count.incidents,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAsset(access: AccessContext, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: access.organization.id,
      },
      include: {
        site: {
          select: { id: true, name: true, code: true, location: true },
        },
        components: {
          where: { archivedAt: null },
        },
        _count: {
          select: {
            incidents: true,
            maintenanceRecords: true,
            measurements: true,
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'The requested asset was not found in this organization.',
      });
    }

    return {
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      description: asset.description,
      equipmentType: asset.equipmentType,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      location: asset.location,
      status: asset.status,
      nominalVoltageV: asset.nominalVoltageV ? Number(asset.nominalVoltageV) : null,
      nominalCurrentA: asset.nominalCurrentA ? Number(asset.nominalCurrentA) : null,
      commissionedAt: asset.commissionedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      archivedAt: asset.archivedAt,
      retiredAt: asset.retiredAt,
      site: asset.site,
      components: asset.components,
      incidentCount: asset._count.incidents,
      maintenanceRecordCount: asset._count.maintenanceRecords,
      measurementCount: asset._count.measurements,
    };
  }

  async createAsset(
    access: AccessContext,
    dto: CreateAssetDto,
    request: Request,
  ) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: dto.siteId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!site) {
      throw new BadRequestException({
        code: 'INVALID_SITE',
        message: 'The specified site does not exist or has been archived.',
      });
    }

    const tag = dto.assetTag.trim().toUpperCase();
    const existing = await this.prisma.asset.findUnique({
      where: { assetTag: tag },
    });

    if (existing) {
      throw new ConflictException({
        code: 'ASSET_TAG_EXISTS',
        message: `Asset tag '${tag}' is already registered.`,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          organizationId: access.organization.id,
          siteId: dto.siteId,
          assetTag: tag,
          name: dto.name.trim(),
          equipmentType: dto.equipmentType.trim(),
          manufacturer: dto.manufacturer.trim(),
          model: dto.model.trim(),
          location: dto.location.trim(),
          serialNumber: dto.serialNumber?.trim() || null,
          description: dto.description?.trim() || null,
          status: dto.status || 'operational',
          nominalVoltageV: dto.nominalVoltageV ? new Prisma.Decimal(dto.nominalVoltageV) : null,
          nominalCurrentA: dto.nominalCurrentA ? new Prisma.Decimal(dto.nominalCurrentA) : null,
          commissionedAt: dto.commissionedAt ? new Date(dto.commissionedAt) : null,
        },
      });

      if (dto.components && dto.components.length > 0) {
        await tx.component.createMany({
          data: dto.components.map((c) => ({
            assetId: asset.id,
            componentType: c.componentType.trim(),
            manufacturer: c.manufacturer.trim(),
            model: c.model.trim(),
            identifier: c.identifier?.trim() || null,
          })),
        });
      }

      await this.audit(
        tx,
        access,
        'admin.asset.create',
        'asset',
        asset.id,
        request,
        {
          assetTag: asset.assetTag,
          name: asset.name,
          siteId: asset.siteId,
          equipmentType: asset.equipmentType,
          componentsCount: dto.components?.length || 0,
        },
      );

      return tx.asset.findUniqueOrThrow({
        where: { id: asset.id },
        include: {
          site: { select: { id: true, name: true, code: true } },
          components: { where: { archivedAt: null } },
        },
      });
    });

    return {
      ...created,
      nominalVoltageV: created.nominalVoltageV ? Number(created.nominalVoltageV) : null,
      nominalCurrentA: created.nominalCurrentA ? Number(created.nominalCurrentA) : null,
    };
  }

  async updateAsset(
    access: AccessContext,
    assetId: string,
    dto: UpdateAssetDto,
    request: Request,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: access.organization.id,
      },
      include: { components: true },
    });

    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'The requested asset was not found in this organization.',
      });
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: {
          id: dto.siteId,
          organizationId: access.organization.id,
          archivedAt: null,
        },
      });
      if (!site) {
        throw new BadRequestException({
          code: 'INVALID_SITE',
          message: 'The specified site does not exist or has been archived.',
        });
      }
    }

    let tag: string | undefined;
    if (dto.assetTag) {
      tag = dto.assetTag.trim().toUpperCase();
      if (tag !== asset.assetTag) {
        const existing = await this.prisma.asset.findUnique({
          where: { assetTag: tag },
        });
        if (existing) {
          throw new ConflictException({
            code: 'ASSET_TAG_EXISTS',
            message: `Asset tag '${tag}' is already registered.`,
          });
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.asset.update({
        where: { id: assetId },
        data: {
          assetTag: tag,
          name: dto.name?.trim(),
          siteId: dto.siteId,
          equipmentType: dto.equipmentType?.trim(),
          manufacturer: dto.manufacturer?.trim(),
          model: dto.model?.trim(),
          location: dto.location?.trim(),
          serialNumber: dto.serialNumber !== undefined ? dto.serialNumber?.trim() || null : undefined,
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          status: dto.status,
          nominalVoltageV: dto.nominalVoltageV !== undefined ? (dto.nominalVoltageV ? new Prisma.Decimal(dto.nominalVoltageV) : null) : undefined,
          nominalCurrentA: dto.nominalCurrentA !== undefined ? (dto.nominalCurrentA ? new Prisma.Decimal(dto.nominalCurrentA) : null) : undefined,
          commissionedAt: dto.commissionedAt !== undefined ? (dto.commissionedAt ? new Date(dto.commissionedAt) : null) : undefined,
        },
      });

      // Reconcile components if provided
      if (dto.components !== undefined) {
        await tx.component.deleteMany({
          where: { assetId },
        });
        if (dto.components.length > 0) {
          await tx.component.createMany({
            data: dto.components.map((c) => ({
              assetId,
              componentType: c.componentType.trim(),
              manufacturer: c.manufacturer.trim(),
              model: c.model.trim(),
              identifier: c.identifier?.trim() || null,
            })),
          });
        }
      }

      await this.audit(
        tx,
        access,
        'admin.asset.update',
        'asset',
        saved.id,
        request,
        {
          previous: { assetTag: asset.assetTag, name: asset.name, status: asset.status },
          updated: { assetTag: saved.assetTag, name: saved.name, status: saved.status },
        },
      );

      return tx.asset.findUniqueOrThrow({
        where: { id: assetId },
        include: {
          site: { select: { id: true, name: true, code: true } },
          components: { where: { archivedAt: null } },
        },
      });
    });

    return {
      ...updated,
      nominalVoltageV: updated.nominalVoltageV ? Number(updated.nominalVoltageV) : null,
      nominalCurrentA: updated.nominalCurrentA ? Number(updated.nominalCurrentA) : null,
    };
  }

  async archiveAsset(
    access: AccessContext,
    assetId: string,
    request: Request,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'The requested asset was not found or is already archived.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: assetId },
        data: {
          archivedAt: new Date(),
          status: 'maintenance',
        },
      });

      await tx.component.updateMany({
        where: { assetId },
        data: { archivedAt: new Date() },
      });

      await this.audit(
        tx,
        access,
        'admin.asset.archive',
        'asset',
        assetId,
        request,
        { assetTag: asset.assetTag, name: asset.name },
      );
    });

    return { archived: true };
  }
}
