import { expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';

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

test('captures microphone PCM, updates transcripts, interrupts playback and ends', async ({
  page,
}) => {
  let socket: WebSocketRoute | undefined;
  const frames: Buffer[] = [];
  let ends = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/voice/token', (route) =>
    route.fulfill({ json: { data: credential } }),
  );
  await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw));
      if (event.type === 'session.update')
        ws.send(
          JSON.stringify({ type: 'session.ready', session_id: 'test-session' }),
        );
      if (event.type === 'input.audio')
        frames.push(Buffer.from(event.audio, 'base64'));
      if (event.type === 'session.end') {
        ends++;
        ws.send(JSON.stringify({ type: 'session.ended' }));
      }
    });
  });
  await page.goto('/');
  const controls = page.getByRole('region', {
    name: 'Voice session',
    exact: true,
  });
  await controls.getByRole('button', { name: 'Start voice session' }).click();
  await expect(controls.getByRole('status')).toHaveText('Listening');
  await expect.poll(() => frames.length).toBeGreaterThan(3);
  expect(frames.every((frame) => frame.length === 960)).toBe(true);
  const send = (event: object) => socket!.send(JSON.stringify(event));
  send({ type: 'transcript.user.delta', item_id: 'user-1', text: 'My motor' });
  send({
    type: 'transcript.user',
    item_id: 'user-1',
    text: 'My motor stopped.',
  });
  await expect(
    page.getByText('My motor stopped.', { exact: true }),
  ).toHaveCount(1);
  send({ type: 'reply.started', reply_id: 'reply-1' });
  send({
    type: 'reply.audio',
    data: Buffer.alloc(24000 * 2 * 5).toString('base64'),
  });
  send({
    type: 'transcript.agent',
    item_id: 'agent-1',
    reply_id: 'reply-1',
    text: 'Tell me what happened.',
    interrupted: true,
  });
  await expect(controls.getByRole('status')).toHaveText(
    'FieldMate is speaking',
  );
  send({ type: 'reply.done', reply_id: 'reply-1', status: 'interrupted' });
  await expect(controls.getByRole('status')).toHaveText('Listening');
  await expect(
    page.getByText('Tell me what happened.', { exact: true }),
  ).toBeVisible();
  await controls.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(controls.getByRole('status')).toHaveText('Microphone muted');
  const mutedAt = frames.length;
  await expect.poll(() => frames.length).toBeGreaterThan(mutedAt + 3);
  expect(frames.at(-1)!.every((byte) => byte === 0)).toBe(true);
  await controls.getByRole('button', { name: 'End session' }).click();
  await expect(
    controls.getByRole('button', { name: 'Start voice session' }),
  ).toBeVisible();
  expect(ends).toBe(1);
  expect(errors).toEqual([]);
});

test('explains microphone permission denial without requesting a token', async ({
  page,
}) => {
  let tokenRequests = 0;
  await page.route('**/api/v1/voice/token', (route) => {
    tokenRequests++;
    return route.fulfill({ json: { data: credential } });
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Microphone access was denied',
  );
  await expect(
    page.getByRole('button', { name: 'Retry voice session' }),
  ).toBeVisible();
  expect(tokenRequests).toBe(0);
});

test('cancels a pending handshake and explicitly ends the provider session', async ({
  page,
}) => {
  let configured = false;
  let ends = 0;
  await page.route('**/api/v1/voice/token', (route) =>
    route.fulfill({ json: { data: credential } }),
  );
  await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw));
      if (event.type === 'session.update') configured = true;
      if (event.type === 'session.end') {
        ends++;
        ws.send(JSON.stringify({ type: 'session.ended' }));
      }
      expect(event.type).not.toBe('input.audio');
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  await expect.poll(() => configured).toBe(true);
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await expect(
    page.getByRole('button', { name: 'Start voice session' }),
  ).toBeVisible();
  expect(ends).toBe(1);
});

