import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { seedMaintenance } from './maintenance-seed';
import { pathToFileURL } from 'node:url';

export async function seedDemo(tx: Prisma.TransactionClient) {
  const site = await tx.site.upsert({
    where: { code: 'PLANT-A' },
    update: {},
    create: {
      name: 'Plant Alpha',
      code: 'PLANT-A',
      location: 'Simulated manufacturing plant',
    },
  });
  const assets = [
    {
      assetTag: 'M-204',
      name: 'Conveyor Drive Motor',
      equipmentType: '3-phase induction motor',
      manufacturer: 'Siemens',
      model: 'Demo-1LE1',
      location: 'Production Line 2',
      status: 'operational' as const,
      nominalVoltageV: 400,
      nominalCurrentA: 12.5,
      description:
        'Main conveyor drive motor. Equipment specifications and references are simulated demo data.',
    },
    {
      assetTag: 'P-101',
      name: 'Cooling Water Pump',
      equipmentType: 'Centrifugal pump',
      manufacturer: 'Demo',
      model: 'CP-101',
      location: 'Utility Bay',
      status: 'operational' as const,
    },
    {
      assetTag: 'C-402',
      name: 'Packaging Conveyor',
      equipmentType: 'Conveyor system',
      manufacturer: 'Demo',
      model: 'PC-402',
      location: 'Packaging Line',
      status: 'warning' as const,
    },
    {
      assetTag: 'HVAC-02',
      name: 'Control Room HVAC Unit',
      equipmentType: 'HVAC',
      manufacturer: 'Demo',
      model: 'AC-02',
      location: 'Control Room',
      status: 'operational' as const,
    },
    {
      assetTag: 'GEN-01',
      name: 'Backup Generator',
      equipmentType: 'Diesel generator',
      manufacturer: 'Demo',
      model: 'DG-01',
      location: 'Power House',
      status: 'maintenance' as const,
    },
  ];
  for (const data of assets) {
    const asset = await tx.asset.upsert({
      where: { assetTag: data.assetTag },
      update: {},
      create: { ...data, siteId: site.id },
    });
    if (data.assetTag === 'M-204') {
      await tx.component.upsert({
        where: { id: '20400000-0000-4000-8000-000000000001' },
        update: {},
        create: {
          id: '20400000-0000-4000-8000-000000000001',
          assetId: asset.id,
          componentType: 'Variable frequency drive',
          manufacturer: 'Siemens',
          model: 'SINAMICS G120 (demo reference)',
          identifier: 'M-204-VFD',
        },
      });
    }
  }
  await seedMaintenance(tx);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await prisma.$transaction(seedDemo);
    console.log(
      'Seed complete: five assets, approved demo knowledge, and two historical repairs. Existing records were preserved.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
