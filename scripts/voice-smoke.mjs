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
let page;
const counts = { ready: 0, input: 0, audio: 0, transcript: 0, ended: 0 };
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  page = await context.newPage();
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      const event = JSON.parse(String(payload));
      if (event.type === 'input.audio') counts.input++;
    });
    socket.on('framereceived', ({ payload }) => {
      const event = JSON.parse(String(payload));
      if (event.type === 'session.ready') counts.ready++;
      if (event.type === 'reply.audio') counts.audio++;
      if (event.type === 'transcript.agent') counts.transcript++;
      if (event.type === 'session.ended') counts.ended++;
    });
  });
  await page.goto(process.env.TEST_WEB_URL || 'http://localhost:5173');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  const deadline = Date.now() + 30000;
  while (
    Date.now() < deadline &&
    !(counts.ready && counts.input && counts.audio && counts.transcript)
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
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Start voice session' }).waitFor();
  assert.equal(counts.ended, 1);
  console.log(
    'Live voice smoke passed: session ready, microphone frames sent, greeting audio and transcript received, session ended.',
  );
} catch {
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