for (const scenario of ['unique', 'ambiguous', 'missing', 'unavailable']) {
  test(`voice equipment lookup: ${scenario}`, async ({ page }) => {
    let socket: WebSocketRoute | undefined;
    const results: { is_error: boolean; result: string }[] = [];
    await page.route('**/api/v1/voice/token', (route) =>
      route.fulfill({ json: { data: credential } }),
    );
    if (scenario === 'unavailable')
      await page.route('**/api/v1/assets/search?*', (route) =>
        route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE' } },
        }),
      );
    await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
      socket = ws;
      ws.onMessage((raw) => {
        const event = JSON.parse(String(raw));
        if (event.type === 'session.update')
          ws.send(
            JSON.stringify({ type: 'session.ready', session_id: 'test' }),
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
    const send = (event: object) => socket!.send(JSON.stringify(event));
    send({ type: 'reply.started', reply_id: 'fc-lookup' });
    send({
      type: 'tool.call',
      call_id: 'lookup',
      name: 'find_asset',
      arguments: {
        query:
          scenario === 'ambiguous'
            ? 'Conveyor'
            : scenario === 'missing'
              ? 'ZZZ-9999'
              : 'P101',
      },
    });
    send({ type: 'reply.done', reply_id: 'fc-lookup', status: 'completed' });
    await expect.poll(() => results.length).toBe(1);
    const lookups = page.getByRole('region', { name: 'Equipment lookups' });
    if (scenario === 'unique') {
      await expect(
        page.getByRole('heading', { name: 'Cooling Water Pump', exact: true }),
      ).toBeVisible();
      await expect(lookups).toContainText('Found P-101');
      expect(JSON.parse(results[0].result).matches[0].assetTag).toBe('P-101');
    } else {
      await expect(
        page.getByRole('heading', {
          name: 'Conveyor Drive Motor',
          exact: true,
        }),
      ).toBeVisible();
      await expect(lookups).toContainText(
        scenario === 'missing'
          ? 'No equipment matched'
          : scenario === 'ambiguous'
            ? 'Specify the asset tag'
            : 'Equipment search unavailable',
      );
    }
    expect(results[0].is_error).toBe(scenario === 'unavailable');
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('button', { name: 'Start voice session' }),
    ).toBeVisible();
  });
}

for (const scenario of ['fault', 'unknown', 'history', 'empty', 'failure']) {
  test(`voice maintenance knowledge: ${scenario}`, async ({
    page,
    request,
  }) => {
    const response = await request.get('/api/v1/assets/search?q=M204');
    const asset = (await response.json()).data[0];
    let socket: WebSocketRoute | undefined;
    const results: { is_error: boolean; result: string }[] = [];
    await page.route('**/api/v1/voice/token', (route) =>
      route.fulfill({ json: { data: credential } }),
    );
    if (scenario === 'failure')
      await page.route('**/api/v1/assets/*/faults/*', (route) =>
        route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE' } },
        }),
      );
    await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
      socket = ws;
      ws.onMessage((raw) => {
        const event = JSON.parse(String(raw));
        if (event.type === 'session.update')
          ws.send(
            JSON.stringify({ type: 'session.ready', session_id: 'knowledge' }),
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
    const send = (event: object) => socket!.send(JSON.stringify(event));
    send({ type: 'reply.started', reply_id: 'fc-knowledge' });
    send({
      type: 'tool.call',
      call_id: 'knowledge',
      name: ['history', 'empty'].includes(scenario)
        ? 'get_maintenance_history'
        : 'lookup_fault_code',
      arguments: {
        asset_id: asset.id,
        fault_code: ['unknown', 'empty'].includes(scenario)
          ? 'F999999'
          : 'F0003',
      },
    });
    send({ type: 'reply.done', reply_id: 'fc-knowledge', status: 'completed' });
    await expect.poll(() => results.length).toBe(1);
    const data = JSON.parse(results[0].result);
    const activity = page.getByRole('region', { name: 'Equipment lookups' });
    if (scenario === 'fault') {
      expect(data.found).toBe(true);
      await expect(activity).toContainText('Undervoltage');
      await expect(activity).toContainText('Source:');
    }
    if (scenario === 'unknown') {
      expect(data.found).toBe(false);
      await expect(activity).toContainText('no verified definition');
    }
    if (scenario === 'history') {
      expect(data.totalMatchingIncidents).toBe(2);
      await expect(activity).toContainText('Inspect L2 supply terminal');
      await expect(activity).toContainText('Source: M-204 maintenance records');
    }
    if (scenario === 'empty') {
      expect(data.totalMatchingIncidents).toBe(0);
      await expect(activity).toContainText('0 matching incidents');
    }
    expect(results[0].is_error).toBe(scenario === 'failure');
    if (scenario === 'failure')
      await expect(activity).toContainText('temporarily unavailable');
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('button', { name: 'Start voice session' }),
    ).toBeVisible();
  });
}

