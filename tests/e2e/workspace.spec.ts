import { expect, test } from '@playwright/test';

test('shows seeded equipment memory and switches history with the asset', async ({
  page,
}) => {
  await page.goto('/');
  const memory = page.getByRole('region', { name: 'Equipment memory' });
  await expect(
    memory.getByRole('heading', { name: 'Repair history' }),
  ).toBeVisible();
  await expect(
    memory.getByText('Inspect L2 supply terminal if fault repeats.'),
  ).toBeVisible();
  await expect(
    memory.getByText('Source: M-204 maintenance records'),
  ).toBeVisible();
  await page.getByRole('button', { name: /P-101 Cooling Water Pump/ }).click();
  await expect(
    memory.getByText('Source: P-101 maintenance records'),
  ).toBeVisible();
  await expect(
    memory.getByText('Inspect L2 supply terminal if fault repeats.'),
  ).toHaveCount(0);
});

test('loads seeded equipment and switches asset context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Conveyor Drive Motor', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Start voice session/ }),
  ).toBeVisible();
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

test('shows the supervisor operations view and opens incident details', async ({
  page,
}) => {
  await page.goto('/supervisor');
  await expect(
    page.getByRole('heading', { name: 'Plant maintenance overview' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Plant summary' }),
  ).toContainText('ACTIVE INCIDENTS');
  await expect(
    page.getByRole('heading', { name: 'Equipment health' }),
  ).toBeVisible();
  await expect(page.getByText('M-204', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'all', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search supervisor incidents' })
    .fill('INC-1037');
  await expect(page.getByText('INC-1037', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open INC-1037' }).click();
  await expect(page.getByRole('dialog')).toContainText('INC-1037');
  await page.getByRole('button', { name: 'Close incident details' }).click();

  await page.getByRole('link', { name: 'Technician view' }).click();
  await expect(
    page.getByRole('heading', { name: 'Know your equipment.' }),
  ).toBeVisible();
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
