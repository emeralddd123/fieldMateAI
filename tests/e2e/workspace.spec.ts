import { expect, test } from '@playwright/test';

test('loads seeded equipment and switches asset context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Conveyor Drive Motor', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Equipment data connected')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Start voice session/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /P-101 Cooling Water Pump/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Cooling Water Pump', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No installed components recorded'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search equipment' })
    .fill('no-match');
  await expect(page.getByText('No matching equipment.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search equipment' }).fill('M-204');
  await page
    .getByRole('button', { name: /M-204 Conveyor Drive Motor/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Conveyor Drive Motor', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('shows an honest empty state', async ({ page }) => {
  await page.route('**/api/v1/assets', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No equipment yet' }),
  ).toBeVisible();
});

test('recovers after an API failure', async ({ page }) => {
  await page.route('**/api/v1/assets', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Unable to load equipment' }),
  ).toBeVisible();
  await page.unroute('**/api/v1/assets');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Conveyor Drive Motor', exact: true }),
  ).toBeVisible();
});
