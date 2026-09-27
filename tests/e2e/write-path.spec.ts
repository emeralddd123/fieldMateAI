import { expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';

test.skip(
  process.env.WRITE_E2E !== '1',
  'The canonical write test requires a freshly reset isolated test database.',
);

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

const credential = {
  token: 'test-only-token',
  expiresInSeconds: 60,
  maxSessionDurationSeconds: 600,
  sessionConfig: {
    system_prompt: 'Test',
    greeting: 'Hello',
    input: { format: { encoding: 'audio/pcm' }, keyterms: [] },
    output: { voice: 'alba', format: { encoding: 'audio/pcm' } },
    tools: [],
  },
};

test('@write completes the canonical maintenance write path through voice tools', async ({
  page,
  request,
}) => {
  const assetResponse = await request.get('/api/v1/assets/search?q=M204');
  expect(assetResponse.ok()).toBe(true);
  const asset = (await assetResponse.json()).data[0];
  expect(asset.assetTag).toBe('M-204');

  let socket: WebSocketRoute | undefined;
  const results: Array<{
    call_id: string;
    result: string;
    is_error: boolean;
  }> = [];
  await page.route('**/api/v1/voice/token', (route) =>
    route.fulfill({ json: { data: credential } }),
  );
  await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw));
      if (event.type === 'session.update')
        ws.send(
          JSON.stringify({ type: 'session.ready', session_id: 'write-path' }),
        );
      if (event.type === 'tool.result') results.push(event);
      if (event.type === 'session.end')
        ws.send(JSON.stringify({ type: 'session.ended' }));
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Voice session', exact: true })
      .getByRole('status'),
  ).toHaveText('Listening');

  let sequence = 0;
  const callWrite = async (
    name: string,
    args: Record<string, unknown>,
    expectedTitle: string,
  ) => {
    const callId = `write-${++sequence}`;
    const previousCount = results.length;
    socket!.send(
      JSON.stringify({ type: 'reply.started', reply_id: `reply-${callId}` }),
    );
    socket!.send(
      JSON.stringify({
        type: 'tool.call',
        call_id: callId,
        name,
        arguments: args,
      }),
    );
    socket!.send(
      JSON.stringify({
        type: 'reply.done',
        reply_id: `reply-${callId}`,
        status: 'completed',
      }),
    );

    const review = page.getByRole('region', {
      name: 'Review maintenance write',
    });
    await expect(review).toBeVisible();
    await expect(review.getByRole('heading')).toHaveText(expectedTitle);
    await review.getByRole('button', { name: 'Confirm and save' }).click();
    await expect.poll(() => results.length).toBe(previousCount + 1);
    const response = results.at(-1)!;
    expect(response.call_id).toBe(callId);
    expect(response.is_error).toBe(false);
    return JSON.parse(response.result);
  };

  const reading = await callWrite(
    'record_measurement',
    {
      asset_id: asset.id,
      measurement_type: 'line_voltage',
      value: 347,
      unit: 'V',
      notes: 'Measured at the drive input.',
    },
    'Review measurement',
  );
  expect(reading.success).toBe(true);
  expect(reading.value).toBe(347);

  const incident = await callWrite(
    'create_incident',
    {
      asset_id: asset.id,
      title: 'VFD F0003 undervoltage fault',
      description: 'Motor stopped during production; drive reported F0003.',
      fault_code: 'F0003',
      priority: 'high',
      asset_status: 'down',
      measurement_ids: [reading.id],
    },
    'Review new incident',
  );
  expect(incident.incidentNumber).toBe('INC-1048');

  const note = await callWrite(
    'add_incident_note',
    {
      incident_id: incident.id,
      note: 'Incoming voltage confirmed low at 347 V.',
    },
    'Review incident note',
  );
  expect(note.note).toContain('347 V');

  const escalation = await callWrite(
    'escalate_incident',
    {
      incident_id: incident.id,
      reason: 'Supervisor review requested before restoring power.',
      severity: 'supervisor_review',
    },
    'Review incident escalation',
  );
  expect(escalation.status).toBe('escalated');

  const resolution = await callWrite(
    'resolve_incident',
    {
      incident_id: incident.id,
      root_cause: 'Loose L2 terminal',
      action_taken: 'Tightened L2 terminal connection',
      resolution_summary: 'Motor restarted and is running normally at 12.4 A.',
      verification_measurement: {
        measurement_type: 'motor_current',
        value: 12.4,
        unit: 'A',
        notes: 'Stable after restart.',
      },
      asset_status: 'operational',
    },
    'Review repair resolution',
  );
  expect(resolution.incidentNumber).toBe('INC-1048');
  expect(resolution.status).toBe('operational');

  await expect(
    page.getByRole('region', { name: 'Maintenance save results' }),
  ).toContainText('Resolved incident INC-1048');

  const savedIncident = await request.get(`/api/v1/incidents/${incident.id}`);
  expect(savedIncident.ok()).toBe(true);
  const incidentData = (await savedIncident.json()).data;
  expect(incidentData.status).toBe('resolved');
  expect(incidentData.rootCause).toBe('Loose L2 terminal');
  expect(incidentData.notes).toContainEqual(
    expect.objectContaining({
      note: 'Incoming voltage confirmed low at 347 V.',
    }),
  );

  const savedAsset = await request.get(`/api/v1/assets/${asset.id}`);
  expect((await savedAsset.json()).data.status).toBe('operational');

  const historyResponse = await request.get(
    `/api/v1/assets/${asset.id}/history?faultCode=F0003&limit=10`,
  );
  const history = (await historyResponse.json()).data;
  expect(history.totalMatchingIncidents).toBe(3);
  expect(history.maintenanceRecords).toContainEqual(
    expect.objectContaining({
      rootCause: 'Loose L2 terminal',
      actionTaken: 'Tightened L2 terminal connection',
    }),
  );

  const measurementsResponse = await request.get(
    `/api/v1/assets/${asset.id}/measurements?limit=20`,
  );
  const measurements = (await measurementsResponse.json()).data;
  expect(measurements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: 347, unit: 'V' }),
      expect.objectContaining({ value: 12.4, unit: 'A' }),
    ]),
  );

  await page.getByRole('button', { name: 'End session' }).click();
  await expect(
    page.getByRole('button', { name: 'Start voice session' }),
  ).toBeVisible();
});
