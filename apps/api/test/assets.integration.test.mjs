import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = process.env.TEST_API_URL || 'http://localhost:3000';
async function get(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
}

test('health verifies database availability', async () => {
  assert.deepEqual(await get('/health'), {
    status: 200,
    body: { status: 'ok' },
  });
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
