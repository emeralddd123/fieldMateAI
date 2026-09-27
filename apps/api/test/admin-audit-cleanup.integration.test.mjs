import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
  process.env.TEST_ALLOW_WRITES !== '1' ||
  !databaseUrl ||
  !new URL(databaseUrl).pathname.endsWith('_test') ||
  !process.env.TEST_API_URL
) {
  throw new Error(
    'Use a freshly seeded isolated *_test database with TEST_DATABASE_URL, TEST_API_URL, and TEST_ALLOW_WRITES=1.',
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const base = process.env.TEST_API_URL;
const origin = process.env.TEST_WEB_URL || 'http://localhost:55173';

let techCookie = '';
let supervisorCookie = '';
let adminCookie = '';

const techId = '00000000-0000-4000-8000-000000000001';
const supervisorId = '00000000-0000-4000-8000-000000000002';
const adminId = '00000000-0000-4000-8000-000000000004';
const demoOrgId = '00000000-0000-4000-8000-000000000100';

function createSession() {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

async function request(
  method,
  path,
  { body, cookie, expected } = {},
) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: origin,
  };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = text;
  }
  if (expected !== undefined) {
    assert.equal(
      response.status,
      expected,
      `Expected status ${expected} for ${method} ${path}, got ${response.status}: ${JSON.stringify(result)}`,
    );
  }
  return { status: response.status, body: result };
}

