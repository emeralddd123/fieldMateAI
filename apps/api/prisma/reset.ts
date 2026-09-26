import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedDemo } from './seed';

async function reset() {
  if (!['development', 'test'].includes(process.env.APP_ENV ?? '') || !process.argv.includes('--confirm')) {
    throw new Error('Reset is restricted to APP_ENV=development or test and requires --confirm. It deletes all work on the five demo assets.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.$transaction(async (tx) => {
      const assets = await tx.asset.findMany({ where: { site: { code: 'PLANT-A' }, assetTag: { in: ['M-204', 'P-101', 'C-402', 'HVAC-02', 'GEN-01'] } }, select: { id: true } });
      const assetId = { in: assets.map((asset) => asset.id) };
      await tx.maintenanceRecord.deleteMany({ where: { assetId } });
      await tx.measurement.deleteMany({ where: { assetId } });
      await tx.incident.deleteMany({ where: { assetId } });
      await tx.asset.deleteMany({ where: { id: assetId } });
      await seedDemo(tx);
      // Preserve any higher incident numbers outside the demo assets.
      await tx.$queryRaw`SELECT setval('incident_number_seq', GREATEST(1048, COALESCE((SELECT MAX(SUBSTRING(incident_number FROM 5)::bigint) + 1 FROM incidents WHERE incident_number ~ '^INC-[0-9]+$'), 1048)), false)`;
    });
    console.log('Canonical demo restored. Other assets and sites were preserved.');
  } finally { await prisma.$disconnect(); }
}
reset().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

