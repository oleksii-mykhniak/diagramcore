import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('History panel lists named steps for mixed edits; clicking the first jumps back (position + color), clicking the last jumps forward again', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // 1. Add a node.
  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-component"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'component');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 500, clientY: rect.y + 300 }));
  });
  await expect(page.getByTestId('rf-node-component1')).toBeVisible();

  // 2. Drag "User".
  const userBefore = await page.getByTestId('rf-node-User').boundingBox();
  if (!userBefore) throw new Error('missing bounding box');
  await page.mouse.move(userBefore.x + userBefore.width / 2, userBefore.y + userBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(userBefore.x + userBefore.width / 2 + 80, userBefore.y + userBefore.height / 2 + 60, { steps: 10 });
  await page.mouse.up();

  // 3. Change its fill color. The palette drop above already selected
  // the new node synchronously; a plain node click's selection commit
  // is deliberately deferred ~250ms (double-click disambiguation,
  // `FlowCanvas.tsx`), so waiting for the Properties panel to actually
  // say "User" (not just "visible", which it already was) is required
  // here — otherwise the fill can land on the still-selected new node.
  await page.getByTestId('rf-node-User').click();
  await expect(page.getByTestId('properties-panel')).toContainText('Node: User');
  await page.getByTestId('prop-style-fill').fill('#ff00aa');

  // 4. Hide the User -> Gateway connection.
  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();

  await openDock(page, 'history');
  const panel = page.getByTestId('history-panel');
  await expect(panel).toBeVisible();

  // steps[0] = "Open", then 4 more edits = 5 entries total.
  const entries = panel.locator('button[data-testid^="history-step-"]');
  await expect(entries).toHaveCount(5);
  await expect(page.getByTestId('history-step-0')).toContainText('Open');
  await expect(page.getByTestId('history-step-4')).toHaveAttribute('data-current', 'true');

  // Jumping to the first entry restores the pre-edit state entirely:
  // node gone, User back at its original position, fill reset.
  await page.getByTestId('history-step-0').click();
  await expect(page.getByTestId('rf-node-component1')).toHaveCount(0);
  const userAfterJumpBack = await page.getByTestId('rf-node-User').boundingBox();
  expect(userAfterJumpBack?.x).toBeCloseTo(userBefore.x, 0);
  expect(userAfterJumpBack?.y).toBeCloseTo(userBefore.y, 0);
  await page.getByTestId('rf-node-User').click();
  await expect(page.getByTestId('prop-style-fill')).not.toHaveValue('#ff00aa');

  // Jumping to the last entry restores the fully-edited state again —
  // the redo branch survived the jump back (non-destructive). Selecting
  // "User" above auto-switched the dock to Properties; reopen History.
  await openDock(page, 'history');
  await page.getByTestId('history-step-4').click();
  await expect(page.getByTestId('rf-node-component1')).toBeVisible();
  await openDock(page, 'properties');
  await expect(page.getByTestId('prop-style-fill')).toHaveValue('#ff00aa');
});