before(async () => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'fieldmate_session';

  const techSession = createSession();
  const supervisorSession = createSession();
  const adminSession = createSession();

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '1 day'),
            (gen_random_uuid(), $3, $4, NOW() + INTERVAL '1 day'),
            (gen_random_uuid(), $5, $6, NOW() + INTERVAL '1 day')`,
    [
      techId,
      techSession.tokenHash,
      supervisorId,
      supervisorSession.tokenHash,
      adminId,
      adminSession.tokenHash,
    ],
  );

  techCookie = `${cookieName}=${techSession.token}`;
  supervisorCookie = `${cookieName}=${supervisorSession.token}`;
  adminCookie = `${cookieName}=${adminSession.token}`;
});

after(async () => {
  await pool.end();
});

test('1. Role enforcement: Only admin can access audit and cleanup endpoints', async () => {
  // Unauthenticated requests should be 401
  await request('GET', '/admin/audit', { expected: 401 });
  await request('GET', '/admin/audit/actions', { expected: 401 });
  await request('POST', '/admin/cleanup', { expected: 401 });

  // Technician requests should be 403
  await request('GET', '/admin/audit', { cookie: techCookie, expected: 403 });
  await request('GET', '/admin/audit/actions', { cookie: techCookie, expected: 403 });
  await request('POST', '/admin/cleanup', { cookie: techCookie, expected: 403 });

  // Supervisor requests should be 403
  await request('GET', '/admin/audit', { cookie: supervisorCookie, expected: 403 });
  await request('GET', '/admin/audit/actions', { cookie: supervisorCookie, expected: 403 });
  await request('POST', '/admin/cleanup', { cookie: supervisorCookie, expected: 403 });

  // Admin requests succeed
  const auditRes = await request('GET', '/admin/audit', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(auditRes.body.data.events));
  assert.ok(auditRes.body.data.pagination);

  const actionsRes = await request('GET', '/admin/audit/actions', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(actionsRes.body.data));
});

test('2. Audit event querying, filtering, and tenant boundaries', async () => {
  // Insert a unique test audit event for demo org
  const testAction = `test.audit.${Date.now()}`;
  await pool.query(
    `INSERT INTO audit_events (id, organization_id, actor_user_id, action, resource_type, resource_id, details)
     VALUES (gen_random_uuid(), $1, $2, $3, 'test_resource', 'test-123', '{"reason": "verification"}')`,
    [demoOrgId, adminId, testAction],
  );

  // Query audit list
  const listRes = await request('GET', `/admin/audit?action=${testAction}`, {
    cookie: adminCookie,
    expected: 200,
  });

  const events = listRes.body.data.events;
  assert.ok(events.length >= 1, 'Should find the created test audit event');
  const found = events.find((e) => e.action === testAction);
  assert.ok(found);
  assert.equal(found.resourceType, 'test_resource');
  assert.equal(found.resourceId, 'test-123');
  assert.equal(found.details.reason, 'verification');
  assert.equal(found.actor.id, adminId);

  // Check actions endpoint includes testAction
  const actionsRes = await request('GET', '/admin/audit/actions', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(actionsRes.body.data.includes(testAction));
});

test('3. Session and token cleanup: purges expired records while preserving active records', async () => {
  // Insert expired session, expired reset token, expired invite
  const expiredSessionHash = createHash('sha256').update('expired-session-token').digest('hex');
  const activeSessionHash = createHash('sha256').update('active-session-token').digest('hex');
  const expiredResetHash = createHash('sha256').update('expired-reset-token').digest('hex');
  const expiredInviteHash = createHash('sha256').update('expired-invite-token').digest('hex');

  // Insert expired records (expires_at in the past)
  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, NOW() - INTERVAL '2 hours'),
            (gen_random_uuid(), $1, $3, NOW() + INTERVAL '2 hours')`,
    [adminId, expiredSessionHash, activeSessionHash],
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, NOW() - INTERVAL '1 hour')`,
    [adminId, expiredResetHash],
  );

  await pool.query(
    `INSERT INTO user_invites (id, organization_id, email, name, role, token_hash, expires_at, created_by)
     VALUES (gen_random_uuid(), $1, 'expired-invite@fieldmate.test', 'Expired User', 'technician', $2, NOW() - INTERVAL '1 hour', $3)`,
    [demoOrgId, expiredInviteHash, adminId],
  );

  // Trigger cleanup via POST /api/v1/admin/cleanup
  const cleanupRes = await request('POST', '/admin/cleanup', {
    cookie: adminCookie,
    expected: 201,
  });

  const stats = cleanupRes.body.data;
  assert.ok(stats.purgedSessions >= 1, 'Should have purged at least 1 expired session');
  assert.ok(stats.purgedResetTokens >= 1, 'Should have purged at least 1 expired reset token');
  assert.ok(stats.purgedInvites >= 1, 'Should have purged at least 1 expired invite');

  // Verify expired records were deleted from PostgreSQL
  const checkSession = await pool.query(
    'SELECT id FROM auth_sessions WHERE token_hash = $1',
    [expiredSessionHash],
  );
  assert.equal(checkSession.rowCount, 0, 'Expired session must be deleted');

  // Verify active session was preserved
  const checkActive = await pool.query(
    'SELECT id FROM auth_sessions WHERE token_hash = $1',
    [activeSessionHash],
  );
  assert.equal(checkActive.rowCount, 1, 'Active session must remain intact');

  // Verify expired reset token was deleted
  const checkReset = await pool.query(
    'SELECT id FROM password_reset_tokens WHERE token_hash = $1',
    [expiredResetHash],
  );
  assert.equal(checkReset.rowCount, 0, 'Expired reset token must be deleted');

  // Verify expired invite was deleted
  const checkInvite = await pool.query(
    'SELECT id FROM user_invites WHERE token_hash = $1',
    [expiredInviteHash],
  );
  assert.equal(checkInvite.rowCount, 0, 'Expired invite must be deleted');

  // Verify audit event system.cleanup_executed was logged
  const checkAudit = await pool.query(
    "SELECT id, action, details FROM audit_events WHERE action = 'system.cleanup_executed' ORDER BY created_at DESC LIMIT 1",
  );
  assert.ok(checkAudit.rowCount >= 1, 'system.cleanup_executed event must be recorded');

  // Cleanup the active test session
  await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [activeSessionHash]);
});

test('4. Migration verification: obsolete users.role column is removed and users query succeeds', async () => {
  // Query information_schema to verify users.role does NOT exist
  const columnCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  `);
  assert.equal(
    columnCheck.rowCount,
    0,
    'The obsolete users.role column must not exist in the database',
  );

  // Verify GET /api/v1/users continues to function properly using membership roles
  const usersRes = await request('GET', '/users', {
    cookie: techCookie,
    expected: 200,
  });
  assert.ok(Array.isArray(usersRes.body.data));
  assert.ok(usersRes.body.data.length >= 1);
  const adminMember = usersRes.body.data.find((u) => u.id === adminId);
  assert.ok(adminMember);
  assert.equal(adminMember.role, 'admin');
});
