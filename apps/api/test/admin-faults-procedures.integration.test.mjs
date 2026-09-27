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

let motorAssetId = '';
let testProcedureId = '';
let testFaultId = '';
let incompatibleProcedureId = '';

async function cleanupTestKnowledge() {
  await pool.query("DELETE FROM fault_definitions WHERE fault_code LIKE 'TEST-%' OR fault_code = 'F0099'");
  await pool.query("DELETE FROM procedures WHERE key LIKE 'test-%'");
}

before(async () => {
  await cleanupTestKnowledge();

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

  const motorRes = await pool.query(
    "SELECT id FROM assets WHERE asset_tag = 'M-204' LIMIT 1",
  );
  motorAssetId = motorRes.rows[0].id;
});

after(async () => {
  await cleanupTestKnowledge();
  await pool.end();
});

test('1. Role enforcement: Only admin can access fault and procedure admin endpoints', async () => {
  // Unauthenticated -> 401
  await request('GET', '/admin/faults', { expected: 401 });
  await request('POST', '/admin/faults', { body: {}, expected: 401 });
  await request('GET', '/admin/procedures', { expected: 401 });
  await request('POST', '/admin/procedures', { body: {}, expected: 401 });

  // Technician -> 403
  await request('GET', '/admin/faults', { cookie: techCookie, expected: 403 });
  await request('POST', '/admin/faults', { cookie: techCookie, body: {}, expected: 403 });
  await request('GET', '/admin/procedures', { cookie: techCookie, expected: 403 });
  await request('POST', '/admin/procedures', { cookie: techCookie, body: {}, expected: 403 });

  // Supervisor -> 403
  await request('GET', '/admin/faults', { cookie: supervisorCookie, expected: 403 });
  await request('POST', '/admin/faults', { cookie: supervisorCookie, body: {}, expected: 403 });
  await request('GET', '/admin/procedures', { cookie: supervisorCookie, expected: 403 });
  await request('POST', '/admin/procedures', { cookie: supervisorCookie, body: {}, expected: 403 });

  // Admin -> 200
  const faultsRes = await request('GET', '/admin/faults', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(faultsRes.body.data.faults));

  const procRes = await request('GET', '/admin/procedures', { cookie: adminCookie, expected: 200 });
  assert.ok(Array.isArray(procRes.body.data.procedures));
});

