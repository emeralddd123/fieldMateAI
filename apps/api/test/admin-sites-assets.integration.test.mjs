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

let testSiteId = '';
let testAssetId = '';
let plantASiteId = '';

async function cleanupTestResources() {
  await pool.query("DELETE FROM components WHERE asset_id IN (SELECT id FROM assets WHERE asset_tag LIKE 'TEST-%')");
  await pool.query("DELETE FROM assets WHERE asset_tag LIKE 'TEST-%'");
  await pool.query("DELETE FROM membership_site_access WHERE site_id IN (SELECT id FROM sites WHERE code LIKE 'TEST-%')");
  await pool.query("DELETE FROM sites WHERE code LIKE 'TEST-%'");
}

before(async () => {
  await cleanupTestResources();

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

  const siteRes = await pool.query(
    "SELECT id FROM sites WHERE code = 'PLANT-A' LIMIT 1",
  );
  plantASiteId = siteRes.rows[0].id;
});

after(async () => {
  await cleanupTestResources();
  await pool.end();
});

test('1. Role enforcement: Only admin can access site and asset admin endpoints', async () => {
  // Unauthenticated -> 401
  await request('GET', '/admin/sites', { expected: 401 });
  await request('POST', '/admin/sites', { body: { name: 'X', code: 'X', location: 'L' }, expected: 401 });
  await request('GET', '/admin/assets', { expected: 401 });
  await request('POST', '/admin/assets', { body: { name: 'X' }, expected: 401 });

  // Technician -> 403
  await request('GET', '/admin/sites', { cookie: techCookie, expected: 403 });
  await request('POST', '/admin/sites', { cookie: techCookie, body: { name: 'X', code: 'X', location: 'L' }, expected: 403 });
  await request('GET', '/admin/assets', { cookie: techCookie, expected: 403 });
  await request('POST', '/admin/assets', { cookie: techCookie, body: { name: 'X' }, expected: 403 });

  // Supervisor -> 403
  await request('GET', '/admin/sites', { cookie: supervisorCookie, expected: 403 });
  await request('POST', '/admin/sites', { cookie: supervisorCookie, body: { name: 'X', code: 'X', location: 'L' }, expected: 403 });
  await request('GET', '/admin/assets', { cookie: supervisorCookie, expected: 403 });
  await request('POST', '/admin/assets', { cookie: supervisorCookie, body: { name: 'X' }, expected: 403 });

  // Admin -> 200
  const adminSites = await request('GET', '/admin/sites', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(adminSites.body.data));

  const adminAssets = await request('GET', '/admin/assets', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(adminAssets.body.data.assets));
});

