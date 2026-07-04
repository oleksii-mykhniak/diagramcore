import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('collapsing the YAML panel shrinks it and grows the canvas; state and content survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const openHeight = (await page.getByTestId('reactflow-canvas').boundingBox())!.height;
  await expect(page.getByTestId('yaml-panel')).toBeVisible();

  await page.getByTestId('yaml-panel-toggle').click();
  await expect(page.getByTestId('yaml-panel')).not.toBeVisible();
  const collapsedHeight = (await page.getByTestId('reactflow-canvas').boundingBox())!.height;
  expect(collapsedHeight).toBeGreaterThan(openHeight);

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('yaml-panel')).not.toBeVisible();

  await page.getByTestId('yaml-panel-toggle').click();
  await expect(page.getByTestId('yaml-panel')).toBeVisible();
  const text = await page.getByTestId('yaml-panel').locator('.cm-content').innerText();
  expect(text).toContain('id: User');
});

test('View > Grid off removes the background dots; settings survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.locator('.react-flow__background')).toBeVisible();

  await openMenu(page, 'view');
  await page.getByTestId('menu-grid-toggle').click();
  await expect(page.locator('.react-flow__background')).toHaveCount(0);

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.locator('.react-flow__background')).toHaveCount(0);
});

test('View > Snap to grid rounds a dragged node position to multiples of 10', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'view');
  await page.getByTestId('menu-snap-toggle').click();

  const node = page.getByTestId('rf-node-Gateway');
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 143, box.y + 97, { steps: 10 });
  await page.mouse.up();

  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const fs = await import('node:fs');
  const layout = JSON.parse(fs.readFileSync(downloadPath!, 'utf8'));
  const pos = layout.views.default.positions.Gateway;
  expect(pos.x % 10).toBe(0);
  expect(pos.y % 10).toBe(0);
});
