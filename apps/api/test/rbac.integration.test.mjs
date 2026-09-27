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

let techCookie = '';
let supervisorCookie = '';
let adminCookie = '';

let techId = '00000000-0000-4000-8000-000000000001';
let supervisorId = '00000000-0000-4000-8000-000000000002';
let adminId = '00000000-0000-4000-8000-000000000004';

let defaultOrgId;
let plantASiteId;
let plantBSiteId;
let motorAId;
let motorBId;
let otherOrgId;
let otherAssetId;
let techBUserId;

function createSession() {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

async function request(
  method,
  path,
  { body, cookie, orgId, expected = 200 } = {},
) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:5173',
  };
  if (cookie) headers.cookie = cookie;
  if (orgId) headers['x-organization-id'] = orgId;
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `Path ${path} returned ${response.status} instead of ${expected}: ${JSON.stringify(result)}`,
  );
  return expected >= 400 ? result.error : result.data;
}

before(async () => {
  // Set up sessions for standard demo users
  const tech = createSession(techId);
  const sup = createSession(supervisorId);
  const adm = createSession(adminId);

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '1 day'),
            (gen_random_uuid(), $3, $4, NOW() + INTERVAL '1 day'),
            (gen_random_uuid(), $5, $6, NOW() + INTERVAL '1 day')`,
    [
      techId,
      tech.tokenHash,
      supervisorId,
      sup.tokenHash,
      adminId,
      adm.tokenHash,
    ],
  );

  const cookieName = process.env.SESSION_COOKIE_NAME || 'fieldmate_session';
  techCookie = `${cookieName}=${tech.token}`;
  supervisorCookie = `${cookieName}=${sup.token}`;
  adminCookie = `${cookieName}=${adm.token}`;

  // Retrieve default org and Plant Alpha
  const orgRes = await pool.query(
    `SELECT id FROM organizations WHERE slug = 'fieldmate-demo'`,
  );
  defaultOrgId = orgRes.rows[0].id;

  const siteARes = await pool.query(
    `SELECT id FROM sites WHERE code = 'PLANT-A'`,
  );
  plantASiteId = siteARes.rows[0].id;

  const motorRes = await pool.query(
    `SELECT id FROM assets WHERE asset_tag = 'M-204'`,
  );
  motorAId = motorRes.rows[0].id;

  // Create a second site Plant B in the same org
  const siteBRes = await pool.query(
    `INSERT INTO sites (id, organization_id, name, code, location, updated_at)
     VALUES (gen_random_uuid(), $1, 'Plant Bravo', 'PLANT-B-TEST', 'Test Location B', NOW())
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [defaultOrgId],
  );
  plantBSiteId = siteBRes.rows[0].id;

  // Create an asset at Plant B
  const motorBRes = await pool.query(
    `INSERT INTO assets (id, organization_id, site_id, asset_tag, name, equipment_type, manufacturer, model, location, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'M-999-TEST', 'Bravo Motor', 'Motor', 'Siemens', 'B-100', 'Bay 9', NOW())
     ON CONFLICT (asset_tag) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [defaultOrgId, plantBSiteId],
  );
  motorBId = motorBRes.rows[0].id;

  // Create a separate organization and asset to test multi-tenancy isolation
  const otherOrgRes = await pool.query(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES (gen_random_uuid(), 'Other Tenant Org', 'other-tenant-test', NOW())
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
  );
  otherOrgId = otherOrgRes.rows[0].id;

  const otherSiteRes = await pool.query(
    `INSERT INTO sites (id, organization_id, name, code, location, updated_at)
     VALUES (gen_random_uuid(), $1, 'Site Delta', 'PLANT-D-TEST', 'Remote Delta', NOW())
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [otherOrgId],
  );

  const otherAssetRes = await pool.query(
    `INSERT INTO assets (id, organization_id, site_id, asset_tag, name, equipment_type, manufacturer, model, location, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'M-OTHER-TEST', 'Tenant 2 Asset', 'Pump', 'Demo', 'PX', 'Other Line', NOW())
     ON CONFLICT (asset_tag) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [otherOrgId, otherSiteRes.rows[0].id],
  );
  otherAssetId = otherAssetRes.rows[0].id;

  // Create technician B who only has access to Plant B
  const techBRes = await pool.query(
    `INSERT INTO users (id, name, email, role, status, updated_at)
     VALUES (gen_random_uuid(), 'Tech Bravo', 'techb.test@fieldmate.test', 'technician', 'active', NOW())
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
  );
  techBUserId = techBRes.rows[0].id;

  const membBRes = await pool.query(
    `INSERT INTO organization_memberships (id, organization_id, user_id, role, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'technician', 'active', NOW())
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
     RETURNING id`,
    [defaultOrgId, techBUserId],
  );
  await pool.query(
    `INSERT INTO membership_site_access (membership_id, site_id)
     VALUES ($1, $2)
     ON CONFLICT (membership_id, site_id) DO NOTHING`,
    [membBRes.rows[0].id, plantBSiteId],
  );
});

