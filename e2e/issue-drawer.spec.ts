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
