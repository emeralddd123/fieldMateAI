import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import pg from 'pg';

// These tests write records and inject a database failure. Never target the working demo DB.
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
let motor, pump;
async function request(method, path, body, expected = 200) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return expected >= 400 ? result.error : result.data;
}
const create = (assetId, extra = {}) =>
  request(
    'POST',
    '/incidents',
    {
      assetId,
      title: 'Test incident',
      description: 'Reported issue',
      priority: 'high',
      ...extra,
    },
    201,
  );
const completion = (assetId, extra = {}) => ({
  assetId,
  rootCause: 'Loose L2 terminal',
  actionTaken: 'Tightened L2 terminal connection',
  verificationSummary: 'Motor running normally at 12.4 A',
  verificationMeasurement: {
    measurementType: 'motor_current',
    value: 12.4,
    unit: 'A',
  },
  ...extra,
});

before(async () => {
  const assets = await request('GET', '/assets');
  motor = assets.find((asset) => asset.assetTag === 'M-204');
  pump = assets.find((asset) => asset.assetTag === 'P-101');
  assert.ok(motor && pump);
  // Prove the direct SQL connection and HTTP API address the same test database.
  const row = await pool.query('SELECT id FROM assets WHERE asset_tag = $1', [
    'M-204',
  ]);
  assert.equal(row.rows[0].id, motor.id);
});
after(() => pool.end());

test('canonical F0003 scenario becomes durable equipment memory', async () => {
  const fault = await request('GET', `/assets/${motor.id}/faults/f%200003`);
  assert.equal(fault.title, 'Undervoltage');
  assert.match(fault.source, /Demo/);
  const path = `/procedures/${fault.procedureKey}?assetId=${motor.id}`;
  const gated = await request('GET', path);
  assert.equal(gated.requiresSafetyConfirmation, true);
  assert.deepEqual(gated.procedure.steps, []);
  assert.ok(
    (await request('GET', `${path}&safeStateConfirmed=true`)).procedure.steps
      .length > 0,
  );
  const prior = await request(
    'GET',
    `/assets/${motor.id}/history?faultCode=F0003`,
  );
  assert.equal(prior.totalMatchingIncidents, 2);
  assert.deepEqual(
    prior.incidents.map((item) => item.incidentNumber),
    ['INC-1037', 'INC-1021'],
  );
  assert.ok(prior.incidents[0].notes.some((note) => note.note.includes('L2')));
  const reading = await request(
    'POST',
    '/measurements',
    {
      assetId: motor.id,
      measurementType: 'line_voltage',
      value: 347,
      unit: 'V',
    },
    201,
  );
  assert.equal(reading.value, 347);
  const incident = await create(motor.id, {
    faultCode: 'F0003',
    measurementIds: [reading.id],
  });
  assert.equal(incident.incidentNumber, 'INC-1048');
  assert.equal(incident.measurements[0].id, reading.id);
  assert.equal((await request('GET', `/assets/${motor.id}`)).status, 'down');
  await request(
    'POST',
    `/incidents/${incident.id}/notes`,
    { note: 'Breaker already checked.' },
    201,
  );
  await request('PATCH', `/incidents/${incident.id}`, {
    status: 'investigating',
  });
  const body = completion(motor.id);
  const results = await Promise.all(
    [0, 1].map(() =>
      request('POST', `/incidents/${incident.id}/complete-repair`, body, 201),
    ),
  );
  const result = results[0];
  assert.equal(result.incident.status, 'resolved');
  assert.equal(result.asset.status, 'operational');
  assert.equal(result.maintenanceRecord.id, results[1].maintenanceRecord.id);
  assert.equal(result.measurements.length, 2);
  assert.equal(
    result.measurements.filter((item) => item.value === 12.4).length,
    1,
  );
  assert.equal(result.incident.completionPayload, undefined);
  const later = await request(
    'GET',
    `/assets/${motor.id}/history?faultCode=F0003`,
  );
  assert.equal(later.totalMatchingIncidents, 3);
  assert.equal(later.maintenanceRecords[0].rootCause, 'Loose L2 terminal');
  assert.equal(later.maintenanceRecords[0].technician.name, 'Demo Technician');
  assert.equal(
    (
      await request(
        'POST',
        `/incidents/${incident.id}/resolve`,
        { ...body, rootCause: 'Different cause' },
        409,
      )
    ).code,
    'INCIDENT_FINISHED',
  );
  await request('PATCH', `/incidents/${incident.id}`, { status: 'closed' });
  assert.equal(
    (await request('POST', `/incidents/${incident.id}/resolve`, body, 201))
      .maintenanceRecord.id,
    result.maintenanceRecord.id,
  );
});

