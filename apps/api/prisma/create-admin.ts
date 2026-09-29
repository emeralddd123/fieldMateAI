import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hash, argon2id } from 'argon2';

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3]?.trim();
const name = process.argv[4]?.trim() || 'FieldMate Administrator';

if (!email || !password) {
  console.log(`
Usage:
  docker compose exec api npx tsx prisma/create-admin.ts <email> <password> "[Name]"

Example:
  docker compose exec api npx tsx prisma/create-admin.ts admin@mycompany.com SuperSecurePass2026 "Lead Engineer"
`);
  process.exit(1);
}

const securePassword: string = password;

if (securePassword.length < 8) {
  console.error('Error: Password must be at least 8 characters long.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    const passwordHash = await hash(securePassword, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // 1. Get or create organization
    let organization = await prisma.organization.findFirst({
      where: { slug: 'fieldmate-demo' },
    });
    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: 'FieldMate Organization',
          slug: 'fieldmate-demo',
        },
      });
    }

    // 2. Upsert User
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        status: 'active',
        passwordChangedAt: new Date(),
      },
      create: {
        name,
        email,
        passwordHash,
        status: 'active',
        passwordChangedAt: new Date(),
      },
    });

    // 3. Upsert admin OrganizationMembership
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: {
        role: 'admin',
        status: 'active',
      },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: 'admin',
        status: 'active',
      },
    });

    // 4. Log audit event
    await prisma.auditEvent.create({
      data: {
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'user.created_via_cli',
        resourceType: 'user',
        resourceId: user.id,
        details: { email: user.email, name: user.name, role: 'admin' },
      },
    });

    console.log(`
=====================================================
  Admin user successfully provisioned!
=====================================================
  Name:     ${user.name}
  Email:    ${user.email}
  Role:     admin (full privileges)
  Status:   active
=====================================================
You can now sign in at http://localhost:5173/login
`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: Error) => {
  console.error('Failed to create admin user:', err.message);
  process.exit(1);
});
