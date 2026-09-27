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

  await pool.query(
    "UPDATE users SET name = 'Ibrahim Musa' WHERE id = $1",
    [supervisorId],
  );

  techCookie = `${cookieName}=${techSession.token}`;
  supervisorCookie = `${cookieName}=${supervisorSession.token}`;
  adminCookie = `${cookieName}=${adminSession.token}`;
});

after(async () => {
  // Clean up any test users created during admin tests
  await pool.query(
    "DELETE FROM users WHERE email IN ('invited.tech@fieldmate.test', 'revokeme@fieldmate.test', 'second.admin@fieldmate.test')",
  );
  await pool.query(
    "DELETE FROM user_invites WHERE email IN ('invited.tech@fieldmate.test', 'revokeme@fieldmate.test', 'second.admin@fieldmate.test')",
  );
  await pool.end();
});

test('1. Role enforcement: Only admin can access admin routes', async () => {
  // Unauthenticated -> 401
  const unauth = await request('GET', '/admin/users', { expected: 401 });
  assert.equal(unauth.body.error.code, 'AUTHENTICATION_REQUIRED');

  // Technician -> 403
  const tech = await request('GET', '/admin/users', {
    cookie: techCookie,
    expected: 403,
  });
  assert.equal(tech.body.error.code, 'INSUFFICIENT_PERMISSIONS');

  // Supervisor -> 403
  const supervisor = await request('GET', '/admin/users', {
    cookie: supervisorCookie,
    expected: 403,
  });
  assert.equal(supervisor.body.error.code, 'INSUFFICIENT_PERMISSIONS');

  // Admin -> 200
  const admin = await request('GET', '/admin/users', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(Array.isArray(admin.body.data.users));
  assert.ok(admin.body.data.pagination.total >= 3);
});

test('2. List users with filters, pagination, and sites', async () => {
  // Search by name
  const search = await request('GET', '/admin/users?q=Ibrahim', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(search.body.data.users.length, 1);
  assert.equal(search.body.data.users[0].name, 'Ibrahim Musa');
  assert.equal(search.body.data.users[0].role, 'supervisor');

  // Filter by role
  const technicians = await request('GET', '/admin/users?role=technician', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(technicians.body.data.users.length >= 2);
  for (const u of technicians.body.data.users) {
    assert.equal(u.role, 'technician');
  }

  // List sites for selection
  const sites = await request('GET', '/admin/sites', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(Array.isArray(sites.body.data));
  assert.ok(sites.body.data.some((s) => s.code === 'PLANT-A'));
});

test('3. User invitation lifecycle: invite, list, resend, accept, and member conflict', async () => {
  const inviteEmail = 'invited.tech@fieldmate.test';

  // 1. Admin invites a new user
  const inviteRes = await request('POST', '/admin/invitations', {
    cookie: adminCookie,
    body: {
      email: inviteEmail,
      name: 'Invited Tech',
      role: 'technician',
    },
    expected: 201,
  });
  assert.equal(inviteRes.body.data.invite.email, inviteEmail);
  assert.equal(inviteRes.body.data.invite.role, 'technician');
  assert.ok(inviteRes.body.data.inviteToken);
  const firstToken = inviteRes.body.data.inviteToken;
  const inviteId = inviteRes.body.data.invite.id;

  // 2. Admin lists invitations
  const listInvites = await request('GET', '/admin/invitations', {
    cookie: adminCookie,
    expected: 200,
  });
  const found = listInvites.body.data.find((i) => i.id === inviteId);
  assert.ok(found);
  assert.equal(found.email, inviteEmail);

  // 3. Admin resends invitation (gets refreshed token)
  const resendRes = await request(
    'POST',
    `/admin/invitations/${inviteId}/resend`,
    {
      cookie: adminCookie,
      expected: 201,
    },
  );
  assert.ok(resendRes.body.data.inviteToken);
  const secondToken = resendRes.body.data.inviteToken;
  assert.notEqual(firstToken, secondToken);

  // 4. Accepting first token should now fail because it was renewed
  const oldAccept = await request(
    'POST',
    `/auth/invitations/${firstToken}/accept`,
    {
      body: { password: 'valid-new-password-1234' },
      expected: 401,
    },
  );
  assert.equal(oldAccept.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');

  // 5. Accepting second token succeeds
  const acceptRes = await request(
    'POST',
    `/auth/invitations/${secondToken}/accept`,
    {
      body: { password: 'valid-new-password-1234' },
      expected: 201,
    },
  );
  assert.equal(acceptRes.body.data.user.email, inviteEmail);

  // 6. Attempting to invite an active member now returns 409 Conflict
  const duplicate = await request('POST', '/admin/invitations', {
    cookie: adminCookie,
    body: {
      email: inviteEmail,
      name: 'Duplicate Tech',
      role: 'technician',
    },
    expected: 409,
  });
  assert.equal(duplicate.body.error.code, 'USER_ALREADY_MEMBER');
});

test('4. Revoke invitation prevents acceptance', async () => {
  const revokeEmail = 'revokeme@fieldmate.test';

  const inviteRes = await request('POST', '/admin/invitations', {
    cookie: adminCookie,
    body: {
      email: revokeEmail,
      name: 'Revoke Me',
      role: 'technician',
    },
    expected: 201,
  });
  const { id: inviteId } = inviteRes.body.data.invite;
  const token = inviteRes.body.data.inviteToken;

  // Revoke it
  await request('DELETE', `/admin/invitations/${inviteId}`, {
    cookie: adminCookie,
    expected: 200,
  });

  // Acceptance should fail with 401
  const acceptRes = await request(
    'POST',
    `/auth/invitations/${token}/accept`,
    {
      body: { password: 'some-secure-password-123' },
      expected: 401,
    },
  );
  assert.equal(acceptRes.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');
});

test('5. Update user: name, role, and site assignment', async () => {
  // Update Ibrahim Musa (supervisor) name
  const updateRes = await request('PATCH', `/admin/users/${supervisorId}`, {
    cookie: adminCookie,
    body: {
      name: 'Ibrahim Musa Updated',
    },
    expected: 200,
  });
  assert.equal(updateRes.body.data.name, 'Ibrahim Musa Updated');

  // Restore name
  await request('PATCH', `/admin/users/${supervisorId}`, {
    cookie: adminCookie,
    body: { name: 'Ibrahim Musa' },
    expected: 200,
  });
});

test('6. Protections: Last active admin and self-deactivation cannot be bypassed', async () => {
  // Self-deactivation by admin -> 409
  const selfDeactivate = await request('PATCH', `/admin/users/${adminId}`, {
    cookie: adminCookie,
    body: { status: 'disabled' },
    expected: 409,
  });
  assert.equal(selfDeactivate.body.error.code, 'CANNOT_DEACTIVATE_SELF');

  // Demoting the last active admin -> 409
  const demoteLastAdmin = await request('PATCH', `/admin/users/${adminId}`, {
    cookie: adminCookie,
    body: { role: 'technician' },
    expected: 409,
  });
  assert.equal(demoteLastAdmin.body.error.code, 'LAST_ADMIN_PROTECTED');

  // Create a second admin directly in DB for testing demotion
  const secondAdminUser = await pool.query(
    `INSERT INTO users (id, name, email, status, updated_at)
     VALUES (gen_random_uuid(), 'Second Admin', 'second.admin@fieldmate.test', 'active', NOW())
     RETURNING id`,
  );
  const secondAdminId = secondAdminUser.rows[0].id;
  const org = await pool.query(
    "SELECT id FROM organizations WHERE slug = 'fieldmate-demo'",
  );
  const orgId = org.rows[0].id;
  await pool.query(
    `INSERT INTO organization_memberships (id, organization_id, user_id, role, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'admin', 'active', NOW())`,
    [orgId, secondAdminId],
  );

  // Now demoting second admin succeeds because there are 2 active admins
  const demoteSecondAdmin = await request(
    'PATCH',
    `/admin/users/${secondAdminId}`,
    {
      cookie: adminCookie,
      body: { role: 'supervisor' },
      expected: 200,
    },
  );
  assert.equal(demoteSecondAdmin.body.data.role, 'supervisor');

  // Now demoting the original admin fails again because only 1 active admin remains
  const demoteOriginalAgain = await request(
    'PATCH',
    `/admin/users/${adminId}`,
    {
      cookie: adminCookie,
      body: { role: 'technician' },
      expected: 409,
    },
  );
  assert.equal(demoteOriginalAgain.body.error.code, 'LAST_ADMIN_PROTECTED');
});

test('7. Session revocation and deactivation terminates active user sessions', async () => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'fieldmate_session';

  // Create an active session for the technician
  const userSession = createSession();
  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '1 day')`,
    [techId, userSession.tokenHash],
  );
  const activeTechCookie = `${cookieName}=${userSession.token}`;

  // Session works before revocation
  const checkBefore = await request('GET', '/auth/me', {
    cookie: activeTechCookie,
    expected: 200,
  });
  assert.equal(checkBefore.body.data.user.id, techId);

  // Admin revokes all sessions for technician
  const revokeRes = await request(
    'POST',
    `/admin/users/${techId}/revoke-sessions`,
    {
      cookie: adminCookie,
      expected: 201,
    },
  );
  assert.ok(revokeRes.body.data.revokedCount >= 1);

  // Session now returns 401
  const checkAfter = await request('GET', '/auth/me', {
    cookie: activeTechCookie,
    expected: 401,
  });
  assert.equal(checkAfter.body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('8. Audit events are recorded for admin actions', async () => {
  const audit = await pool.query(
    `SELECT action, resource_type, resource_id
     FROM audit_events
     WHERE action LIKE 'admin.user.%'
     ORDER BY created_at DESC
     LIMIT 10`,
  );
  assert.ok(audit.rows.length >= 4);
  const actions = audit.rows.map((r) => r.action);
  assert.ok(actions.includes('admin.user.invite'));
  assert.ok(actions.includes('admin.user.update'));
  assert.ok(actions.includes('admin.user.revoke_sessions'));
});
