import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function dragHandle(
  page: import('@playwright/test').Page,
  from: { nodeId: string; pos: 'top' | 'bottom' },
  to: { nodeId: string; pos: 'top' | 'bottom' },
) {
  const sourceHandle = page.locator(`[data-nodeid="${from.nodeId}"][data-handlepos="${from.pos}"]`);
  const targetHandle = page.locator(`[data-nodeid="${to.nodeId}"][data-handlepos="${to.pos}"]`);
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('handle has no bounding box');

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
}

test('dragging a connection between two nodes adds a link to the YAML state', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const beforeEdgeCount = await page.locator('[data-testid^="rf-edge-link-"]').count();

  await dragHandle(page, { nodeId: 'User', pos: 'bottom' }, { nodeId: 'DB', pos: 'top' });

  await expect(page.locator('[data-testid^="rf-edge-link-"]')).toHaveCount(beforeEdgeCount + 1);
  const after = await page.getByTestId('yaml-source').inputValue();
  expect(after).toContain('to: DB\n    type: request');
});

test('dropping a connection in empty space creates no link', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const before = await page.getByTestId('yaml-source').inputValue();

  const sourceHandle = page.locator('[data-nodeid="User"][data-handlepos="bottom"]');
  const sourceBox = await sourceHandle.boundingBox();
  if (!sourceBox) throw new Error('handle has no bounding box');
  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas has no bounding box');

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width - 10, canvasBox.y + 10, { steps: 10 });
  await page.mouse.up();

  const after = await page.getByTestId('yaml-source').inputValue();
  expect(after).toBe(before);
});

test('hovering a link list item highlights the edge; deleting from the list removes it from the canvas and YAML', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openDock(page, 'links');
  await expect(page.getByTestId('links-panel')).toBeVisible();
  await page.getByTestId('link-item-0').hover();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveAttribute('data-hovered', 'true');

  await page.getByTestId('link-item-0').click();
  await page.getByTestId('link-delete-0').click();

  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(0);
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).not.toContain('HTTPS запит на вхід');
});
