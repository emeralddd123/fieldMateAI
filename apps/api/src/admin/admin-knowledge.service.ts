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
  CreateFaultDefinitionDto,
  CreateProcedureDto,
  FaultListQueryDto,
  ProcedureListQueryDto,
  UpdateFaultDefinitionDto,
  UpdateProcedureDto,
} from './admin.dto';

function requestMetadata(request: Request) {
  return {
    requestId: request.header('x-request-id'),
    ipAddress: request.ip?.slice(0, 64),
    userAgent: request.header('user-agent')?.slice(0, 500),
  };
}

export interface StructuredStep {
  order: number;
  text: string;
  type: string;
  confirmationRequired?: boolean;
}

function normalizeSteps(
  steps: (
    | string
    | {
        text: string;
        order?: number;
        type?: string;
        confirmationRequired?: boolean;
      }
  )[],
): StructuredStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new BadRequestException({
      code: 'INVALID_STEPS',
      message: 'Procedures must contain at least one step.',
    });
  }

  return steps.map((step, index) => {
    if (typeof step === 'string') {
      const text = step.trim();
      if (!text) {
        throw new BadRequestException({
          code: 'INVALID_STEPS',
          message: `Step ${index + 1} cannot be empty.`,
        });
      }
      return {
        order: index + 1,
        text,
        type: 'action',
      };
    }

    if (!step || typeof step.text !== 'string' || !step.text.trim()) {
      throw new BadRequestException({
        code: 'INVALID_STEPS',
        message: `Step ${index + 1} must contain valid non-empty instruction text.`,
      });
    }

    return {
      order: step.order ?? index + 1,
      text: step.text.trim(),
      type: step.type || 'action',
      confirmationRequired: Boolean(step.confirmationRequired),
    };
  });
}

@Injectable()
export class AdminKnowledgeService {
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

  // =========================================================================
  // FAULT DEFINITIONS
  // =========================================================================

