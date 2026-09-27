import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { conflict, normalizeFaultCode, requireAsset } from './support';
import type { ProcedureQuery } from './dto';
import type { AccessContext } from '../access/access.types';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(assetId: string, code: string, access: AccessContext) {
    const asset = await requireAsset(this.prisma, assetId, access);
    const faultCode = normalizeFaultCode(code);
    const matches = await this.prisma.faultDefinition.findMany({
      where: {
        faultCode,
        organizationId: access.organization.id,
        archivedAt: null,
        OR: [...asset.components, asset].map(({ manufacturer, model }) => ({
          manufacturer,
          model,
        })),
      },
      include: {
        procedure: {
          select: { key: true, approved: true, archivedAt: true },
        },
      },
    });
    if (matches.length > 1)
      conflict(
        'AMBIGUOUS_FAULT',
        'Multiple installed models match this fault; clarify the component.',
      );
    const match = matches[0];
    if (!match)
      return {
        found: false,
        assetId,
        faultCode,
        message:
          'No verified definition exists for this fault on the installed equipment. Document and escalate the issue.',
      };
    const validProcedure =
      match.procedure?.approved && !match.procedure?.archivedAt;
    return {
      found: true,
      assetId,
      faultCode,
      title: match.title,
      description: match.description,
      manufacturer: match.manufacturer,
      model: match.model,
      source: match.source,
      safetyLevel: match.safetyLevel,
      procedureKey: validProcedure ? match.procedure!.key : null,
    };
  }

  async procedure(key: string, query: ProcedureQuery, access: AccessContext) {
    const asset = await requireAsset(this.prisma, query.assetId, access);
    const procedure = await this.prisma.procedure.findFirst({
      where: {
        key,
        organizationId: access.organization.id,
        archivedAt: null,
      },
    });
    const equipment = [...asset.components, asset];
    if (
      !procedure ||
      !procedure.approved ||
      (procedure.assetType && procedure.assetType !== asset.equipmentType) ||
      !equipment.some(
        (item) =>
          (!procedure.manufacturer ||
            item.manufacturer === procedure.manufacturer) &&
          (!procedure.model || item.model === procedure.model),
      )
    ) {
      return {
        found: false,
        message:
          'No approved procedure is available for this asset. Document and escalate the issue.',
      };
    }
    const requiresSafetyConfirmation =
      procedure.safetyConfirmationRequired && !query.safeStateConfirmed;
    return {
      found: true,
      assetId: asset.id,
      assetTag: asset.assetTag,
      requiresSafetyConfirmation,
      procedure: {
        key: procedure.key,
        title: procedure.title,
        source: procedure.source,
        summary: procedure.summary,
        safetyLevel: procedure.safetyLevel,
        safetyConfirmationRequired: procedure.safetyConfirmationRequired,
        steps: requiresSafetyConfirmation ? [] : procedure.steps,
      },
      message: requiresSafetyConfirmation
        ? 'Confirm the equipment is stopped and in the required safe maintenance state before requesting the approved steps.'
        : 'Follow site procedures and qualified-person requirements.',
    };
  }
}
