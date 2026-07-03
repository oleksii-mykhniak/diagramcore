import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function exportLayout(page: import('@playwright/test').Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  return {
    fileName: download.suggestedFilename(),
    content: JSON.parse(fs.readFileSync(downloadPath, 'utf8')),
  };
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

test('dragging a node on the React Flow canvas and exporting layout captures the new coordinates without touching the core YAML', async ({
  page,
}) => {
  const originalYAML = fs.readFileSync(authSystemPath, 'utf8');

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();
  await page.getByTestId('canvas-toggle').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const before = await exportLayout(page);
  const beforePos = before.content.views.default.positions.Gateway;

  await dragNode(page, 'rf-node-Gateway', 120, 80);

  const after = await exportLayout(page);
  const afterPos = after.content.views.default.positions.Gateway;

  expect(afterPos.x).not.toBeCloseTo(beforePos.x, 0);
  expect(afterPos.y).not.toBeCloseTo(beforePos.y, 0);

  const afterYAML = fs.readFileSync(authSystemPath, 'utf8');
  expect(afterYAML).toBe(originalYAML);
});

test('importing a layout file previously exported from the SVG canvas restores positions on the React Flow canvas', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  await dragNode(page, 'node-Gateway', 150, 100);
  const dragged = await exportLayout(page);
  const draggedPos = dragged.content.views.default.positions.Gateway;

  const tmpLayoutPath = path.join(__dirname, '.tmp-rf-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(dragged.content));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();
  await page.getByTestId('canvas-toggle').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  const reExported = await exportLayout(page);
  const restoredPos = reExported.content.views.default.positions.Gateway;
  expect(restoredPos).toEqual(draggedPos);

  fs.unlinkSync(tmpLayoutPath);
});

test('Re-layout does not move nodes with a manual (imported) position', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  await dragNode(page, 'node-Gateway', 150, 100);
  const dragged = await exportLayout(page);
  const draggedPos = dragged.content.views.default.positions.Gateway;

  const tmpLayoutPath = path.join(__dirname, '.tmp-relayout-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(dragged.content));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();
  await page.getByTestId('canvas-toggle').click();
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  await page.getByTestId('relayout').click();

  const reExported = await exportLayout(page);
  const afterRelayoutPos = reExported.content.views.default.positions.Gateway;
  expect(Math.abs(afterRelayoutPos.x - draggedPos.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterRelayoutPos.y - draggedPos.y)).toBeLessThanOrEqual(1);

  fs.unlinkSync(tmpLayoutPath);
});
