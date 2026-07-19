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

/** Rubber-band selects every node whose bounding box falls inside the
 * rectangle from (startX,startY) to (endX,endY), by holding Shift and
 * dragging from a point outside any node (React Flow's default rubber-
 * band gesture). */
async function rubberBandSelect(page: import('@playwright/test').Page, startX: number, startY: number, endX: number, endY: number) {
  await page.keyboard.down('Shift');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

test('rubber-band selects multiple nodes; group drag commits all positions in one update', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  const userBox = await page.getByTestId('rf-node-User').boundingBox();
  const gatewayBox = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!canvasBox || !userBox || !gatewayBox) throw new Error('element has no bounding box');

  // Clamped to the canvas itself — starting the drag outside it (e.g.
  // above it, in the header) never reaches React Flow's pane at all, so
  // no rubber-band gesture starts.
  const minX = Math.max(canvasBox.x + 5, Math.min(userBox.x, gatewayBox.x) - 30);
  const minY = Math.max(canvasBox.y + 5, Math.min(userBox.y, gatewayBox.y) - 30);
  const maxX = Math.min(canvasBox.x + canvasBox.width - 5, Math.max(userBox.x + userBox.width, gatewayBox.x + gatewayBox.width) + 30);
  const maxY = Math.min(canvasBox.y + canvasBox.height - 5, Math.max(userBox.y + userBox.height, gatewayBox.y + gatewayBox.height) + 30);

  await rubberBandSelect(page, minX, minY, maxX, maxY);

  const before = await exportLayout(page);

  // Drag from within the User node (now part of the multi-selection) —
  // both nodes should move together.
  const userCenter = { x: userBox.x + userBox.width / 2, y: userBox.y + userBox.height / 2 };
  await page.mouse.move(userCenter.x, userCenter.y);
  await page.mouse.down();
  await page.mouse.move(userCenter.x + 80, userCenter.y + 60, { steps: 10 });
  await page.mouse.up();

  // Screen-pixel deltas above don't translate 1:1 to exported layout
  // units (the canvas is auto-zoomed to fit the diagram) — what matters
  // for "group drag commits all positions in one update" is that both
  // selected nodes moved by the *same* delta, not a specific pixel count.
  const after = await exportLayout(page);
  const userDx = after.views.default.positions.User.x - before.views.default.positions.User.x;
  const userDy = after.views.default.positions.User.y - before.views.default.positions.User.y;
  const gatewayDx = after.views.default.positions.Gateway.x - before.views.default.positions.Gateway.x;
  const gatewayDy = after.views.default.positions.Gateway.y - before.views.default.positions.Gateway.y;
  expect(userDx).toBeGreaterThan(10);
  expect(userDy).toBeGreaterThan(10);
  expect(gatewayDx).toBeCloseTo(userDx, 0);
  expect(gatewayDy).toBeCloseTo(userDy, 0);
});

test('Delete removes every selected node (with a confirmation) and Undo restores them in one step', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const authBox = await page.getByTestId('rf-node-AuthService').boundingBox();
  const dbBox = await page.getByTestId('rf-node-DB').boundingBox();
  if (!authBox || !dbBox) throw new Error('node has no bounding box');

  const minX = Math.min(authBox.x, dbBox.x) - 30;
  const minY = Math.min(authBox.y, dbBox.y) - 30;
  const maxX = Math.max(authBox.x + authBox.width, dbBox.x + dbBox.width) + 30;
  const maxY = Math.max(authBox.y + authBox.height, dbBox.y + dbBox.height) + 30;
  await rubberBandSelect(page, minX, minY, maxX, maxY);

  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Delete');

  await expect(page.getByTestId('rf-node-AuthService')).toHaveCount(0);
  await expect(page.getByTestId('rf-node-DB')).toHaveCount(0);

  await openMenu(page, 'edit');
  await page.getByTestId('menu-undo').click();

  await expect(page.getByTestId('rf-node-AuthService')).toBeVisible();
  await expect(page.getByTestId('rf-node-DB')).toBeVisible();
});

test('Duplicate (Cmd/Ctrl+D) clones every selected node with a new id and offset position', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-OAuthProvider').click();
  await page.keyboard.press('Control+d');

  await expect(page.getByTestId('rf-node-OAuthProvider-copy')).toBeVisible();
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('id: OAuthProvider-copy');
});

test('Escape clears the selection', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('diagram-overview')).toBeVisible();
});

test('Edit menu Delete/Duplicate act on the current selection', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'edit');
  await expect(page.getByTestId('menu-delete-node')).toBeDisabled();
  await expect(page.getByTestId('menu-duplicate-node')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByTestId('rf-node-User').click();
  await openMenu(page, 'edit');
  await expect(page.getByTestId('menu-duplicate-node')).toBeEnabled();
  await page.getByTestId('menu-duplicate-node').click();

  await expect(page.getByTestId('rf-node-User-copy')).toBeVisible();
});
