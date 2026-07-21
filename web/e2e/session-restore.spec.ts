import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(__dirname, '..', '..', 'examples');
const authSystemPath = path.join(examplesDir, 'auth-system.dc.yaml');
const oauthDetailPath = path.join(examplesDir, 'oauth-detail.dc.yaml');

async function dropPaletteItem(page: import('@playwright/test').Page, type: string) {
  await page.evaluate((type) => {
    const source = document.querySelector(`[data-testid="palette-item-${type}"]`) as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', type);
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 40, clientY: rect.y + 40 }),
    );
  }, type);
}

// The bug this fixes: reloading the page used to come back to a completely
// empty editor even though the edit was safely sitting in the IndexedDB
// autosave draft — nothing remembered that a document had been open at
// all. A plain reload (no re-picking the file) must now silently continue
// exactly where the user left off.
test('reloading a plain file silently continues the session instead of coming back empty', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  // Let both the content autosave (1s) and the session-shape write (0.5s)
  // debounces land before reloading.
  await page.waitForTimeout(1500);

  await page.reload();

  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  // Silent restore — no banner, unlike the pre-existing autosave-conflict flow.
  await expect(page.getByTestId('restore-autosave-banner')).not.toBeVisible();
  await expect(page.getByTestId('resume-session-banner')).not.toBeVisible();
});

test('a tab closed before reload does not reappear after the session is restored', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toBeVisible();

  await page.getByTestId('tab-close-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toHaveCount(0);

  await page.waitForTimeout(1000);
  await page.reload();

  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('tab-auth-system.dc.yaml')).toBeVisible();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toHaveCount(0);
});

test('reloading with nothing ever opened stays on the start screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('reactflow-canvas')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('reactflow-canvas')).toHaveCount(0);
});
