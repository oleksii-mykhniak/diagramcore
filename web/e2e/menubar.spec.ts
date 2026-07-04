import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('File menu opens on click and closes on Escape or clicking outside', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('menubar')).toHaveAttribute('role', 'menubar');

  await openMenu(page, 'file');
  await expect(page.getByTestId('menu-file')).toBeVisible();
  await expect(page.getByTestId('menu-file')).toHaveAttribute('role', 'menu');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-file')).not.toBeVisible();

  await openMenu(page, 'file');
  await expect(page.getByTestId('menu-file')).toBeVisible();
  await page.mouse.click(10, 400);
  await expect(page.getByTestId('menu-file')).not.toBeVisible();
});

test('hovering another top-level menu while one is open switches to it', async ({ page }) => {
  await page.goto('/');

  await openMenu(page, 'file');
  await expect(page.getByTestId('menu-file')).toBeVisible();

  await page.getByTestId('menu-trigger-edit').hover();
  await expect(page.getByTestId('menu-file')).not.toBeVisible();
  await expect(page.getByTestId('menu-edit')).toBeVisible();
});

test('arrow keys navigate items within an open menu and Enter activates the focused one', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  // First enabled item ("New") is auto-focused on open.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('auth-system.dc.yaml');
});

test('all File menu actions carry their original testids and work', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  for (const testId of ['open-native', 'save', 'export-png', 'export-layout', 'export-context', 'export-flow-steps-zip', 'share']) {
    await expect(page.getByTestId(testId)).toBeAttached();
  }
});
