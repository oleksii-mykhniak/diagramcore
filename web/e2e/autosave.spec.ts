import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

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

test('reloading with unsaved changes offers to restore them from the local autosave draft', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  // Let the ~1s debounced autosave write land before reloading.
  await page.waitForTimeout(1500);

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  // The freshly-loaded file doesn't have the dropped node yet.
  await expect(page.getByTestId('rf-node-service1')).toHaveCount(0);

  await expect(page.getByTestId('restore-autosave-banner')).toBeVisible();
  await page.getByTestId('restore-autosave-restore').click();

  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  await expect(page.getByTestId('restore-autosave-banner')).not.toBeVisible();
});

test('Discard keeps the freshly-loaded file and clears the draft so it does not reappear', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  await page.waitForTimeout(1500);

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('restore-autosave-banner')).toBeVisible();
  await page.getByTestId('restore-autosave-discard').click();
  await expect(page.getByTestId('restore-autosave-banner')).not.toBeVisible();
  await expect(page.getByTestId('rf-node-service1')).toHaveCount(0);

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('restore-autosave-banner')).not.toBeVisible();
});

test('Save clears the draft so reopening the file no longer offers to restore', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  await page.waitForTimeout(1500);

  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  await downloadPromise;

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('restore-autosave-banner')).not.toBeVisible();
});
