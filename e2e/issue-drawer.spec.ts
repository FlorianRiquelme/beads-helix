import { expect, test } from '@playwright/test';

test.describe('Issue drawer — card click to detail route (8ua phase 2+3)', () => {
  test('clicking a card opens the drawer at /p/<pid>/i/<iid>', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e');
    await page.getByRole('link', { name: /Promotion ceremony/i }).click();
    await expect(page).toHaveURL(/\/p\/beads-helix-e2e\/i\/beads-helix-e2e-bbb$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    // Board must stay mounted behind the drawer.
    await expect(page.getByRole('heading', { name: 'idea' })).toBeVisible();
  });

  test('Esc closes the drawer and returns to /p/<pid> preserving search params', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e?priority=0&q=ceremony');
    await page.getByRole('link', { name: /Promotion ceremony/i }).click();
    await expect(page).toHaveURL(/\/i\/beads-helix-e2e-bbb/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page).toHaveURL(/\/p\/beads-helix-e2e\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('priority')).toBe('0');
    expect(url.searchParams.get('q')).toBe('ceremony');
  });

  test('X close button closes the drawer', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e');
    await page.getByRole('link', { name: /Promotion ceremony/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /close/i }).first().click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page).toHaveURL(/\/p\/beads-helix-e2e$/);
  });

  test('browser back button closes the drawer and preserves search params', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e?priority=2');
    await page.getByRole('link', { name: /Spike: investigate kanban density/i }).click();
    await expect(page).toHaveURL(/\/i\/beads-helix-e2e-aaa/);
    await page.goBack();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/p/beads-helix-e2e');
    expect(url.searchParams.get('priority')).toBe('2');
  });

  test('direct navigation to /p/<pid>/i/<iid> renders the drawer', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-ccc');
    await expect(page.getByRole('dialog')).toBeVisible();
    // Board is mounted behind it.
    await expect(page.getByRole('heading', { name: 'idea' })).toBeVisible();
  });

  test('direct navigation to an unknown iid shows a not-found banner', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/does-not-exist');
    await expect(page.getByTestId('issue-drawer-not-found')).toBeVisible();
  });

  test('`c` key while a card is focused copies the bd id without opening the drawer', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/p/beads-helix-e2e');
    const card = page.getByRole('link', { name: /Promotion ceremony/i });
    await card.focus();
    await page.keyboard.press('c');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('beads-helix-e2e-bbb');
    await expect(page).toHaveURL(/\/p\/beads-helix-e2e$/);
  });
});

test.describe('Issue drawer — detail content (8ua phase 4)', () => {
  test('renders markdown description with headings', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    await expect(page.getByRole('heading', { name: 'Spike: investigate kanban density' })).toHaveCount(2);
  });

  test('renders notes section when present', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    await expect(page.getByTestId('issue-notes')).toBeVisible();
    await expect(page.getByText('Pinned by FR for April review')).toBeVisible();
  });

  test('renders design in a collapsed details element', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    const details = page.getByTestId('issue-design');
    await expect(details).toBeVisible();
    const isOpen = await details.getAttribute('open');
    expect(isOpen).toBeNull();
  });

  test('renders metadata badges (priority, type, status)', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('P2')).toBeVisible();
    await expect(dialog.getByText('task')).toBeVisible();
    await expect(dialog.getByText('open', { exact: true })).toBeVisible();
  });

  test('renders "Copy bd update" button', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    await expect(page.getByRole('button', { name: /copy bd update/i })).toBeVisible();
  });
});

test.describe('Issue drawer — dependency weather (8ua phase 5)', () => {
  test('renders dependency weather block with open blockers', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    await expect(page.getByTestId('dependency-weather')).toBeVisible();
    await expect(page.getByTestId('rail-open-blockers')).toBeVisible();
    await expect(page.getByTestId('rail-open-blockers').getByText('Promotion ceremony for refined stage')).toBeVisible();
  });

  test('renders open dependents rail', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/beads-helix-e2e-aaa');
    await expect(page.getByTestId('rail-open-dependents')).toBeVisible();
    await expect(page.getByTestId('rail-open-dependents').getByText('Card click copies bd id')).toBeVisible();
  });
});

test.describe('Issue drawer — edge states (8ua phase 6)', () => {
  test('direct navigation to unknown iid shows 404 inside drawer with board visible', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e/i/does-not-exist');
    await expect(page.getByTestId('issue-drawer-not-found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'idea' })).toBeVisible();
  });
});
