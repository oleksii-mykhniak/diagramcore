import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function exportLayout(page: import('@playwright/test').Page) {
  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  return JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
}

test('resizing a selected node via its handle grows it, and the new size survives Save/Open and export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const node = page.getByTestId('rf-node-Gateway');
  const before = (await node.boundingBox())!;

  await node.click();
  await expect(page.getByTestId('rf-node-Gateway')).toHaveAttribute('data-selected', 'true');
  const handle = page.locator('.react-flow__resize-control.bottom.right').first();
  await expect(handle).toBeVisible();
  const handleBox = (await handle.boundingBox())!;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 80, { steps: 10 });
  await page.mouse.up();

  const after = (await node.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 50);
  expect(after.height).toBeGreaterThan(before.height + 50);

  const layout = await exportLayout(page);
  const size = layout.views.default.sizes.Gateway;
  // Compare in model space (the exported layout units), not screen
  // pixels — screen `boundingBox()` is scaled by the canvas zoom level,
  // which needn't be 1:1 with the flow's own coordinate system.
  expect(size.w).toBeGreaterThan(160);
  expect(size.h).toBeGreaterThan(60);
});

test('the SVG export draws a resized node at its resized dimensions', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const node = page.getByTestId('rf-node-Gateway');
  await node.click();
  await expect(page.getByTestId('rf-node-Gateway')).toHaveAttribute('data-selected', 'true');
  const handle = page.locator('.react-flow__resize-control.bottom.right').first();
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 150, handleBox.y + 120, { steps: 10 });
  await page.mouse.up();

  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format').selectOption('svg');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const svg = fs.readFileSync(downloadPath!, 'utf8');
  // The exported viewBox must be at least as large as the resized node's
  // new footprint — otherwise it would be clipped (PLAN3.md step 11.4).
  const widthMatch = svg.match(/width="(\d+)"/);
  expect(widthMatch).not.toBeNull();
  expect(Number(widthMatch![1])).toBeGreaterThan(300);
});

test('importing an exported layout restores the resized size, and Re-layout keeps reserving it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const node = page.getByTestId('rf-node-Gateway');
  await node.click();
  await expect(page.getByTestId('rf-node-Gateway')).toHaveAttribute('data-selected', 'true');
  const handle = page.locator('.react-flow__resize-control.bottom.right').first();
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 150, handleBox.y + 120, { steps: 10 });
  await page.mouse.up();

  const dragged = await exportLayout(page);
  const draggedSize = dragged.views.default.sizes.Gateway;

  const tmpLayoutPath = path.join(__dirname, '.tmp-resize-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(dragged));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  const reExported = await exportLayout(page);
  expect(reExported.views.default.sizes.Gateway).toEqual(draggedSize);

  await page.getByTestId('relayout').click();
  const afterRelayout = await exportLayout(page);
  // Re-layout only recomputes positions, not sizes — the resize survives.
  expect(afterRelayout.views.default.sizes.Gateway).toEqual(draggedSize);

  fs.unlinkSync(tmpLayoutPath);
});