test('2. Procedure administration lifecycle: draft, steps validation, conflict, approval gate, and withdrawal', async () => {
  // 1. Validation error when steps are empty
  const emptyStepsRes = await request('POST', '/admin/procedures', {
    cookie: adminCookie,
    body: {
      key: 'test-proc-empty',
      title: 'Invalid Empty Procedure',
      summary: 'Testing empty steps',
      steps: [],
    },
    expected: 400,
  });
  assert.equal(emptyStepsRes.body.error.code, 'VALIDATION_ERROR');

  // 2. Create procedure draft for Siemens VFD
  const createRes = await request('POST', '/admin/procedures', {
    cookie: adminCookie,
    body: {
      key: 'test-proc-vfd-overload',
      title: 'VFD Thermal Overload Diagnostic Protocol',
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      safetyLevel: 'electrical',
      safetyConfirmationRequired: true,
      summary: 'Verified inspection steps for Siemens VFD thermal trip condition.',
      steps: [
        'Confirm equipment is de-energized, locked out, and tagged out.',
        { text: 'Inspect heatsink cooling fan operation and clean air intake filters.', order: 2, type: 'action' },
        { text: 'Verify ambient cabinet temperature is within 0-40C threshold.', order: 3, type: 'verification' },
        { text: 'Measure line input currents to check for phase imbalance.', order: 4, type: 'action' },
      ],
      source: 'OEM Service Manual Vol 4',
    },
    expected: 201,
  });

  const proc = createRes.body.data;
  assert.equal(proc.key, 'test-proc-vfd-overload');
  assert.equal(proc.status, 'draft');
  assert.equal(proc.approved, false);
  assert.equal(proc.steps.length, 4);
  testProcedureId = proc.id;

  // 3. Conflict on duplicate procedure key
  const dupRes = await request('POST', '/admin/procedures', {
    cookie: adminCookie,
    body: {
      key: 'TEST-PROC-VFD-OVERLOAD',
      title: 'Duplicate Procedure',
      summary: 'Duplicate key test',
      steps: ['Step 1'],
    },
    expected: 409,
  });
  assert.equal(dupRes.body.error.code, 'PROCEDURE_KEY_EXISTS');

  // 4. Update draft details
  const updateRes = await request('PATCH', `/admin/procedures/${testProcedureId}`, {
    cookie: adminCookie,
    body: {
      title: 'VFD Thermal Overload Diagnostic Protocol (Rev 2)',
    },
    expected: 200,
  });
  assert.equal(updateRes.body.data.title, 'VFD Thermal Overload Diagnostic Protocol (Rev 2)');

  // 5. UNAPPROVED GATE: Technician requests procedure while in draft -> returns found: false
  const techQueryDraft = await request(
    'GET',
    `/procedures/test-proc-vfd-overload?assetId=${motorAssetId}`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(techQueryDraft.body.data.found, false);
  assert.match(techQueryDraft.body.data.message, /No approved procedure is available/);

  // 6. Admin approves procedure
  const approveRes = await request(
    'POST',
    `/admin/procedures/${testProcedureId}/approve`,
    {
      cookie: adminCookie,
      expected: 201,
    },
  );
  assert.equal(approveRes.body.data.approved, true);
  assert.equal(approveRes.body.data.status, 'approved');
  assert.equal(approveRes.body.data.approvedBy.id, adminId);

  // 7. APPROVED: Technician requests procedure now -> returns found: true and requires safety confirmation
  const techQueryApproved = await request(
    'GET',
    `/procedures/test-proc-vfd-overload?assetId=${motorAssetId}`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(techQueryApproved.body.data.found, true);
  assert.equal(techQueryApproved.body.data.requiresSafetyConfirmation, true);
  assert.deepEqual(techQueryApproved.body.data.procedure.steps, []);

  // When safe state is confirmed -> returns all 4 steps
  const techQueryConfirmed = await request(
    'GET',
    `/procedures/test-proc-vfd-overload?assetId=${motorAssetId}&safeStateConfirmed=true`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(techQueryConfirmed.body.data.found, true);
  assert.equal(techQueryConfirmed.body.data.requiresSafetyConfirmation, false);
  assert.equal(techQueryConfirmed.body.data.procedure.steps.length, 4);

  // 8. Admin withdraws procedure
  const withdrawRes = await request(
    'POST',
    `/admin/procedures/${testProcedureId}/withdraw`,
    {
      cookie: adminCookie,
      expected: 201,
    },
  );
  assert.equal(withdrawRes.body.data.approved, false);
  assert.equal(withdrawRes.body.data.status, 'withdrawn');

  // 9. WITHDRAWN GATE: Technician requests procedure again -> returns found: false immediately
  const techQueryWithdrawn = await request(
    'GET',
    `/procedures/test-proc-vfd-overload?assetId=${motorAssetId}`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(techQueryWithdrawn.body.data.found, false);
});

test('3. Fault definition administration: compatibility checks, unique conflict, voice exposure, and archival', async () => {
  // Re-approve the procedure so we can test linking it to a fault
  await request(
    'POST',
    `/admin/procedures/${testProcedureId}/approve`,
    {
      cookie: adminCookie,
      expected: 201,
    },
  );

  // 1. Create a separate procedure configured for a DIFFERENT manufacturer (Grundfos)
  const incompProcRes = await request('POST', '/admin/procedures', {
    cookie: adminCookie,
    body: {
      key: 'test-proc-grundfos-seal',
      title: 'Grundfos Mechanical Seal Inspection',
      manufacturer: 'Grundfos',
      model: 'CR-32',
      summary: 'Inspection steps for pump seal.',
      steps: ['Step 1: Check leakage drain'],
    },
    expected: 201,
  });
  incompatibleProcedureId = incompProcRes.body.data.id;

  // 2. Compatibility check: Linking Grundfos procedure to Siemens fault fails with 400 INCOMPATIBLE_PROCEDURE
  const incompRes = await request('POST', '/admin/faults', {
    cookie: adminCookie,
    body: {
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      faultCode: 'f 0099',
      title: 'Inverter Overload',
      description: 'Internal temperature or current overload detected.',
      procedureId: incompatibleProcedureId,
    },
    expected: 400,
  });
  assert.equal(incompRes.body.error.code, 'INCOMPATIBLE_PROCEDURE');

  // 3. Create fault definition with COMPATIBLE procedure link
  const createFaultRes = await request('POST', '/admin/faults', {
    cookie: adminCookie,
    body: {
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      faultCode: 'f 0099',
      title: 'Inverter Overload',
      description: 'Internal temperature or current overload detected.',
      safetyLevel: 'electrical',
      procedureId: testProcedureId,
    },
    expected: 201,
  });

  const fault = createFaultRes.body.data;
  assert.equal(fault.faultCode, 'F0099');
  assert.equal(fault.normalizedFaultCode, 'F0099');
  assert.equal(fault.procedureId, testProcedureId);
  testFaultId = fault.id;

  // 4. Duplicate fault conflict on same [manufacturer, model, faultCode]
  const dupFaultRes = await request('POST', '/admin/faults', {
    cookie: adminCookie,
    body: {
      manufacturer: 'Siemens',
      model: 'SINAMICS G120 (demo reference)',
      faultCode: 'F0099',
      title: 'Duplicate Fault',
      description: 'Duplicate',
    },
    expected: 409,
  });
  assert.equal(dupFaultRes.body.error.code, 'FAULT_CODE_EXISTS');

  // 5. IMMEDIATE TECHNICIAN & VOICE KNOWLEDGE EXPOSURE
  // Technician looks up fault on the motor asset (which has the Siemens VFD component)
  const lookupRes = await request(
    'GET',
    `/assets/${motorAssetId}/faults/F0099`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(lookupRes.body.data.found, true);
  assert.equal(lookupRes.body.data.faultCode, 'F0099');
  assert.equal(lookupRes.body.data.title, 'Inverter Overload');
  assert.equal(lookupRes.body.data.procedureKey, 'test-proc-vfd-overload');

  // 6. Update fault definition
  const updateFaultRes = await request('PATCH', `/admin/faults/${testFaultId}`, {
    cookie: adminCookie,
    body: {
      title: 'Inverter Overload & Heat Alarm',
    },
    expected: 200,
  });
  assert.equal(updateFaultRes.body.data.title, 'Inverter Overload & Heat Alarm');

  // 7. Archive fault definition
  const archiveFaultRes = await request('DELETE', `/admin/faults/${testFaultId}`, {
    cookie: adminCookie,
    expected: 200,
  });
  assert.equal(archiveFaultRes.body.data.archived, true);

  // 8. Archived fault definition is immediately hidden from technician lookup
  const lookupArchived = await request(
    'GET',
    `/assets/${motorAssetId}/faults/F0099`,
    {
      cookie: techCookie,
      expected: 200,
    },
  );
  assert.equal(lookupArchived.body.data.found, false);
});

test('4. Audit events are recorded for all procedure and fault mutations', async () => {
  const auditRes = await pool.query(
    `SELECT action, resource_type, resource_id
     FROM audit_events
     WHERE actor_user_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [adminId],
  );

  const actions = auditRes.rows.map((r) => r.action);
  assert.ok(actions.includes('admin.procedure.create'), 'admin.procedure.create recorded');
  assert.ok(actions.includes('admin.procedure.update'), 'admin.procedure.update recorded');
  assert.ok(actions.includes('admin.procedure.approve'), 'admin.procedure.approve recorded');
  assert.ok(actions.includes('admin.procedure.withdraw'), 'admin.procedure.withdraw recorded');
  assert.ok(actions.includes('admin.fault.create'), 'admin.fault.create recorded');
  assert.ok(actions.includes('admin.fault.update'), 'admin.fault.update recorded');
  assert.ok(actions.includes('admin.fault.archive'), 'admin.fault.archive recorded');
});