test('unknown and unapproved knowledge cannot fall back to another equipment model', async () => {
  for (const [assetId, code] of [
    [motor.id, 'F0099'],
    [motor.id, 'F3'],
    [pump.id, 'F0003'],
  ]) {
    assert.equal(
      (await request('GET', `/assets/${assetId}/faults/${code}`)).found,
      false,
    );
  }
  assert.equal(
    (
      await request(
        'GET',
        `/procedures/vfd-undervoltage-check?assetId=${pump.id}&safeStateConfirmed=true`,
      )
    ).found,
    false,
  );
  await pool.query('UPDATE procedures SET approved = false WHERE key = $1', [
    'vfd-undervoltage-check',
  ]);
  try {
    assert.equal(
      (
        await request(
          'GET',
          `/procedures/vfd-undervoltage-check?assetId=${motor.id}&safeStateConfirmed=true`,
        )
      ).found,
      false,
    );
    assert.equal(
      (await request('GET', `/assets/${motor.id}/faults/F0003`)).procedureKey,
      null,
    );
  } finally {
    await pool.query('UPDATE procedures SET approved = true WHERE key = $1', [
      'vfd-undervoltage-check',
    ]);
  }
});

test('invalid inputs and cross-asset references are rejected without partial writes', async () => {
  const incident = await create(pump.id);
  const bad = await request(
    'POST',
    '/measurements',
    {
      assetId: motor.id,
      incidentId: incident.id,
      measurementType: 'line_voltage',
      value: 347,
      unit: 'V',
    },
    409,
  );
  assert.equal(bad.code, 'ASSET_MISMATCH');
  assert.equal(
    (
      await request(
        'POST',
        `/incidents/${incident.id}/complete-repair`,
        completion(motor.id),
        409,
      )
    ).code,
    'ASSET_MISMATCH',
  );
  assert.equal(
    (
      await request(
        'PATCH',
        `/incidents/${incident.id}`,
        { status: 'closed' },
        409,
      )
    ).code,
    'INVALID_TRANSITION',
  );
  for (const fields of [
    { value: '347' },
    { unit: 'A' },
    { value: -1 },
    { unit: null },
    { value: 1.1234567 },
  ]) {
    await request(
      'POST',
      '/measurements',
      {
        assetId: motor.id,
        measurementType: 'line_voltage',
        value: 347,
        unit: 'V',
        ...fields,
      },
      400,
    );
  }
  await request(
    'POST',
    `/incidents/${incident.id}/complete-repair`,
    { ...completion(pump.id), verificationMeasurement: null },
    400,
  );
  await request('GET', `/assets/${motor.id}/history?limit=101`, undefined, 400);
  await request(
    'GET',
    `/procedures/vfd-undervoltage-check?assetId=${motor.id}&safeStateConfirmed=maybe`,
    undefined,
    400,
  );
  const reading = await request(
    'POST',
    '/measurements',
    {
      assetId: motor.id,
      measurementType: 'line_voltage',
      value: 350,
      unit: 'V',
    },
    201,
  );
  const before = (await request('GET', `/assets/${pump.id}/history`))
    .totalMatchingIncidents;
  await request(
    'POST',
    '/incidents',
    {
      assetId: pump.id,
      title: 'Invalid attachment',
      description: 'Cross-asset reading',
      measurementIds: [reading.id],
    },
    409,
  );
  assert.equal(
    (await request('GET', `/assets/${pump.id}/history`)).totalMatchingIncidents,
    before,
  );
  const missing = '00000000-0000-4000-8000-000000009999';
  assert.equal(
    (await request('GET', `/assets/${missing}/history`, undefined, 404)).code,
    'ASSET_NOT_FOUND',
  );
  await request(
    'POST',
    '/incidents',
    { assetId: missing, title: 'Unknown', description: 'Unknown equipment' },
    404,
  );
  await request(
    'POST',
    `/incidents/${incident.id}/complete-repair`,
    completion(pump.id),
    201,
  );
});

test('concurrent incident numbers are unique and other active incidents prevent operational status', async () => {
  const incidents = await Promise.all(
    Array.from({ length: 6 }, () => create(pump.id)),
  );
  assert.equal(new Set(incidents.map((item) => item.incidentNumber)).size, 6);
  const first = await request(
    'POST',
    `/incidents/${incidents[0].id}/complete-repair`,
    completion(pump.id),
    201,
  );
  assert.equal(first.asset.status, 'down');
  for (const incident of incidents.slice(1))
    await request(
      'POST',
      `/incidents/${incident.id}/complete-repair`,
      completion(pump.id),
      201,
    );
  assert.equal(
    (await request('GET', `/assets/${pump.id}`)).status,
    'operational',
  );
});

test('database failure rolls back verification, incident, maintenance record, and asset changes', async () => {
  const incident = await create(pump.id);
  await pool.query(`CREATE FUNCTION test_reject_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.verification = '__forced_failure__' THEN RAISE EXCEPTION 'Injected test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_record BEFORE INSERT ON maintenance_records FOR EACH ROW EXECUTE FUNCTION test_reject_record();`);
  try {
    await request(
      'POST',
      `/incidents/${incident.id}/complete-repair`,
      completion(pump.id, { verificationSummary: '__forced_failure__' }),
      500,
    );
    const unchanged = await request('GET', `/incidents/${incident.id}`);
    assert.equal(unchanged.status, 'open');
    assert.equal(unchanged.rootCause, null);
    assert.equal(unchanged.maintenanceRecord, null);
    assert.deepEqual(unchanged.measurements, []);
    assert.equal((await request('GET', `/assets/${pump.id}`)).status, 'down');
  } finally {
    await pool.query(
      'DROP TRIGGER test_reject_record ON maintenance_records; DROP FUNCTION test_reject_record();',
    );
  }
  await request(
    'POST',
    `/incidents/${incident.id}/complete-repair`,
    completion(pump.id),
    201,
  );
});

