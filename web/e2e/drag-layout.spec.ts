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

test('dragging a node and exporting layout captures the new coordinates without touching the core YAML', async ({
  page,
}) => {
  const originalYAML = fs.readFileSync(authSystemPath, 'utf8');

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  const before = await exportLayout(page);
  expect(before.fileName).toBe('auth-system.layout.json');
  expect(Object.keys(before.content.views.default.positions)).toHaveLength(5);
  const beforePos = before.content.views.default.positions.Gateway;

  const gateway = page.getByTestId('node-Gateway');
  const box = await gateway.boundingBox();
  if (!box) throw new Error('Gateway node has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 80, { steps: 10 });
  await page.mouse.up();

  const after = await exportLayout(page);
  const afterPos = after.content.views.default.positions.Gateway;

  expect(afterPos.x).not.toBeCloseTo(beforePos.x, 0);
  expect(afterPos.y).not.toBeCloseTo(beforePos.y, 0);

  // The app never writes to disk on its own; the source file must be
  // byte-identical after all this interaction.
  const afterYAML = fs.readFileSync(authSystemPath, 'utf8');
  expect(afterYAML).toBe(originalYAML);
});

test('importing an exported layout restores the dragged position', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  const gateway = page.getByTestId('node-Gateway');
  const box = await gateway.boundingBox();
  if (!box) throw new Error('Gateway node has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 100, { steps: 10 });
  await page.mouse.up();

  const dragged = await exportLayout(page);
  const draggedPos = dragged.content.views.default.positions.Gateway;

  const tmpLayoutPath = path.join(__dirname, '..', 'e2e', '.tmp-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(dragged.content));

  // Reload fresh (positions reset to auto-layout), then import the
  // previously exported layout and confirm it restores the same position.
  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  const reExported = await exportLayout(page);
  const restoredPos = reExported.content.views.default.positions.Gateway;
  expect(restoredPos).toEqual(draggedPos);

  fs.unlinkSync(tmpLayoutPath);
});
