import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('theme toggle switches computed body background and persists across reload', async ({ page }) => {
  await page.goto('/');

  const initialBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).not.toBe(initialBg);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const reloadedBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(reloadedBg).toBe(darkBg);
});

/** Smoke coverage for the dark theme (PLAN.md step 10.13's "smoke-набір
 * в обох темах" AC) — the rest of the suite exercises the light (default)
 * theme; this walks the same core workflow (open, edit, add a note,
 * toggle sketch style, open the export dialog) once under dark to catch
 * anything that's only broken/invisible against a dark background. */
test('core workflow (open, edit, note, sketch style, export dialog) works under the dark theme', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('rf-node-User')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.getByTestId('prop-label').fill('Renamed User');
  await expect(page.getByTestId('rf-node-User')).toContainText('Renamed User');

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-note"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'note');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }),
    );
  });
  await expect(page.getByTestId('rf-note-note1')).toBeVisible();

  await openMenu(page, 'view');
  await page.getByTestId('menu-render-style-toggle').click();
  await expect(page.getByTestId('reactflow-canvas')).toHaveAttribute('data-render-style', 'sketch');

  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await expect(page.getByTestId('export-render-style')).toContainText('Sketch');
});
