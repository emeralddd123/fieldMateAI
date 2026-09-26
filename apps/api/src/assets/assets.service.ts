import { Injectable, NotFoundException } from '@nestjs/common';
import type { Asset } from '@fieldmate/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const include = { site: true, components: true } satisfies Prisma.AssetInclude;
type StoredAsset = Prisma.AssetGetPayload<{ include: typeof include }>;

function serialize(asset: StoredAsset): Asset {
  return {
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    description: asset.description,
    equipmentType: asset.equipmentType,
    manufacturer: asset.manufacturer,
    model: asset.model,
    location: asset.location,
    status: asset.status,
    nominalVoltageV: asset.nominalVoltageV?.toNumber() ?? null,
    nominalCurrentA: asset.nominalCurrentA?.toNumber() ?? null,
    site: { name: asset.site.name, code: asset.site.code },
    components: asset.components.map(
      ({ id, componentType, manufacturer, model }) => ({
        id,
        componentType,
        manufacturer,
        model,
      }),
    ),
  };
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Asset[]> {
    return (
      await this.prisma.asset.findMany({
        include,
        orderBy: { assetTag: 'asc' },
      })
    ).map(serialize);
  }

  async get(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include,
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'No asset matched that ID.',
      });
    return serialize(asset);
  }

  async search(query: string): Promise<Asset[]> {
    const normalized = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const assets = await this.list();
    const exact = assets.filter(
      (asset) => asset.assetTag.replace(/[^A-Z0-9]/g, '') === normalized,
    );
    if (exact.length) return exact;
    const text = query.toLowerCase();
    return assets.filter((asset) =>
      [asset.assetTag, asset.name, asset.model, asset.location].some((field) =>
        field.toLowerCase().includes(text),
      ),
    );
  }
}
