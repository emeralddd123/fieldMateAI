import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = process.env.TEST_API_URL || 'http://localhost:3000';
let sessionCookie = '';

async function login() {
  if (sessionCookie) return sessionCookie;
  const email = process.env.DEMO_USER_EMAIL || 'technician@fieldmate.local';
  const password = process.env.DEMO_USER_PASSWORD || 'fieldmate-demo-2026';
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify({ email, password }),
  });
  if (response.ok) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) sessionCookie = setCookie.split(';', 1)[0];
  }
  return sessionCookie;
}

async function get(path, authenticated = true) {
  const headers = {};
  if (authenticated) {
    const cookie = await login();
    if (cookie) headers.cookie = cookie;
  }
  const response = await fetch(`${base}${path}`, { headers });
  return { status: response.status, body: await response.json() };
}

test('health verifies database availability', async () => {
  assert.deepEqual(await get('/health', false), {
    status: 200,
    body: { status: 'ok' },
  });
});

test('unauthenticated asset requests fail with 401', async () => {
  const unauth = await get('/api/v1/assets', false);
  assert.equal(unauth.status, 401);
  assert.equal(unauth.body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('security middleware returns request IDs and baseline headers', async () => {
  const supplied = await fetch(`${base}/health`, {
    headers: { 'x-request-id': 'integration-request-123' },
  });
  assert.equal(supplied.headers.get('x-request-id'), 'integration-request-123');
  assert.equal(supplied.headers.get('x-content-type-options'), 'nosniff');

  const replaced = await fetch(`${base}/health`, {
    headers: { 'x-request-id': 'invalid request id' },
  });
  const requestId = replaced.headers.get('x-request-id');
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(requestId, 'invalid request id');
  assert.equal(replaced.headers.get('x-request-id'), requestId);
});

test('seeded assets include the canonical motor and numeric nominal values', async () => {
  const { status, body } = await get('/api/v1/assets');
  assert.equal(status, 200);
  for (const tag of ['M-204', 'P-101', 'C-402', 'HVAC-02', 'GEN-01']) {
    assert.ok(
      body.data.some((asset) => asset.assetTag === tag),
      `Missing ${tag}`,
    );
  }
  const motor = body.data.find((asset) => asset.assetTag === 'M-204');
  assert.equal(motor.nominalVoltageV, 400);
  assert.equal(motor.nominalCurrentA, 12.5);
  assert.equal(motor.site.code, 'PLANT-A');
  assert.equal(motor.components[0].model, 'SINAMICS G120 (demo reference)');
  const detail = await get(`/api/v1/assets/${motor.id}`);
  assert.deepEqual(detail.body.data, motor);
});

test('search normalizes asset tags and safely returns no match', async () => {
  const result = await get('/api/v1/assets/search?q=m%20204');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].assetTag, 'M-204');
  assert.deepEqual(
    (await get('/api/v1/assets/search?q=nonexistent')).body.data,
    [],
  );
});

test('unknown IDs and malformed inputs return structured errors', async () => {
  const missing = await get(
    '/api/v1/assets/00000000-0000-4000-8000-000000000000',
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'ASSET_NOT_FOUND');
  for (const path of [
    '/api/v1/assets/not-a-uuid',
    '/api/v1/assets/search',
    '/api/v1/assets/search?q=%20',
    '/api/v1/assets/search?q=M-204&unexpected=true',
  ]) {
    const result = await get(path);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  }
});