  async listFaults(access: AccessContext, query: FaultListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.FaultDefinitionWhereInput = {
      organizationId: access.organization.id,
    };

    if (!query.includeArchived) {
      where.archivedAt = null;
    }

    if (query.manufacturer) {
      where.manufacturer = {
        contains: query.manufacturer.trim(),
        mode: 'insensitive',
      };
    }

    if (query.model) {
      where.model = {
        contains: query.model.trim(),
        mode: 'insensitive',
      };
    }

    if (query.q) {
      const search = query.q.trim();
      const searchNorm = search.toUpperCase().replace(/[^A-Z0-9]/g, '');
      where.OR = [
        { faultCode: { contains: search, mode: 'insensitive' } },
        { normalizedFaultCode: { contains: searchNorm } },
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, faults] = await Promise.all([
      this.prisma.faultDefinition.count({ where }),
      this.prisma.faultDefinition.findMany({
        where,
        include: {
          procedure: {
            select: {
              id: true,
              key: true,
              title: true,
              approved: true,
              status: true,
              archivedAt: true,
            },
          },
        },
        orderBy: [{ faultCode: 'asc' }, { manufacturer: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      faults: faults.map((f) => ({
        id: f.id,
        manufacturer: f.manufacturer,
        model: f.model,
        faultCode: f.faultCode,
        normalizedFaultCode: f.normalizedFaultCode,
        title: f.title,
        description: f.description,
        safetyLevel: f.safetyLevel,
        source: f.source,
        procedureId: f.procedureId,
        procedure: f.procedure,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        archivedAt: f.archivedAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFault(access: AccessContext, faultId: string) {
    const fault = await this.prisma.faultDefinition.findFirst({
      where: {
        id: faultId,
        organizationId: access.organization.id,
      },
      include: {
        procedure: {
          select: {
            id: true,
            key: true,
            title: true,
            summary: true,
            approved: true,
            status: true,
            safetyLevel: true,
            safetyConfirmationRequired: true,
            archivedAt: true,
          },
        },
      },
    });

    if (!fault) {
      throw new NotFoundException({
        code: 'FAULT_NOT_FOUND',
        message:
          'The requested fault definition was not found in this organization.',
      });
    }

    return fault;
  }

  async createFault(
    access: AccessContext,
    dto: CreateFaultDefinitionDto,
    request: Request,
  ) {
    const faultCode = dto.faultCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const manufacturer = dto.manufacturer.trim();
    const model = dto.model.trim();

    // Check unique constraint [manufacturer, model, faultCode]
    const existing = await this.prisma.faultDefinition.findUnique({
      where: {
        manufacturer_model_faultCode: {
          manufacturer,
          model,
          faultCode,
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'FAULT_CODE_EXISTS',
        message: `Fault code '${faultCode}' is already registered for ${manufacturer} ${model}.`,
      });
    }

    // Validate procedure link compatibility if provided
    if (dto.procedureId) {
      const procedure = await this.prisma.procedure.findFirst({
        where: {
          id: dto.procedureId,
          organizationId: access.organization.id,
          archivedAt: null,
        },
      });

      if (!procedure) {
        throw new BadRequestException({
          code: 'INVALID_PROCEDURE',
          message:
            'The specified procedure does not exist or has been archived.',
        });
      }

      if (
        (procedure.manufacturer && procedure.manufacturer !== manufacturer) ||
        (procedure.model && procedure.model !== model)
      ) {
        throw new BadRequestException({
          code: 'INCOMPATIBLE_PROCEDURE',
          message: `Procedure '${procedure.title}' is designated for ${procedure.manufacturer ?? 'any'} ${procedure.model ?? ''} and is not compatible with ${manufacturer} ${model}.`,
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const fault = await tx.faultDefinition.create({
        data: {
          organizationId: access.organization.id,
          manufacturer,
          model,
          faultCode,
          normalizedFaultCode: faultCode,
          title: dto.title.trim(),
          description: dto.description.trim(),
          safetyLevel: dto.safetyLevel?.trim() || 'standard',
          source: dto.source?.trim() || 'internal',
          procedureId: dto.procedureId || null,
        },
        include: {
          procedure: {
            select: {
              id: true,
              key: true,
              title: true,
              approved: true,
              status: true,
            },
          },
        },
      });

      await this.audit(
        tx,
        access,
        'admin.fault.create',
        'fault_definition',
        fault.id,
        request,
        {
          faultCode: fault.faultCode,
          manufacturer: fault.manufacturer,
          model: fault.model,
          title: fault.title,
          procedureId: fault.procedureId,
        },
      );

      return fault;
    });

    return created;
  }

  async updateFault(
    access: AccessContext,
    faultId: string,
    dto: UpdateFaultDefinitionDto,
    request: Request,
  ) {
    const fault = await this.prisma.faultDefinition.findFirst({
      where: {
        id: faultId,
        organizationId: access.organization.id,
      },
    });

    if (!fault) {
      throw new NotFoundException({
        code: 'FAULT_NOT_FOUND',
        message:
          'The requested fault definition was not found in this organization.',
      });
    }

    const nextManufacturer =
      dto.manufacturer !== undefined
        ? dto.manufacturer.trim()
        : fault.manufacturer;
    const nextModel = dto.model !== undefined ? dto.model.trim() : fault.model;
    const nextFaultCode =
      dto.faultCode !== undefined
        ? dto.faultCode
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
        : fault.faultCode;

    // Check conflict if any component of the unique key changed
    if (
      nextManufacturer !== fault.manufacturer ||
      nextModel !== fault.model ||
      nextFaultCode !== fault.faultCode
    ) {
      const conflict = await this.prisma.faultDefinition.findUnique({
        where: {
          manufacturer_model_faultCode: {
            manufacturer: nextManufacturer,
            model: nextModel,
            faultCode: nextFaultCode,
          },
        },
      });

      if (conflict && conflict.id !== fault.id) {
        throw new ConflictException({
          code: 'FAULT_CODE_EXISTS',
          message: `Fault code '${nextFaultCode}' is already registered for ${nextManufacturer} ${nextModel}.`,
        });
      }
    }

    // Validate procedure link compatibility if provided
    let nextProcedureId: string | null | undefined = undefined;
    if (dto.procedureId !== undefined) {
      if (dto.procedureId === null || dto.procedureId === '') {
        nextProcedureId = null;
      } else {
        const procedure = await this.prisma.procedure.findFirst({
          where: {
            id: dto.procedureId,
            organizationId: access.organization.id,
            archivedAt: null,
          },
        });

        if (!procedure) {
          throw new BadRequestException({
            code: 'INVALID_PROCEDURE',
            message:
              'The specified procedure does not exist or has been archived.',
          });
        }

        if (
          (procedure.manufacturer &&
            procedure.manufacturer !== nextManufacturer) ||
          (procedure.model && procedure.model !== nextModel)
        ) {
          throw new BadRequestException({
            code: 'INCOMPATIBLE_PROCEDURE',
            message: `Procedure '${procedure.title}' is designated for ${procedure.manufacturer ?? 'any'} ${procedure.model ?? ''} and is not compatible with ${nextManufacturer} ${nextModel}.`,
          });
        }

        nextProcedureId = procedure.id;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.faultDefinition.update({
        where: { id: faultId },
        data: {
          manufacturer:
            dto.manufacturer !== undefined ? nextManufacturer : undefined,
          model: dto.model !== undefined ? nextModel : undefined,
          faultCode: dto.faultCode !== undefined ? nextFaultCode : undefined,
          normalizedFaultCode:
            dto.faultCode !== undefined ? nextFaultCode : undefined,
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          description:
            dto.description !== undefined ? dto.description.trim() : undefined,
          safetyLevel:
            dto.safetyLevel !== undefined ? dto.safetyLevel.trim() : undefined,
          source: dto.source !== undefined ? dto.source.trim() : undefined,
          procedureId:
            nextProcedureId !== undefined ? nextProcedureId : undefined,
        },
        include: {
          procedure: {
            select: {
              id: true,
              key: true,
              title: true,
              approved: true,
              status: true,
            },
          },
        },
      });

      await this.audit(
        tx,
        access,
        'admin.fault.update',
        'fault_definition',
        saved.id,
        request,
        {
          previous: {
            faultCode: fault.faultCode,
            title: fault.title,
            procedureId: fault.procedureId,
          },
          updated: {
            faultCode: saved.faultCode,
            title: saved.title,
            procedureId: saved.procedureId,
          },
        },
      );

      return saved;
    });

    return updated;
  }

  async archiveFault(access: AccessContext, faultId: string, request: Request) {
    const fault = await this.prisma.faultDefinition.findFirst({
      where: {
        id: faultId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!fault) {
      throw new NotFoundException({
        code: 'FAULT_NOT_FOUND',
        message:
          'The requested fault definition was not found or is already archived.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.faultDefinition.update({
        where: { id: faultId },
        data: { archivedAt: new Date() },
      });

      await this.audit(
        tx,
        access,
        'admin.fault.archive',
        'fault_definition',
        faultId,
        request,
        {
          faultCode: fault.faultCode,
          manufacturer: fault.manufacturer,
          model: fault.model,
          title: fault.title,
        },
      );
    });

    return { archived: true };
  }

  // =========================================================================
  // PROCEDURES
  // =========================================================================

  async listProcedures(access: AccessContext, query: ProcedureListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProcedureWhereInput = {
      organizationId: access.organization.id,
    };

    if (!query.includeArchived) {
      where.archivedAt = null;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.assetType) {
      where.assetType = {
        contains: query.assetType.trim(),
        mode: 'insensitive',
      };
    }

    if (query.manufacturer) {
      where.manufacturer = {
        contains: query.manufacturer.trim(),
        mode: 'insensitive',
      };
    }

    if (query.model) {
      where.model = {
        contains: query.model.trim(),
        mode: 'insensitive',
      };
    }

    if (query.q) {
      const search = query.q.trim();
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { assetType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, procedures] = await Promise.all([
      this.prisma.procedure.count({ where }),
      this.prisma.procedure.findMany({
        where,
        include: {
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              faults: { where: { archivedAt: null } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      procedures: procedures.map((p) => ({
        id: p.id,
        key: p.key,
        title: p.title,
        assetType: p.assetType,
        manufacturer: p.manufacturer,
        model: p.model,
        safetyLevel: p.safetyLevel,
        safetyConfirmationRequired: p.safetyConfirmationRequired,
        summary: p.summary,
        steps: p.steps,
        approved: p.approved,
        status: p.status,
        approvedById: p.approvedById,
        approvedBy: p.approvedBy,
        approvedAt: p.approvedAt,
        source: p.source,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        archivedAt: p.archivedAt,
        linkedFaultCount: p._count.faults,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProcedure(access: AccessContext, procedureId: string) {
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        id: procedureId,
        organizationId: access.organization.id,
      },
      include: {
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        faults: {
          where: { archivedAt: null },
          select: {
            id: true,
            faultCode: true,
            title: true,
            manufacturer: true,
            model: true,
          },
        },
      },
    });

    if (!procedure) {
      throw new NotFoundException({
        code: 'PROCEDURE_NOT_FOUND',
        message: 'The requested procedure was not found in this organization.',
      });
    }

    return procedure;
  }

  async createProcedure(
    access: AccessContext,
    dto: CreateProcedureDto,
    request: Request,
  ) {
    const key = dto.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existing = await this.prisma.procedure.findUnique({
      where: { key },
    });

    if (existing) {
      throw new ConflictException({
        code: 'PROCEDURE_KEY_EXISTS',
        message: `Procedure key '${key}' is already in use.`,
      });
    }

    const steps = normalizeSteps(dto.steps);

    const created = await this.prisma.$transaction(async (tx) => {
      const proc = await tx.procedure.create({
        data: {
          organizationId: access.organization.id,
          key,
          title: dto.title.trim(),
          assetType: dto.assetType?.trim() || null,
          manufacturer: dto.manufacturer?.trim() || null,
          model: dto.model?.trim() || null,
          safetyLevel: dto.safetyLevel?.trim() || 'standard',
          safetyConfirmationRequired: dto.safetyConfirmationRequired ?? true,
          summary: dto.summary.trim(),
          steps: steps as unknown as Prisma.InputJsonValue,
          source: dto.source?.trim() || 'internal',
          approved: false,
          status: 'draft',
        },
      });

      await this.audit(
        tx,
        access,
        'admin.procedure.create',
        'procedure',
        proc.id,
        request,
        {
          key: proc.key,
          title: proc.title,
          stepsCount: steps.length,
          safetyConfirmationRequired: proc.safetyConfirmationRequired,
        },
      );

      return proc;
    });

    return created;
  }

  async updateProcedure(
    access: AccessContext,
    procedureId: string,
    dto: UpdateProcedureDto,
    request: Request,
  ) {
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        id: procedureId,
        organizationId: access.organization.id,
      },
    });

    if (!procedure) {
      throw new NotFoundException({
        code: 'PROCEDURE_NOT_FOUND',
        message: 'The requested procedure was not found in this organization.',
      });
    }

    let nextKey: string | undefined;
    if (dto.key) {
      nextKey = dto.key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      if (nextKey !== procedure.key) {
        const existing = await this.prisma.procedure.findUnique({
          where: { key: nextKey },
        });
        if (existing) {
          throw new ConflictException({
            code: 'PROCEDURE_KEY_EXISTS',
            message: `Procedure key '${nextKey}' is already in use.`,
          });
        }
      }
    }

    let nextSteps: StructuredStep[] | undefined;
    if (dto.steps !== undefined) {
      nextSteps = normalizeSteps(dto.steps);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.procedure.update({
        where: { id: procedureId },
        data: {
          key: nextKey,
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          assetType:
            dto.assetType !== undefined
              ? dto.assetType?.trim() || null
              : undefined,
          manufacturer:
            dto.manufacturer !== undefined
              ? dto.manufacturer?.trim() || null
              : undefined,
          model:
            dto.model !== undefined ? dto.model?.trim() || null : undefined,
          safetyLevel:
            dto.safetyLevel !== undefined ? dto.safetyLevel.trim() : undefined,
          safetyConfirmationRequired:
            dto.safetyConfirmationRequired !== undefined
              ? dto.safetyConfirmationRequired
              : undefined,
          summary: dto.summary !== undefined ? dto.summary.trim() : undefined,
          steps:
            nextSteps !== undefined
              ? (nextSteps as unknown as Prisma.InputJsonValue)
              : undefined,
          source: dto.source !== undefined ? dto.source.trim() : undefined,
        },
        include: {
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await this.audit(
        tx,
        access,
        'admin.procedure.update',
        'procedure',
        saved.id,
        request,
        {
          previous: {
            key: procedure.key,
            title: procedure.title,
            status: procedure.status,
          },
          updated: { key: saved.key, title: saved.title, status: saved.status },
        },
      );

      return saved;
    });

    return updated;
  }

  async approveProcedure(
    access: AccessContext,
    procedureId: string,
    request: Request,
  ) {
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        id: procedureId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!procedure) {
      throw new NotFoundException({
        code: 'PROCEDURE_NOT_FOUND',
        message: 'The requested procedure was not found or is archived.',
      });
    }

    const steps = procedure.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_PROCEDURE_STEPS',
        message:
          'Cannot approve a procedure without verified maintenance steps.',
      });
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.procedure.update({
        where: { id: procedureId },
        data: {
          approved: true,
          status: 'approved',
          approvedById: access.user.id,
          approvedAt: new Date(),
        },
        include: {
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await this.audit(
        tx,
        access,
        'admin.procedure.approve',
        'procedure',
        saved.id,
        request,
        {
          key: saved.key,
          title: saved.title,
          approvedById: access.user.id,
        },
      );

      return saved;
    });

    return approved;
  }

  async withdrawProcedure(
    access: AccessContext,
    procedureId: string,
    request: Request,
  ) {
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        id: procedureId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!procedure) {
      throw new NotFoundException({
        code: 'PROCEDURE_NOT_FOUND',
        message: 'The requested procedure was not found or is archived.',
      });
    }

    const withdrawn = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.procedure.update({
        where: { id: procedureId },
        data: {
          approved: false,
          status: 'withdrawn',
        },
        include: {
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await this.audit(
        tx,
        access,
        'admin.procedure.withdraw',
        'procedure',
        saved.id,
        request,
        {
          key: saved.key,
          title: saved.title,
        },
      );

      return saved;
    });

    return withdrawn;
  }

  async archiveProcedure(
    access: AccessContext,
    procedureId: string,
    request: Request,
  ) {
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        id: procedureId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });

    if (!procedure) {
      throw new NotFoundException({
        code: 'PROCEDURE_NOT_FOUND',
        message:
          'The requested procedure was not found or is already archived.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.procedure.update({
        where: { id: procedureId },
        data: {
          archivedAt: new Date(),
          approved: false,
          status: 'withdrawn',
        },
      });

      await this.audit(
        tx,
        access,
        'admin.procedure.archive',
        'procedure',
        procedureId,
        request,
        {
          key: procedure.key,
          title: procedure.title,
        },
      );
    });

    return { archived: true };
  }
}