test('escalation is persisted and simulated, and linked work logs complete repairs', async () => {
  const incident = await create(pump.id, { faultCode: 'F0099' });
  const dto = {
    reason: 'No approved procedure',
    severity: 'supervisor_review',
  };
  const result = await request(
    'POST',
    `/incidents/${incident.id}/escalate`,
    dto,
    201,
  );
  const retry = await request(
    'POST',
    `/incidents/${incident.id}/escalate`,
    dto,
    201,
  );
  assert.equal(result.notification, 'simulated');
  assert.equal(result.escalation.id, retry.escalation.id);
  assert.equal(
    (await request('GET', `/incidents/${incident.id}`)).status,
    'escalated',
  );
  await request(
    'POST',
    '/maintenance-records',
    { ...completion(pump.id), symptom: 'Standalone inspection' },
    201,
  );
  assert.equal((await request('GET', `/assets/${pump.id}`)).status, 'down');
  const record = await request(
    'POST',
    '/maintenance-records',
    {
      ...completion(pump.id),
      incidentId: incident.id,
      faultCode: 'F0099',
      symptom: 'Reported issue',
    },
    201,
  );
  assert.equal(record.incidentId, incident.id);
  const completed = await request('GET', `/incidents/${incident.id}`);
  assert.equal(completed.status, 'resolved');
  assert.equal(completed.escalations[0].status, 'resolved');
  await request('POST', `/incidents/${incident.id}/escalate`, dto, 409);
});

test('voice measurement retries are durable and concurrent creates do not duplicate', async () => {
  const body = {
    assetId: pump.id,
    measurementType: 'line_voltage',
    value: 347,
    unit: 'V',
    source: 'voice',
    requestId: crypto.randomUUID(),
  };
  const [a, b] = await Promise.all([
    request('POST', '/measurements', body, 201),
    request('POST', '/measurements', body, 201),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.source, 'voice');
  assert.equal(a.requestHash, undefined);
  assert.equal(
    (await request('POST', '/measurements', { ...body, value: 348 }, 409)).code,
    'REQUEST_ID_REUSED',
  );
  assert.equal(
    (
      await request(
        'POST',
        '/measurements',
        { ...body, assetId: motor.id },
        409,
      )
    ).code,
    'REQUEST_ID_REUSED',
  );
  await request(
    'POST',
    '/measurements',
    { ...body, requestId: undefined },
    400,
  );
  const linked = await create(pump.id, { measurementIds: [a.id] });
  const retry = await request('POST', '/measurements', body, 201);
  assert.equal(retry.id, a.id);
  assert.equal(retry.incidentId, linked.id);
  const rows = await pool.query(
    'SELECT count(*)::int AS n FROM measurements WHERE request_id=$1',
    [body.requestId],
  );
  assert.equal(rows.rows[0].n, 1);
});

test('voice incident retries keep one incident and do not repeat status changes or reading links', async () => {
  const measurement = await request(
    'POST',
    '/measurements',
    {
      assetId: pump.id,
      measurementType: 'motor_current',
      value: 12.4,
      unit: 'A',
    },
    201,
  );
  const body = {
    assetId: pump.id,
    title: 'Voice incident',
    description: 'Reported by technician',
    priority: 'high',
    assetStatus: 'down',
    measurementIds: [measurement.id],
    source: 'voice',
    requestId: crypto.randomUUID(),
  };
  const [a, b] = await Promise.all([
    request('POST', '/incidents', body, 201),
    request('POST', '/incidents', body, 201),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.incidentNumber, b.incidentNumber);
  assert.equal(a.source, 'voice');
  assert.equal(a.requestHash, undefined);
  assert.equal(a.measurements[0].id, measurement.id);
  assert.equal(
    (await request('POST', '/incidents', { ...body, title: 'Changed' }, 409))
      .code,
    'REQUEST_ID_REUSED',
  );
  const updated = await request('PATCH', `/incidents/${a.id}`, {
    status: 'investigating',
  });
  const retry = await request('POST', '/incidents', body, 201);
  assert.equal(retry.status, updated.status);
  const invalidId = crypto.randomUUID();
  await request(
    'POST',
    '/incidents',
    { ...body, requestId: invalidId, measurementIds: [crypto.randomUUID()] },
    409,
  );
  const rows = await pool.query(
    'SELECT count(*)::int AS n FROM incidents WHERE request_id=$1',
    [invalidId],
  );
  assert.equal(rows.rows[0].n, 0);
  await request('POST', '/incidents', { ...body, requestId: undefined }, 400);
});
