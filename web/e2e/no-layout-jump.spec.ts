import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

// HTML5 drag-and-drop needs real dragstart/drop DragEvents with a shared
// DataTransfer, which Playwright's synthetic mouse actions don't produce
// reliably across browsers — dispatch the events directly in-page instead.
async function dropPaletteItem(page: import('@playwright/test').Page, type: string, at: { x: number; y: number }) {
  await page.evaluate(
    ({ type, at }) => {
      const source = document.querySelector(`[data-testid="palette-item-${type}"]`) as HTMLElement;
      const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/dc-node-type', type);
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      canvas.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: at.x, clientY: at.y }));
    },
    { type, at },
  );
}

async function dragNode(page: import('@playwright/test').Page, testId: string, dx: number, dy: number) {
  const node = page.getByTestId(testId);
  const box = await node.boundingBox();
  if (!box) throw new Error(`${testId} has no bounding box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

async function exportPositions(page: import('@playwright/test').Page) {
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

test('dropping a node from the palette does not move any existing node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Give one node a manual position, like a user dragging it earlier.
  await dragNode(page, 'rf-node-Gateway', 120, 40);
  const before = await exportPositions(page);

  const canvas = page.getByTestId('reactflow-canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canvas has no bounding box');
  const dropAt = { x: canvasBox.x + 40, y: canvasBox.y + canvasBox.height - 40 };
  await dropPaletteItem(page, 'service', dropAt);
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  const after = await exportPositions(page);
  for (const id of Object.keys(before)) {
    expect(after[id].x).toBeCloseTo(before[id].x, 0);
    expect(after[id].y).toBeCloseTo(before[id].y, 0);
  }
});

test('deleting a node does not move the remaining nodes, and undo restores both', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const before = await exportPositions(page);

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('rf-node-Gateway').click();
  await page.getByTestId('delete-node').click();
  await expect(page.getByTestId('rf-node-Gateway')).toHaveCount(0);

  const afterDelete = await exportPositions(page);
  for (const id of Object.keys(afterDelete)) {
    expect(afterDelete[id].x).toBeCloseTo(before[id].x, 0);
    expect(afterDelete[id].y).toBeCloseTo(before[id].y, 0);
  }

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();

  const afterUndo = await exportPositions(page);
  for (const id of Object.keys(before)) {
    expect(afterUndo[id].x).toBeCloseTo(before[id].x, 0);
    expect(afterUndo[id].y).toBeCloseTo(before[id].y, 0);
  }
});

test('Re-layout all still repositions every node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dragNode(page, 'rf-node-Gateway', 200, 150);
  const dragged = await exportPositions(page);

  await openMenu(page, 'arrange');
  await page.getByTestId('menu-relayout-all').click();

  const afterRelayoutAll = await exportPositions(page);
  expect(afterRelayoutAll.Gateway.x).not.toBeCloseTo(dragged.Gateway.x, 0);
});
