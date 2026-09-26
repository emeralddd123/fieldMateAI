// Opt-in live provider test. Uses a fake microphone, no traces, and logs no tokens or audio.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const lookup = process.argv.includes('--lookup');
let page;
let stage = 'connect';
let lookupReturned = false;
let responseAfterLookup = false;
const counts = {
  ready: 0,
  input: 0,
  audio: 0,
  transcript: 0,
  ended: 0,
  toolCalls: 0,
  toolResults: 0,
  replyDone: 0,
};
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  if (lookup)
    await context.addInitScript(() => {
      const NativeWebSocket = globalThis.WebSocket;
      globalThis.WebSocket = class extends NativeWebSocket {
        constructor(...args) {
          super(...args);
          globalThis.__voiceTestSocket = this;
        }
      };
    });
  page = await context.newPage();
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      const event = JSON.parse(String(payload));
      if (event.type === 'input.audio') counts.input++;
      if (event.type === 'tool.result') counts.toolResults++;
      if (event.type === 'tool.result' && !event.is_error) {
        const result = JSON.parse(event.result);
        lookupReturned =
          result.matches?.some((asset) => asset.assetTag === 'P-101') ?? false;
      }
    });
    socket.on('framereceived', ({ payload }) => {
      const event = JSON.parse(String(payload));
      if (event.type === 'tool.call') counts.toolCalls++;
      if (event.type === 'reply.done') counts.replyDone++;
      if (event.type === 'session.ready') counts.ready++;
      if (event.type === 'reply.audio') counts.audio++;
      if (event.type === 'transcript.agent') {
        counts.transcript++;
        if (lookupReturned && /P.?101|Cooling Water Pump/i.test(event.text))
          responseAfterLookup = true;
      }
      if (event.type === 'session.ended') counts.ended++;
    });
  });
  await page.goto(process.env.TEST_WEB_URL || 'http://localhost:5173');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  if (lookup)
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
  stage = 'greeting';
  const deadline = Date.now() + 30000;
  while (
    Date.now() < deadline &&
    !(
      counts.ready &&
      counts.input &&
      counts.audio &&
      counts.transcript &&
      counts.replyDone
    )
  ) {
    if (
      await page
        .getByRole('button', { name: 'Retry voice session' })
        .isVisible()
    )
      throw new Error('Voice session failed');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(counts.ready && counts.input && counts.audio && counts.transcript);
  if (lookup) {
    stage = 'lookup response';
    await page.evaluate(() => {
      globalThis.__voiceTestSocket.send(
        JSON.stringify({
          type: 'conversation.message',
          role: 'user',
          content:
            'Find asset P-101 in the equipment register and tell me its name and location.',
        }),
      );
      globalThis.__voiceTestSocket.send(
        JSON.stringify({
          type: 'reply.create',
          instructions:
            'The technician requests equipment P-101. Call find_asset with query P-101, then tell them the returned name and location.',
        }),
      );
    });
    const lookupDeadline = Date.now() + 30000;
    while (Date.now() < lookupDeadline && !responseAfterLookup)
      await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(lookupReturned && responseAfterLookup);
    await page
      .getByRole('heading', { name: 'Cooling Water Pump', exact: true })
      .waitFor();
    console.log(
      'Live equipment lookup passed: provider tool call, database result, workspace selection, and spoken response transcript.',
    );
  }
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Start voice session' }).waitFor();
  assert.equal(counts.ended, 1);
  console.log(
    'Live voice smoke passed: session ready, microphone frames sent, greeting audio and transcript received, session ended.',
  );
} catch {
  console.error('Check progress:', {
    stage,
    ...counts,
    lookupReturned,
    responseAfterLookup,
  });
  console.error(
    'Live voice smoke failed. Check the workspace voice error and server configuration. No credentials were logged.',
  );
  process.exitCode = 1;
} finally {
  if (page) {
    const end = page.getByRole('button', {
      name: /End session|Cancel connection/,
    });
    if (await end.isVisible().catch(() => false)) {
      await end.click().catch(() => {});
      await page
        .getByRole('button', { name: 'Start voice session' })
        .waitFor({ timeout: 3000 })
        .catch(() => {});
    }
  }
  await browser.close();
}
