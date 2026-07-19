import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

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

async function selectUserAndGateway(page: import('@playwright/test').Page) {
  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  const userBox = await page.getByTestId('rf-node-User').boundingBox();
  const gatewayBox = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!canvasBox || !userBox || !gatewayBox) throw new Error('missing bounding box');
  const top = Math.min(userBox.y, gatewayBox.y) - 20;
  const bottom = Math.max(userBox.y + userBox.height, gatewayBox.y + gatewayBox.height) + 20;
  await rubberBandSelect(page, canvasBox.x + 5, top, canvasBox.x + canvasBox.width - 5, bottom);
}

test('Ctrl+G groups the selection into a container that encloses them; dragging it moves both; undo removes it in one step', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const userBefore = await page.getByTestId('rf-node-User').boundingBox();
  const gatewayBefore = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!userBefore || !gatewayBefore) throw new Error('missing bounding box');
  const layoutBefore = await exportLayout(page);

  await selectUserAndGateway(page);
  await page.keyboard.press('Control+g');

  const groupNode = page.locator('[data-testid^="rf-node-group-"]');
  await expect(groupNode).toBeVisible();

  // Positions of the grouped nodes don't jump (PLAN4.md step 12.1
  // invariant) — compared via the exported (canvas-space) layout, not
  // screen bounding boxes: React Flow's `fitView` prop re-fits the
  // viewport whenever a node is added, which shifts on-screen pixel
  // coordinates for every node even though their own canvas coordinates
  // are untouched (same reasoning `no-layout-jump.spec.ts` already
  // follows for the same reason).
  const layoutAfter = await exportLayout(page);
  expect(layoutAfter.User.x).toBeCloseTo(layoutBefore.User.x, 0);
  expect(layoutAfter.User.y).toBeCloseTo(layoutBefore.User.y, 0);
  expect(layoutAfter.Gateway.x).toBeCloseTo(layoutBefore.Gateway.x, 0);
  expect(layoutAfter.Gateway.y).toBeCloseTo(layoutBefore.Gateway.y, 0);

  const yaml = await page.getByTestId('yaml-source').inputValue();
  const groupIdMatch = yaml.match(/id: (group-\d+)/);
  expect(groupIdMatch).toBeTruthy();
  const groupId = groupIdMatch![1];
  const parentCount = (yaml.match(new RegExp(`parent: ${groupId}`, 'g')) ?? []).length;
  expect(parentCount).toBe(2);

  // Dragging the group moves both children together. Baseline is taken
  // post-group (not the pre-group `userBefore`): `fitView` already
  // shifted screen-space coordinates once when the group node was added,
  // so comparing against the pre-group screen position would conflate
  // that viewport shift with the drag itself.
  const userPreDrag = await page.getByTestId('rf-node-User').boundingBox();
  if (!userPreDrag) throw new Error('missing bounding box');
  // Grab a point in the container's own left padding strip, vertically
  // centered — away from any edge/corner, where <NodeResizer>'s
  // resize-handle hit area sits (the group is selected right after
  // Ctrl+G, so handles are visible) and a mousedown there would resize
  // the container instead of dragging it. Computed from already-fetched
  // screen-space boxes so it's correct regardless of current zoom.
  const groupBox = await groupNode.boundingBox();
  if (!groupBox) throw new Error('group has no bounding box');
  const gatewayPreDrag = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!gatewayPreDrag) throw new Error('missing bounding box');
  const leftmostChildX = Math.min(userPreDrag.x, gatewayPreDrag.x);
  const grabX = (groupBox.x + leftmostChildX) / 2;
  const grabY = groupBox.y + groupBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 100, grabY + 80, { steps: 10 });
  await page.mouse.up();

  const userMoved = await page.getByTestId('rf-node-User').boundingBox();
  expect(userMoved?.x).toBeGreaterThan(userPreDrag.x + 50);

  // Undo removes the whole group in one step (structural op — position
  // drag above is layout-only and outside undo's YAML-scoped history).
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid^="rf-node-group-"]')).toHaveCount(0);
  const yamlAfterUndo = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfterUndo).not.toContain('parent:');
});

test('Ungroup restores the children without moving them, and removes the group node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await selectUserAndGateway(page);
  await page.keyboard.press('Control+g');
  const groupNode = page.locator('[data-testid^="rf-node-group-"]');
  await expect(groupNode).toBeVisible();

  const layoutBefore = await exportLayout(page);

  // A real mouse click on the group container can be intercepted by an
  // underlying `react-flow__edge-interaction` SVG path (the group's own
  // area is mostly transparent so edges beneath it remain hit-testable) —
  // dispatch the click directly on the node element instead, same
  // workaround used elsewhere in this suite for occluded rf-node/rf-edge
  // elements.
  await groupNode.dispatchEvent('click');
  await page.keyboard.press('Control+Shift+g');

  await expect(groupNode).toHaveCount(0);
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).not.toContain('parent:');

  const layoutAfter = await exportLayout(page);
  expect(layoutAfter.User.x).toBeCloseTo(layoutBefore.User.x, 0);
  expect(layoutAfter.User.y).toBeCloseTo(layoutBefore.User.y, 0);
  expect(layoutAfter.Gateway.x).toBeCloseTo(layoutBefore.Gateway.x, 0);
  expect(layoutAfter.Gateway.y).toBeCloseTo(layoutBefore.Gateway.y, 0);
});

test('grouping nodes at different nesting levels is blocked (menu item disabled)', async ({ page }) => {
  const nestedPath = path.join(__dirname, '..', '..', 'examples', 'nested.dc.yaml');
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Rubber-band the whole canvas: selects a mix of top-level containers
  // and their nested children, definitely spanning >1 nesting level.
  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas has no bounding box');
  await rubberBandSelect(page, canvasBox.x + 2, canvasBox.y + 2, canvasBox.x + canvasBox.width - 2, canvasBox.y + canvasBox.height - 2);

  await openMenu(page, 'edit');
  await expect(page.getByTestId('menu-group')).toBeDisabled();
});
