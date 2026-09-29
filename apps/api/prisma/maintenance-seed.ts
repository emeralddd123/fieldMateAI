import type { Prisma } from '../src/generated/prisma/client';
import { argon2id, hash } from 'argon2';

export async function seedMaintenance(tx: Prisma.TransactionClient) {
  const motor = await tx.asset.findUniqueOrThrow({
    where: { assetTag: 'M-204' },
  });
  const users = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Demo Technician',
      email: 'technician@fieldmate.local',
      role: 'technician' as const,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Ibrahim Musa',
      email: 'supervisor@fieldmate.local',
      role: 'supervisor' as const,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Grace Okafor',
      email: 'grace@fieldmate.local',
      role: 'technician' as const,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'FieldMate Admin',
      email:
        process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ||
        'admin@fieldmate.local',
      role: 'admin' as const,
    },
  ];
  const bootstrapPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || 'fieldmate-admin-2026';
  const bootstrapPasswordHash = await hash(bootstrapPassword, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const demoPassword =
    process.env.DEMO_USER_PASSWORD?.trim() || 'fieldmate-demo-2026';
  const demoPasswordHash = await hash(demoPassword, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  for (const user of users) {
    const userData = { id: user.id, name: user.name, email: user.email };
    await tx.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        email: user.email,
        status: 'active',
      },
      create: {
        ...userData,
        passwordHash:
          user.role === 'admin' ? bootstrapPasswordHash : demoPasswordHash,
        passwordChangedAt: (
          user.role === 'admin' ? bootstrapPasswordHash : demoPasswordHash
        )
          ? new Date()
          : null,
      },
    });
  }
  if (bootstrapPasswordHash) {
    await tx.user.updateMany({
      where: { id: users[3]!.id, passwordHash: null },
      data: {
        passwordHash: bootstrapPasswordHash,
        passwordChangedAt: new Date(),
      },
    });
  }
  if (demoPasswordHash) {
    await tx.user.updateMany({
      where: {
        id: { in: users.slice(0, 3).map((user) => user.id) },
        passwordHash: null,
      },
      data: {
        passwordHash: demoPasswordHash,
        passwordChangedAt: new Date(),
      },
    });
  }
  for (const user of users) {
    const membership = await tx.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: motor.organizationId,
          userId: user.id,
        },
      },
      update: { role: user.role, status: 'active' },
      create: {
        organizationId: motor.organizationId,
        userId: user.id,
        role: user.role,
      },
    });
    await tx.membershipSiteAccess.upsert({
      where: {
        membershipId_siteId: {
          membershipId: membership.id,
          siteId: motor.siteId,
        },
      },
      update: {},
      create: { membershipId: membership.id, siteId: motor.siteId },
    });
  }
  const procedure = await tx.procedure.upsert({
    where: { key: 'vfd-undervoltage-check' },
    update: {},
    create: {
      organizationId: motor.organizationId,
      key: 'vfd-undervoltage-check',
      title: 'VFD Undervoltage Diagnostic Check',
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      safetyLevel: 'electrical',
      safetyConfirmationRequired: true,
      approved: true,
      status: 'approved',
      approvedById: users[3]!.id,
      approvedAt: new Date(),
      summary:
        'Approved high-level demo checks for a recurring undervoltage condition.',
      source:
        'Demo SINAMICS G120 maintenance reference — simulated, not manufacturer documentation',
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
    where: {
      manufacturer_model_faultCode: {
        manufacturer: 'Siemens',
        model: 'SINAMICS G120 (demo reference)',
        faultCode: 'F0003',
      },
    },
    update: {},
    create: {
      organizationId: motor.organizationId,
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      faultCode: 'F0003',
      normalizedFaultCode: 'F0003',
      title: 'Undervoltage',
      description:
        'Drive detected voltage below the configured operating condition.',
      safetyLevel: 'electrical',
      source: 'Demo SINAMICS G120 maintenance reference — simulated',
      procedureId: procedure.id,
    },
  });
  const history = [
    {
      incidentNumber: 'INC-1021',
      openedAt: new Date('2026-08-14T10:41:00Z'),
      resolvedAt: new Date('2026-08-14T12:15:00Z'),
      openedById: users[1]!.id,
      description: 'Conveyor stopped during startup',
      value: 351,
      rootCause: 'Low incoming supply voltage',
      actionTaken: 'Supply condition corrected and drive returned to service',
      note: 'Incoming supply was restored to its normal condition.',
    },
    {
      incidentNumber: 'INC-1037',
      openedAt: new Date('2026-09-03T10:41:00Z'),
      resolvedAt: new Date('2026-09-03T11:30:00Z'),
      openedById: users[2]!.id,
      description: 'Intermittent drive trip during production',
      value: 355,
      rootCause: 'Low incoming voltage at drive',
      actionTaken: 'Supply connection checked and production restored',
      note: 'Inspect L2 supply terminal if fault repeats.',
    },
  ];
  for (const item of history) {
    const { value, note, ...incident } = item;
    // Nested creation is atomic and runs only when this canonical incident is missing.
    await tx.incident.upsert({
      where: { incidentNumber: item.incidentNumber },
      update: {},
      create: {
        ...incident,
        assetId: motor.id,
        faultCode: 'F0003',
        title: 'VFD F0003 undervoltage fault',
        priority: 'high',
        status: 'resolved',
        resolutionSummary: item.actionTaken,
        notes: {
          create: {
            note,
            authorId: item.openedById,
            source: 'manual',
            createdAt: item.resolvedAt,
          },
        },
        measurements: {
          create: {
            assetId: motor.id,
            measurementType: 'line_voltage',
            value,
            unit: 'V',
            recordedById: item.openedById,
            recordedAt: item.openedAt,
          },
        },
        maintenanceRecord: {
          create: {
            assetId: motor.id,
            technicianId: item.openedById,
            faultCode: 'F0003',
            symptom: item.description,
            rootCause: item.rootCause,
            actionTaken: item.actionTaken,
            verification: 'Equipment returned to service',
            source: 'imported',
            performedAt: item.resolvedAt,
          },
        },
      },
    });
  }
}