after(() => pool.end());

test('1. Unauthenticated requests to protected endpoints return 401', async () => {
  const endpoints = [
    { method: 'GET', path: '/assets' },
    { method: 'GET', path: `/assets/${motorAId}` },
    { method: 'GET', path: '/incidents' },
    { method: 'POST', path: '/incidents', body: { assetId: motorAId } },
    { method: 'POST', path: '/measurements', body: { assetId: motorAId } },
    { method: 'POST', path: '/voice/token' },
  ];

  for (const ep of endpoints) {
    const error = await request(ep.method, ep.path, {
      body: ep.body,
      expected: 401,
    });
    assert.equal(error.code, 'AUTHENTICATION_REQUIRED');
  }
});

test('2. Public endpoints remain accessible without authentication', async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);

  const voiceStatus = await fetch(`${base}/api/v1/voice/status`);
  assert.equal(voiceStatus.status, 200);
});

test('3. Authenticated writes are attributed to the logged-in user', async () => {
  // Technician creates reading
  const reading = await request('POST', '/measurements', {
    cookie: techCookie,
    expected: 201,
    body: {
      assetId: motorAId,
      measurementType: 'line_voltage',
      value: 395,
      unit: 'V',
      notes: 'RBAC attribution check',
    },
  });
  assert.ok(reading.id);

  // Direct DB check for reading attribution
  const readRow = await pool.query(
    `SELECT recorded_by FROM measurements WHERE id = $1`,
    [reading.id],
  );
  assert.equal(readRow.rows[0].recorded_by, techId);

  // Technician creates incident
  const incident = await request('POST', '/incidents', {
    cookie: techCookie,
    expected: 201,
    body: {
      assetId: motorAId,
      title: 'Attribution Test Incident',
      description: 'Checking opened_by is real user',
      priority: 'medium',
      measurementIds: [reading.id],
    },
  });
  assert.equal(incident.openedBy.id, techId);

  // Technician adds note
  const note = await request('POST', `/incidents/${incident.id}/notes`, {
    cookie: techCookie,
    expected: 201,
    body: { note: 'Checking note author attribution' },
  });

  const noteRow = await pool.query(
    `SELECT author_id FROM incident_notes WHERE id = $1`,
    [note.id],
  );
  assert.equal(noteRow.rows[0].author_id, techId);

  // Technician completes repair
  const repair = await request(
    'POST',
    `/incidents/${incident.id}/complete-repair`,
    {
      cookie: techCookie,
      expected: 201,
      body: {
        assetId: motorAId,
        rootCause: 'Testing root cause',
        actionTaken: 'Fixed connection',
        verificationSummary: 'Verified under load',
        assetStatus: 'operational',
      },
    },
  );
  assert.equal(repair.incident.status, 'resolved');

  const recordRow = await pool.query(
    `SELECT technician_id FROM maintenance_records WHERE id = $1`,
    [repair.maintenanceRecord.id],
  );
  assert.equal(recordRow.rows[0].technician_id, techId);
});

test('4. Role enforcement: Technicians cannot call supervisor-review; supervisors can', async () => {
  // Create an incident and escalate
  const incident = await request('POST', '/incidents', {
    cookie: techCookie,
    expected: 201,
    body: {
      assetId: motorAId,
      title: 'Supervisor review role check',
      description: 'Escalation to check role guard',
      priority: 'high',
    },
  });

  await request('POST', `/incidents/${incident.id}/escalate`, {
    cookie: techCookie,
    expected: 201,
    body: { reason: 'Requires supervisor signoff' },
  });

  // Technician receives 403 Forbidden
  const forbidden = await request(
    'POST',
    `/incidents/${incident.id}/supervisor-review`,
    {
      cookie: techCookie,
      expected: 403,
      body: { acknowledgeEscalation: true },
    },
  );
  assert.equal(forbidden.code, 'INSUFFICIENT_PERMISSIONS');

  // Supervisor receives 201 Created and is recorded as acknowledgedBy
  const reviewed = await request(
    'POST',
    `/incidents/${incident.id}/supervisor-review`,
    {
      cookie: supervisorCookie,
      expected: 201,
      body: {
        acknowledgeEscalation: true,
        priority: 'critical',
        note: 'Supervisor acknowledged escalation.',
      },
    },
  );
  assert.equal(reviewed.priority, 'critical');
  assert.equal(reviewed.escalations[0].acknowledgedBy.id, supervisorId);
});

