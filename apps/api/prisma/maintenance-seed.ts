import type { Prisma } from '../src/generated/prisma/client';

export async function seedMaintenance(tx: Prisma.TransactionClient) {
  const motor = await tx.asset.findUniqueOrThrow({ where: { assetTag: 'M-204' } });
  const users = [
    { id: '00000000-0000-4000-8000-000000000001', name: 'Demo Technician' },
    { id: '00000000-0000-4000-8000-000000000002', name: 'Ibrahim Musa' },
    { id: '00000000-0000-4000-8000-000000000003', name: 'Grace Okafor' },
  ];
  for (const user of users) await tx.user.upsert({ where: { id: user.id }, update: {}, create: user });
  const procedure = await tx.procedure.upsert({
    where: { key: 'vfd-undervoltage-check' }, update: {},
    create: {
      key: 'vfd-undervoltage-check', title: 'VFD Undervoltage Diagnostic Check',
      manufacturer: 'Siemens', model: 'SINAMICS G120 (demo reference)',
      safetyLevel: 'electrical', safetyConfirmationRequired: true, approved: true,
      summary: 'Approved high-level demo checks for a recurring undervoltage condition.',
      source: 'Demo SINAMICS G120 maintenance reference — simulated, not manufacturer documentation',
      steps: [
        'Confirm equipment is stopped and in the required safe maintenance state.',
        'Follow the site-approved measurement process with qualified personnel and approved test equipment.',
        'Compare the reported reading with the configured asset nominal value; no tolerance range is assumed.',
        'Use the organization’s approved process to inspect supply connections.',
        'Escalate if the cause cannot be established safely.',
      ],
    },
  });
  await tx.faultDefinition.upsert({
    where: { manufacturer_model_faultCode: { manufacturer: 'Siemens', model: 'SINAMICS G120 (demo reference)', faultCode: 'F0003' } }, update: {},
    create: {
      manufacturer: 'Siemens', model: 'SINAMICS G120 (demo reference)', faultCode: 'F0003',
      title: 'Undervoltage', description: 'Drive detected voltage below the configured operating condition.',
      safetyLevel: 'electrical', source: 'Demo SINAMICS G120 maintenance reference — simulated',
      procedureId: procedure.id,
    },
  });
  const history = [
    {
      incidentNumber: 'INC-1021', openedAt: new Date('2026-08-14T10:41:00Z'),
      resolvedAt: new Date('2026-08-14T12:15:00Z'), openedById: users[1]!.id,
      description: 'Conveyor stopped during startup', value: 351,
      rootCause: 'Low incoming supply voltage',
      actionTaken: 'Supply condition corrected and drive returned to service',
      note: 'Incoming supply was restored to its normal condition.',
    },
    {
      incidentNumber: 'INC-1037', openedAt: new Date('2026-09-03T10:41:00Z'),
      resolvedAt: new Date('2026-09-03T11:30:00Z'), openedById: users[2]!.id,
      description: 'Intermittent drive trip during production', value: 355,
      rootCause: 'Low incoming voltage at drive',
      actionTaken: 'Supply connection checked and production restored',
      note: 'Inspect L2 supply terminal if fault repeats.',
    },
  ];
  for (const item of history) {
    const { value, note, ...incident } = item;
    // Nested creation is atomic and runs only when this canonical incident is missing.
    await tx.incident.upsert({
      where: { incidentNumber: item.incidentNumber }, update: {},
      create: {
        ...incident, assetId: motor.id, faultCode: 'F0003', title: 'VFD F0003 undervoltage fault',
        priority: 'high', status: 'resolved', resolutionSummary: item.actionTaken,
        notes: { create: { note, authorId: item.openedById, source: 'manual', createdAt: item.resolvedAt } },
        measurements: { create: { assetId: motor.id, measurementType: 'line_voltage', value, unit: 'V', recordedById: item.openedById, recordedAt: item.openedAt } },
        maintenanceRecord: { create: {
          assetId: motor.id, technicianId: item.openedById, faultCode: 'F0003',
          symptom: item.description, rootCause: item.rootCause, actionTaken: item.actionTaken,
          verification: 'Equipment returned to service', source: 'imported', performedAt: item.resolvedAt,
        } },
      },
    });
  }
}

