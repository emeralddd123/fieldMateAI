import 'dotenv/config';
import pg from 'pg';
import { hash, argon2id } from 'argon2';

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3]?.trim();
const name = process.argv[4]?.trim() || 'FieldMate Administrator';

if (!email || !password) {
  console.log(`
Usage:
  node scripts/create-admin.mjs <email> <password> [name]

Example:
  node scripts/create-admin.mjs myadmin@company.com MySecurePass123 "John Doe"
`);
  process.exit(1);
}

if (password.length < 8) {
  console.error('Error: Password must be at least 8 characters long.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  try {
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // 1. Get or create default organization
    let orgRes = await pool.query(
      "SELECT id FROM organizations WHERE slug = 'fieldmate-demo' LIMIT 1",
    );
    let orgId;
    if (orgRes.rows.length > 0) {
      orgId = orgRes.rows[0].id;
    } else {
      const newOrg = await pool.query(
        `INSERT INTO organizations (id, name, slug)
         VALUES (gen_random_uuid(), 'FieldMate Organization', 'fieldmate-demo')
         RETURNING id`,
      );
      orgId = newOrg.rows[0].id;
    }

    // 2. Upsert user
    const userRes = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, status, password_changed_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           status = 'active',
           password_changed_at = NOW(),
           updated_at = NOW()
       RETURNING id, name, email`,
      [name, email, passwordHash],
    );
    const user = userRes.rows[0];

    // 3. Upsert admin organization membership
    await pool.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'admin', 'active', NOW())
       ON CONFLICT (organization_id, user_id) DO UPDATE
       SET role = 'admin', status = 'active', updated_at = NOW()`,
      [orgId, user.id],
    );

    // 4. Log audit event
    await pool.query(
      `INSERT INTO audit_events (id, organization_id, actor_user_id, action, resource_type, resource_id, details)
       VALUES (gen_random_uuid(), $1, $2, 'user.created_via_cli', 'user', $3, $4)`,
      [
        orgId,
        user.id,
        user.id,
        JSON.stringify({ email: user.email, name: user.name, role: 'admin' }),
      ],
    );

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
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to create admin user:', err.message);
  process.exit(1);
});
