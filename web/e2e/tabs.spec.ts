import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(__dirname, '..', '..', 'examples');
const authSystemPath = path.join(examplesDir, 'auth-system.dc.yaml');
const oauthDetailPath = path.join(examplesDir, 'oauth-detail.dc.yaml');

async function dropPaletteItem(page: import('@playwright/test').Page, type: string, x = 40, y = 40) {
  await page.evaluate(
    ({ type, x, y }) => {
      const source = document.querySelector(`[data-testid="palette-item-${type}"]`) as HTMLElement;
      const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/dc-node-type', type);
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + x, clientY: rect.y + y }));
    },
    { type, x, y },
  );
}

test('opening a diagram with details shows a tab per reachable file, all parsed up front', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await expect(page.getByTestId('tab-auth-system.dc.yaml')).toBeVisible();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toBeVisible();
  await expect(page.getByTestId('tab-auth-system.dc.yaml')).toHaveAttribute('data-active', 'true');
  // The main tab has no close button; the details tab does.
  await expect(page.getByTestId('tab-close-auth-system.dc.yaml')).toHaveCount(0);
  await expect(page.getByTestId('tab-close-oauth-detail.dc.yaml')).toBeVisible();
});

test('switching tabs is instant (no reparsing) and edits in each tab stay independent', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Switch to the details tab without ever double-clicking into it, and
  // add a node there.
  await page.getByTestId('tab-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
  await dropPaletteItem(page, 'storage');
  await expect(page.getByTestId('rf-node-storage1')).toBeVisible();

  // Back to the main tab: no storage1 here, and the original nodes are
  // still exactly as they were (nothing bled across tabs).
  await page.getByTestId('tab-auth-system.dc.yaml').click();
  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-storage1')).toHaveCount(0);

  // And the details tab still has the node we added there.
  await page.getByTestId('tab-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('rf-node-storage1')).toBeVisible();
});

test('double-clicking a details node switches to its tab', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-OAuthProvider').dblclick();

  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
});

test('closing a tab removes it; double-clicking its details node again reopens it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('tab-close-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toHaveCount(0);
  // Closing the active tab falls back to the main one.
  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();

  await page.getByTestId('rf-node-OAuthProvider').dblclick();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toBeVisible();
  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
});

test('undo is independent per tab', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'storage', 300, 200);
  await expect(page.getByTestId('rf-node-storage1')).toBeVisible();

  await page.getByTestId('tab-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
  await expect(page.getByTestId('undo')).toBeDisabled();

  await page.getByTestId('tab-auth-system.dc.yaml').click();
  await expect(page.getByTestId('undo')).toBeEnabled();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('rf-node-storage1')).toHaveCount(0);
});
