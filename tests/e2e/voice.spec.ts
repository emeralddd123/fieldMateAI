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
