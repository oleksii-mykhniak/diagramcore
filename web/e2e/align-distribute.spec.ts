import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function rubberBandSelect(page: import('@playwright/test').Page, startX: number, startY: number, endX: number, endY: number) {
  await page.keyboard.down('Shift');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

async function exportLayout(page: import('@playwright/test').Page) {
  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  const fs = await import('node:fs');
  const content = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
  return content.views.default.positions as Record<string, { x: number; y: number }>;
}

async function selectAll5(page: import('@playwright/test').Page) {
  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  if (!canvasBox) throw new Error('missing bounding box');
  await rubberBandSelect(page, canvasBox.x + 2, canvasBox.y + 2, canvasBox.x + canvasBox.width - 2, canvasBox.y + canvasBox.height - 2);
}

// Align/Distribute are layout-only (no YAML change), same as a plain
// node drag or resize — and, like those, currently fall outside the
// undo stack, which is scoped to YAML `rawText` snapshots only
// (`useHistory.ts`). Undoable layout state (drag/resize/align/
// distribute alike) is PLAN4.md step 12.13's "History refactor" scope,
// not this step's — see docs/deviations.md's step-12.12 entry.

test('Align top for 3+ nodes aligns their y', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await selectAll5(page);

  await openMenu(page, 'edit');
  await page.getByTestId('menu-align-top').click();

  const after = await exportLayout(page);
  const ys = Object.values(after).map((p) => p.y);
  for (const y of ys) expect(y).toBeCloseTo(ys[0], 0);
});

test('Distribute horizontally gives equal gaps between nodes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await selectAll5(page);

  await openMenu(page, 'edit');
  await page.getByTestId('menu-distribute-horizontal').click();

  const after = await exportLayout(page);
  // None of these nodes were ever resized, so every node has the default
  // width — equal x-deltas between consecutive (left-edge-sorted) nodes
  // is therefore equivalent to equal gaps between their edges.
  const ids = Object.keys(after).sort((a, b) => after[a].x - after[b].x);
  const deltas: number[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    deltas.push(after[ids[i + 1]].x - after[ids[i]].x);
  }
  for (const d of deltas) expect(d).toBeCloseTo(deltas[0], 0);
});

test('Align/Distribute menu items are disabled without enough selected nodes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'edit');
  await expect(page.getByTestId('menu-align-top')).toBeDisabled();
  await expect(page.getByTestId('menu-distribute-horizontal')).toBeDisabled();
});

test('shortcuts do not fire while typing in a text field', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  const before = await exportLayout(page);

  await openDock(page, 'yaml');
  await page.getByTestId('yaml-panel').locator('.cm-content').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');

  const after = await exportLayout(page);
  expect(Object.keys(after).length).toBe(Object.keys(before).length);
});