for (const action of ['confirm', 'decline', 'end', 'interrupt', 'missing']) {
  test(`approved voice procedure: ${action}`, async ({ page, request }) => {
    const asset = (
      await (await request.get('/api/v1/assets/search?q=M204')).json()
    ).data[0];
    let socket: WebSocketRoute | undefined;
    const results: { result: string; is_error: boolean }[] = [];
    const approvedRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('safeStateConfirmed=true'))
        approvedRequests.push(req.url());
    });
    await page.route('**/api/v1/voice/token', (route) =>
      route.fulfill({ json: { data: credential } }),
    );
    await page.routeWebSocket('wss://agents.assemblyai.com/v1/ws?*', (ws) => {
      socket = ws;
      ws.onMessage((raw) => {
        const event = JSON.parse(String(raw));
        if (event.type === 'session.update')
          ws.send(
            JSON.stringify({ type: 'session.ready', session_id: 'procedure' }),
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
    const send = (event: object) => socket!.send(JSON.stringify(event));
    send({ type: 'reply.started', reply_id: 'fc-procedure' });
    send({
      type: 'tool.call',
      call_id: 'procedure',
      name: 'get_approved_procedure',
      arguments: {
        asset_id: asset.id,
        procedure_key:
          action === 'missing'
            ? 'nonexistent-procedure'
            : 'vfd-undervoltage-check',
      },
    });
    send({ type: 'reply.done', reply_id: 'fc-procedure', status: 'completed' });
    const gate = page.getByRole('region', {
      name: 'Procedure safety confirmation',
    });
    if (action === 'missing') {
      await expect.poll(() => results.length).toBe(1);
      expect(JSON.parse(results[0].result).found).toBe(false);
      await expect(gate).toHaveCount(0);
    } else {
      await expect(gate).toBeVisible();
      await expect(gate).toContainText('M-204');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(results.length).toBe(0);
      expect(approvedRequests.length).toBe(0);
      if (action === 'confirm') {
        await gate
          .getByRole('button', {
            name: 'Confirm safe maintenance state',
            exact: true,
          })
          .click();
        await expect.poll(() => results.length).toBe(1);
        expect(
          JSON.parse(results[0].result).procedure.steps.length,
        ).toBeGreaterThan(0);
        expect(approvedRequests.length).toBe(1);
        await expect(
          page.getByRole('region', { name: 'Equipment lookups' }),
        ).toContainText('Source:');
      } else if (action === 'decline') {
        await gate.getByRole('button', { name: /Not ready/ }).click();
        await expect.poll(() => results.length).toBe(1);
        expect(JSON.parse(results[0].result).requiresSafetyConfirmation).toBe(
          true,
        );
        expect(JSON.parse(results[0].result).procedure).toBeUndefined();
      } else if (action === 'end')
        await page.getByRole('button', { name: 'End session' }).click();
      else
        send({
          type: 'reply.done',
          reply_id: 'fc-procedure',
          status: 'interrupted',
        });
      await expect(gate).toHaveCount(0);
    }
    if (action !== 'end')
      await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('button', { name: 'Start voice session' }),
    ).toBeVisible();
    if (action !== 'confirm') expect(approvedRequests.length).toBe(0);
    if (['end', 'interrupt'].includes(action)) expect(results.length).toBe(0);
  });
}