test('5. Site scoping: Technician cannot view or mutate an asset outside permitted sites', async () => {
  // Tech is only assigned to Plant Alpha; Plant B asset is M-999-TEST
  const list = await request('GET', '/assets', { cookie: techCookie });
  assert.equal(
    list.some((asset) => asset.id === motorBId),
    false,
    'Plant B asset should not appear in technician asset list',
  );

  const search = await request('GET', '/assets/search?q=M-999', {
    cookie: techCookie,
  });
  assert.equal(
    search.length,
    0,
    'Plant B asset should not be searchable by technician',
  );

  // Directly requesting asset by ID returns 404
  const assetGet = await request('GET', `/assets/${motorBId}`, {
    cookie: techCookie,
    expected: 404,
  });
  assert.equal(assetGet.code, 'ASSET_NOT_FOUND');

  // Attempting to create an incident on unassigned site returns 404
  const incidentPost = await request('POST', '/incidents', {
    cookie: techCookie,
    expected: 404,
    body: {
      assetId: motorBId,
      title: 'Cross-site write test',
      description: 'Should fail',
      priority: 'low',
    },
  });
  assert.equal(incidentPost.code, 'ASSET_NOT_FOUND');

  // Admin has access to all sites in organization and can access Plant B asset
  const adminGet = await request('GET', `/assets/${motorBId}`, {
    cookie: adminCookie,
  });
  assert.equal(adminGet.assetTag, 'M-999-TEST');
});

test('6. Cross-organization isolation: Cannot access another organization resources', async () => {
  // Accessing asset from another organization returns 404
  const otherGet = await request('GET', `/assets/${otherAssetId}`, {
    cookie: techCookie,
    expected: 404,
  });
  assert.equal(otherGet.code, 'ASSET_NOT_FOUND');

  // Passing another organization ID header returns 403 ORGANIZATION_ACCESS_DENIED
  const wrongOrg = await request('GET', '/assets', {
    cookie: techCookie,
    orgId: otherOrgId,
    expected: 403,
  });
  assert.equal(wrongOrg.code, 'ORGANIZATION_ACCESS_DENIED');
});

test('7. Supervisor cannot assign work to a user outside the incident site', async () => {
  const incident = await request('POST', '/incidents', {
    cookie: supervisorCookie,
    expected: 201,
    body: {
      assetId: motorAId,
      title: 'Assignee site check',
      description: 'Testing site-scoped assignee validation',
      priority: 'medium',
    },
  });

  // Assigning to Tech B (who is only on Plant B) fails with USER_NOT_FOUND
  const assignFail = await request(
    'POST',
    `/incidents/${incident.id}/supervisor-review`,
    {
      cookie: supervisorCookie,
      expected: 404,
      body: { assignedToId: techBUserId },
    },
  );
  assert.equal(assignFail.code, 'USER_NOT_FOUND');

  // Assigning to technician with access to Plant A succeeds
  const assignOk = await request(
    'POST',
    `/incidents/${incident.id}/supervisor-review`,
    {
      cookie: supervisorCookie,
      expected: 201,
      body: { assignedToId: techId },
    },
  );
  assert.equal(assignOk.assignedTo.id, techId);

  // GET /api/v1/incidents/assignees?siteId=... returns only site-eligible assignees
  const siteAssignees = await request(
    'GET',
    `/incidents/assignees?siteId=${plantASiteId}`,
    {
      cookie: supervisorCookie,
    },
  );
  assert.ok(siteAssignees.some((u) => u.id === techId));
  assert.ok(siteAssignees.some((u) => u.id === supervisorId));
  assert.equal(
    siteAssignees.some((u) => u.id === techBUserId),
    false,
    'Tech B should not appear in Plant A assignees list',
  );
});