test('2. Site administration lifecycle: create, conflict, get, update, archive', async () => {
  // 1. Create site with lowercase code -> normalized to uppercase
  const createRes = await request('POST', '/admin/sites', {
    cookie: adminCookie,
    body: {
      name: 'Test Renewable Facility',
      code: 'test-solar-01',
      location: 'Sector 7, Solar Field',
    },
    expected: 201,
  });

  assert.equal(createRes.body.data.code, 'TEST-SOLAR-01');
  assert.equal(createRes.body.data.name, 'Test Renewable Facility');
  testSiteId = createRes.body.data.id;

  // 2. Conflict on duplicate site code
  const dupRes = await request('POST', '/admin/sites', {
    cookie: adminCookie,
    body: {
      name: 'Another Facility',
      code: 'TEST-SOLAR-01',
      location: 'Different Location',
    },
    expected: 409,
  });
  assert.equal(dupRes.body.error.code, 'SITE_CODE_EXISTS');

  // 3. Get site details
  const getRes = await request('GET', `/admin/sites/${testSiteId}`, {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(getRes.body.data.id, testSiteId);
  assert.equal(getRes.body.data.code, 'TEST-SOLAR-01');
  assert.equal(getRes.body.data.activeAssetCount, 0);

  // 4. Update site details
  const updateRes = await request('PATCH', `/admin/sites/${testSiteId}`, {
    cookie: adminCookie,
    body: {
      name: 'Test Renewable Facility Updated',
      location: 'Sector 7, North Gate',
    },
    expected: 200,
  });
  assert.equal(updateRes.body.data.name, 'Test Renewable Facility Updated');
  assert.equal(updateRes.body.data.location, 'Sector 7, North Gate');

  // 5. Update conflict with another site's code
  const codeConflictRes = await request('PATCH', `/admin/sites/${testSiteId}`, {
    cookie: adminCookie,
    body: { code: 'PLANT-A' },
    expected: 409,
  });
  assert.equal(codeConflictRes.body.error.code, 'SITE_CODE_EXISTS');

  // 6. List sites with query search
  const searchRes = await request('GET', '/admin/sites?q=Renewable', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(searchRes.body.data.some((s) => s.id === testSiteId));

  // 7. Archive site
  const archiveRes = await request('DELETE', `/admin/sites/${testSiteId}`, {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(archiveRes.body.data.archived, true);

  // 8. Archived site is excluded from default list but returned with includeArchived=true
  const listActive = await request('GET', '/admin/sites', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(!listActive.body.data.some((s) => s.id === testSiteId));

  const listAll = await request('GET', '/admin/sites?includeArchived=true', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(listAll.body.data.some((s) => s.id === testSiteId));
});

test('3. Asset administration lifecycle: specifications, nested components, tag conflict, and immediate visibility', async () => {
  // 1. Invalid site ID rejection
  const badSiteRes = await request('POST', '/admin/assets', {
    cookie: adminCookie,
    body: {
      siteId: '00000000-0000-4000-8000-000000000099',
      assetTag: 'TEST-GEN-01',
      name: 'Emergency Generator',
      equipmentType: 'Generator',
      manufacturer: 'Cummins',
      model: 'QSK60-G4',
      location: 'Auxiliary Bay 1',
    },
    expected: 400,
  });
  assert.equal(badSiteRes.body.error.code, 'INVALID_SITE');

  // 2. Create asset on PLANT-A with operating specs and nested components
  const createRes = await request('POST', '/admin/assets', {
    cookie: adminCookie,
    body: {
      siteId: plantASiteId,
      assetTag: 'test-gen-99',
      name: 'Standby Diesel Generator',
      equipmentType: 'Generator',
      manufacturer: 'Cummins',
      model: 'QSK60-G4',
      location: 'Generator Room 1',
      serialNumber: 'SN-998877',
      description: 'Primary emergency standby generator for Plant A.',
      status: 'operational',
      nominalVoltageV: 415,
      nominalCurrentA: 800.5,
      commissionedAt: '2024-01-15T08:00:00.000Z',
      components: [
        {
          componentType: 'Alternator',
          manufacturer: 'Stamford',
          model: 'UCI274',
          identifier: 'ALT-01',
        },
        {
          componentType: 'Governor',
          manufacturer: 'Woodward',
          model: '505',
          identifier: 'GOV-01',
        },
      ],
    },
    expected: 201,
  });

  const asset = createRes.body.data;
  assert.equal(asset.assetTag, 'TEST-GEN-99');
  assert.equal(asset.nominalVoltageV, 415);
  assert.equal(asset.nominalCurrentA, 800.5);
  assert.equal(asset.components.length, 2);
  testAssetId = asset.id;

  // 3. Duplicate asset tag conflict
  const dupRes = await request('POST', '/admin/assets', {
    cookie: adminCookie,
    body: {
      siteId: plantASiteId,
      assetTag: 'TEST-GEN-99',
      name: 'Duplicate Generator',
      equipmentType: 'Generator',
      manufacturer: 'CAT',
      model: 'C32',
      location: 'Room 2',
    },
    expected: 409,
  });
  assert.equal(dupRes.body.error.code, 'ASSET_TAG_EXISTS');

  // 4. Get asset details includes nested components and site info
  const getRes = await request('GET', `/admin/assets/${testAssetId}`, {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(getRes.body.data.id, testAssetId);
  assert.equal(getRes.body.data.site.code, 'PLANT-A');
  assert.equal(getRes.body.data.components.length, 2);

  // 5. Update asset: update status, specs, and reconcile components
  const updateRes = await request('PATCH', `/admin/assets/${testAssetId}`, {
    cookie: adminCookie,
    body: {
      status: 'warning',
      nominalVoltageV: 400,
      components: [
        {
          componentType: 'Alternator',
          manufacturer: 'Stamford',
          model: 'UCI274-Updated',
          identifier: 'ALT-01-REV',
        },
      ],
    },
    expected: 200,
  });
  assert.equal(updateRes.body.data.status, 'warning');
  assert.equal(updateRes.body.data.nominalVoltageV, 400);
  assert.equal(updateRes.body.data.components.length, 1);
  assert.equal(updateRes.body.data.components[0].model, 'UCI274-Updated');

  // 6. IMMEDIATE VISIBILITY: Authenticated technician assigned to PLANT-A sees the new machine immediately
  const techList = await request('GET', '/assets', {
    cookie: techCookie,
    expected: 200,
  });
  assert.ok(techList.body.data.some((a) => a.id === testAssetId));

  // Voice/text search lookup finds the new asset
  const techSearch = await request('GET', '/assets?q=TEST-GEN-99', {
    cookie: techCookie,
    expected: 200,
  });
  assert.ok(techSearch.body.data.some((a) => a.assetTag === 'TEST-GEN-99'));

  // 7. Archive asset
  const archiveRes = await request('DELETE', `/admin/assets/${testAssetId}`, {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(archiveRes.body.data.archived, true);

  // 8. Archived asset immediately disappears from technician listing & search
  const techListAfterArchive = await request('GET', '/assets', {
    cookie: techCookie,
    expected: 200,
  });
  assert.ok(!techListAfterArchive.body.data.some((a) => a.id === testAssetId));

  // Direct fetch by technician returns 404
  await request('GET', `/assets/${testAssetId}`, {
    cookie: techCookie,
    expected: 404,
  });

  // Admin assets list excludes archived by default, but includes with includeArchived=true
  const adminActive = await request('GET', '/admin/assets', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(!adminActive.body.data.assets.some((a) => a.id === testAssetId));

  const adminAll = await request('GET', '/admin/assets?includeArchived=true', {
    cookie: adminCookie,
    expected: 200,
  });
  assert.ok(adminAll.body.data.assets.some((a) => a.id === testAssetId));
});

test('4. Audit events are recorded for all site and asset administrative mutations', async () => {
  const auditRes = await pool.query(
    `SELECT action, resource_type, resource_id, details
     FROM audit_events
     WHERE actor_user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [adminId],
  );

  const actions = auditRes.rows.map((r) => r.action);
  assert.ok(actions.includes('admin.site.create'), 'admin.site.create audit recorded');
  assert.ok(actions.includes('admin.site.update'), 'admin.site.update audit recorded');
  assert.ok(actions.includes('admin.site.archive'), 'admin.site.archive audit recorded');
  assert.ok(actions.includes('admin.asset.create'), 'admin.asset.create audit recorded');
  assert.ok(actions.includes('admin.asset.update'), 'admin.asset.update audit recorded');
  assert.ok(actions.includes('admin.asset.archive'), 'admin.asset.archive audit recorded');
});
