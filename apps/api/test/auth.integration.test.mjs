import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import argon2 from 'argon2';
import pg from 'pg';

const base = process.env.TEST_API_URL || 'http://localhost:53000';
const origin = process.env.TEST_WEB_URL || 'http://localhost:55173';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: databaseUrl });
const adminEmail = 'admin@fieldmate.test';
const originalPassword = 'fieldmate-test-admin';
const changedPassword = 'fieldmate-test-admin-changed';

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a Set-Cookie header.');
  return value.split(';', 1)[0];
}

async function request(
  path,
  { method = 'GET', body, cookie, requestOrigin = origin } = {},
) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && requestOrigin !== null)
    headers.origin = requestOrigin;
  const response = await fetch(`${base}/api/v1/auth${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    response,
    body: await response.json(),
  };
}

async function login(password = originalPassword) {
  return request('/login', {
    method: 'POST',
    body: { email: adminEmail, password },
  });
}

before(async () => {
  await pool.query(
    "DELETE FROM users WHERE email = 'invited.phase2@fieldmate.test'",
  );
  const passwordHash = await argon2.hash(originalPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await pool.query("UPDATE users SET status = 'active', password_hash = $1 WHERE email = $2", [
    passwordHash,
    adminEmail,
  ]);
});

after(async () => {
  await pool.query(
    "DELETE FROM users WHERE email = 'invited.phase2@fieldmate.test'",
  );
  await pool.end();
});

test('login is generic, origin checked, and cookie session is server-side', async () => {
  const noOrigin = await request('/login', {
    method: 'POST',
    requestOrigin: null,
    body: { email: adminEmail, password: originalPassword },
  });
  assert.equal(noOrigin.response.status, 403);
  assert.equal(noOrigin.body.error.code, 'INVALID_REQUEST_ORIGIN');

  for (const body of [
    { email: 'missing@fieldmate.test', password: originalPassword },
    { email: adminEmail, password: 'incorrect-password' },
  ]) {
    const denied = await request('/login', { method: 'POST', body });
    assert.equal(denied.response.status, 401);
    assert.equal(denied.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(
      denied.body.error.message,
      'The email or password is incorrect.',
    );
  }

  const result = await login();
  assert.equal(result.response.status, 201);
  const setCookie = result.response.headers.get('set-cookie');
  assert.match(setCookie, /fieldmate_test_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /; Secure/i);
  const cookie = cookieFrom(result.response);
  assert.equal(result.body.data.user.email, adminEmail);
  assert.equal(result.body.data.memberships[0].role, 'admin');
  assert.equal(result.body.data.memberships[0].sites[0].code, 'PLANT-A');

  const me = await request('/me', { cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.sessionId, result.body.data.sessionId);
  const stored = await pool.query(
    'SELECT token_hash FROM auth_sessions WHERE id = $1',
    [me.body.data.sessionId],
  );
  assert.equal(stored.rows.length, 1);
  assert.notEqual(stored.rows[0].token_hash, cookie.split('=')[1]);
  assert.equal(stored.rows[0].token_hash, tokenHash(cookie.split('=')[1]));
});

test('logout and logout-all revoke current and parallel sessions', async () => {
  const first = await login();
  const firstCookie = cookieFrom(first.response);
  const second = await login();
  const secondCookie = cookieFrom(second.response);
  const loggedOut = await request('/logout', {
    method: 'POST',
    cookie: firstCookie,
  });
  assert.equal(loggedOut.response.status, 201);
  assert.match(loggedOut.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(
    (await request('/me', { cookie: firstCookie })).response.status,
    401,
  );
  assert.equal(
    (await request('/me', { cookie: secondCookie })).response.status,
    200,
  );

  const third = await login();
  const thirdCookie = cookieFrom(third.response);
  assert.equal(
    (
      await request('/logout-all', {
        method: 'POST',
        cookie: secondCookie,
      })
    ).response.status,
    201,
  );
  assert.equal(
    (await request('/me', { cookie: secondCookie })).response.status,
    401,
  );
  assert.equal(
    (await request('/me', { cookie: thirdCookie })).response.status,
    401,
  );
});

test('password change rotates the session and reset tokens are single use', async () => {
  const signedIn = await login();
  const oldCookie = cookieFrom(signedIn.response);
  const changed = await request('/change-password', {
    method: 'POST',
    cookie: oldCookie,
    body: { currentPassword: originalPassword, newPassword: changedPassword },
  });
  assert.equal(changed.response.status, 201);
  const changedCookie = cookieFrom(changed.response);
  assert.equal(
    (await request('/me', { cookie: oldCookie })).response.status,
    401,
  );
  assert.equal(
    (await request('/me', { cookie: changedCookie })).response.status,
    200,
  );
  assert.equal((await login()).response.status, 401);
  assert.equal((await login(changedPassword)).response.status, 201);

  const resetRequest = await request('/password-reset/request', {
    method: 'POST',
    body: { email: adminEmail },
  });
  assert.equal(resetRequest.response.status, 201);
  assert.equal(resetRequest.body.data.accepted, true);
  assert.match(resetRequest.body.data.resetToken, /^[A-Za-z0-9_-]{43}$/);
  const reset = await request(
    `/password-reset/${resetRequest.body.data.resetToken}`,
    { method: 'POST', body: { password: originalPassword } },
  );
  assert.equal(reset.response.status, 201);
  assert.equal((await login()).response.status, 201);
  assert.equal(
    (
      await request(`/password-reset/${resetRequest.body.data.resetToken}`, {
        method: 'POST',
        body: { password: originalPassword },
      })
    ).response.status,
    401,
  );

  const missing = await request('/password-reset/request', {
    method: 'POST',
    body: { email: 'missing@fieldmate.test' },
  });
  assert.deepEqual(missing.body.data, { accepted: true });
});

test('invitation acceptance creates membership and cannot be replayed', async () => {
  const rawToken = randomBytes(32).toString('base64url');
  const setup = await pool.query(
    `SELECT o.id AS organization_id, s.id AS site_id, u.id AS admin_id
     FROM organizations o
     JOIN sites s ON s.organization_id = o.id
     JOIN users u ON u.email = $1
     WHERE o.slug = 'fieldmate-demo' AND s.code = 'PLANT-A'`,
    [adminEmail],
  );
  const row = setup.rows[0];
  await pool.query(
    `INSERT INTO user_invites
      (id, organization_id, email, name, role, site_ids, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, 'technician', $5::jsonb, $6, NOW() + INTERVAL '1 hour', $7)`,
    [
      randomUUID(),
      row.organization_id,
      'invited.phase2@fieldmate.test',
      'Phase Two Invite',
      JSON.stringify([row.site_id]),
      tokenHash(rawToken),
      row.admin_id,
    ],
  );
  const accepted = await request(`/invitations/${rawToken}/accept`, {
    method: 'POST',
    body: { password: 'phase-two-invite-password' },
  });
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.body.data.user.email, 'invited.phase2@fieldmate.test');
  assert.equal(accepted.body.data.memberships[0].sites[0].code, 'PLANT-A');
  assert.equal(
    (
      await request(`/invitations/${rawToken}/accept`, {
        method: 'POST',
        body: { password: 'phase-two-invite-password' },
      })
    ).response.status,
    401,
  );
});

test('disabled and expired sessions are rejected', async () => {
  const disabledLogin = await login();
  const disabledCookie = cookieFrom(disabledLogin.response);
  await pool.query("UPDATE users SET status = 'disabled' WHERE email = $1", [
    adminEmail,
  ]);
  assert.equal(
    (await request('/me', { cookie: disabledCookie })).response.status,
    401,
  );
  assert.equal((await login()).response.status, 401);
  await pool.query("UPDATE users SET status = 'active' WHERE email = $1", [
    adminEmail,
  ]);

  const expiring = await login();
  const expiringCookie = cookieFrom(expiring.response);
  await pool.query(
    "UPDATE auth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
    [expiring.body.data.sessionId],
  );
  assert.equal(
    (await request('/me', { cookie: expiringCookie })).response.status,
    401,
  );
});

test('authentication mutations are audited and login is throttled', async () => {
  const audit = await pool.query(
    "SELECT count(*)::int AS count FROM audit_events WHERE action LIKE 'auth.%'",
  );
  assert.ok(audit.rows[0].count >= 6);

  let limited = false;
  for (let index = 0; index < 25; index += 1) {
    const response = await request('/login', {
      method: 'POST',
      body: { email: adminEmail, password: 'always-wrong-password' },
    });
    if (response.response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.equal(limited, true);
});
