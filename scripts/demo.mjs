import assert from 'node:assert/strict';

const base = (process.env.FIELDMATE_API_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);

let sessionCookie = '';

async function login() {
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
  if (!response.ok) {
    throw new Error(`Demo login failed with status ${response.status}`);
  }
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';', 1)[0];
  }
}

async function api(method, path, body) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:5173',
  };
  if (sessionCookie) headers.cookie = sessionCookie;
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message || `Request failed: ${response.status}`,
    );
  return result.data;
}

console.log(
  'Running the maintenance demo. This creates a real incident, readings, and repair record.',
);
await login();
const matches = await api('GET', '/assets/search?q=M-204');
assert.equal(
  matches.length,
  1,
  'Seed the demo database before running this script.',
);
const assetId = matches[0].id;
const fault = await api('GET', `/assets/${assetId}/faults/F0003`);
assert.equal(fault.found, true);
console.log(`Found M-204: ${fault.title}. Source: ${fault.source}`);
const history = await api('GET', `/assets/${assetId}/history?faultCode=F0003`);
console.log(
  `Retrieved ${history.totalMatchingIncidents} prior matching incidents.`,
);
// This is a simulated demo confirmation, not confirmation for physical equipment work.
const procedure = await api(
  'GET',
  `/procedures/${fault.procedureKey}?assetId=${assetId}&safeStateConfirmed=true`,
);
assert.ok(procedure.procedure.steps.length);
const reading = await api('POST', '/measurements', {
  assetId,
  measurementType: 'line_voltage',
  value: 347,
  unit: 'V',
  notes: 'Simulated demo reading at drive input',
});
const incident = await api('POST', '/incidents', {
  assetId,
  title: 'VFD F0003 undervoltage fault',
  description: 'Motor stopped during production and drive reported F0003.',
  faultCode: 'F0003',
  priority: 'high',
  measurementIds: [reading.id],
});
console.log(
  `Recorded 347 V and opened ${incident.incidentNumber} at high priority.`,
);
await api('POST', `/incidents/${incident.id}/notes`, {
  note: 'Breaker already checked.',
});
const result = await api('POST', `/incidents/${incident.id}/complete-repair`, {
  assetId,
  rootCause: 'Loose L2 terminal',
  actionTaken: 'Tightened L2 terminal connection',
  verificationSummary: 'Motor running normally at 12.4 A',
  verificationMeasurement: {
    measurementType: 'motor_current',
    value: 12.4,
    unit: 'A',
  },
});
assert.equal(result.incident.status, 'resolved');
const later = await api('GET', `/assets/${assetId}/history?faultCode=F0003`);
assert.ok(
  later.maintenanceRecords.some(
    (record) => record.id === result.maintenanceRecord.id,
  ),
);
console.log(
  `Resolved ${incident.incidentNumber}; asset status: ${result.asset.status}.`,
);
console.log(
  `New repair is searchable. Matching incidents: ${later.totalMatchingIncidents}.`,
);
