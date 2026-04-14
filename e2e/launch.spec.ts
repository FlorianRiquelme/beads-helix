import { expect, test } from '@playwright/test';

test.describe('helix flight deck Level 2 — golden path', () => {
  test('renders three columns of bucketed cards on /p/<projectId>', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e');

    // Priming header.
    await expect(page.getByRole('heading', { name: 'beads-helix-e2e' })).toBeVisible();
    await expect(page.getByTestId('priming-counts')).toContainText('2 idea');
    await expect(page.getByTestId('priming-detail')).toContainText('in progress');

    // Each column header + count pill.
    await expect(page.getByRole('heading', { name: 'idea' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'refined' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ready' })).toBeVisible();

    // Cards from each bucket.
    await expect(page.getByRole('link', { name: /Promotion ceremony/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Card click copies bd id/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Server SSE fans out updates/i })).toBeVisible();
  });

  test('priority filter narrows cards and reflects in the URL', async ({ page }) => {
    await page.goto('/p/beads-helix-e2e');
    await page.getByLabel(/priority/i).selectOption('0');
    await expect(page.getByRole('link', { name: /Promotion ceremony/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Card click copies bd id/i })).not.toBeVisible();
    await expect(page).toHaveURL(/priority=0/);
  });

  test('R key triggers a refresh without page reload', async ({ page }) => {
    let snapshotCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/snapshot')) snapshotCalls += 1;
    });
    await page.goto('/p/beads-helix-e2e');
    await expect(page.getByRole('link', { name: /Promotion ceremony/i })).toBeVisible();
    const callsAfterLoad = snapshotCalls;
    await page.keyboard.press('r');
    await expect.poll(() => snapshotCalls).toBeGreaterThan(callsAfterLoad);
  });

  test('clicking the short-id button copies the bd id', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/p/beads-helix-e2e');
    const card = page.getByRole('link', { name: /Promotion ceremony/i });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /copy id beads-helix-e2e-bbb/i }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('beads-helix-e2e-bbb');
    // Short-id button must NOT open the drawer.
    await expect(page).toHaveURL(/\/p\/beads-helix-e2e$/);
  });
});
