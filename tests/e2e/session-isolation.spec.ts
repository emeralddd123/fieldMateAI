import { expect, test } from '@playwright/test';

test('service worker keeps authenticated responses out of persistent storage', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: baseURL! },
    data: { email: 'admin@fieldmate.test', password: 'fieldmate-test-admin' },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const results = await page.evaluate(async () => {
    const session = await fetch('/api/v1/auth/me');
    const assets = await fetch('/api/v1/assets');
    const keys = await caches.keys();
    const urls = (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((req) => req.url),
        ),
      )
    ).flat();
    return { session: session.status, assets: assets.status, urls };
  });
  expect(results.session).toBe(200);
  expect(results.assets).toBe(200);
  expect(
    results.urls.some((url) => new URL(url).pathname.startsWith('/api/')),
  ).toBe(false);
  await page.context().setOffline(true);
  const offlineSession = await page.evaluate(async () => {
    try {
      return (await fetch('/api/v1/auth/me')).status;
    } catch {
      return null;
    }
  });
  expect(offlineSession).not.toBe(200);
  await page.context().setOffline(false);
  await page.request.post('/api/v1/auth/logout', {
    headers: { Origin: baseURL! },
  });
});
