import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function exportSVG(page: import('@playwright/test').Page): Promise<string> {
  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format').selectOption('svg');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  return fs.readFileSync(downloadPath, 'utf8');
}

test('Core view shows a hidden connector and a hidden label translucently with a badge; clicking the connector opens its properties; unhiding works from inside Core view; turning it off hides them again', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Hide a connector and a node label.
  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(0);

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.getByTestId('prop-hide-label').check();
  await expect(page.getByTestId('rf-node-label-Gateway')).toHaveAttribute('data-hidden', 'true');

  // Turn on Core view.
  await openMenu(page, 'view');
  await page.getByTestId('menu-core-view-toggle').click();

  const edge = page.getByTestId('rf-edge-link-0-User-Gateway');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveAttribute('data-ghost', 'true');

  const nodeLabel = page.getByTestId('rf-node-label-Gateway');
  await expect(nodeLabel).toHaveAttribute('data-ghost', 'true');
  await expect(page.getByTestId('rf-node-ghost-badge-Gateway')).toBeVisible();

  // Clicking the ghosted connector opens its properties.
  await edge.dispatchEvent('click');
  await expect(page.getByTestId('link-properties-panel')).toBeVisible();
  await expect(page.getByTestId('link-edit-hide-connection')).toBeChecked();

  // Unhide from inside Core view.
  await page.getByTestId('link-edit-hide-connection').uncheck();
  await expect(edge).not.toHaveAttribute('data-ghost', 'true');

  // Turning Core view off hides the still-hidden node label again.
  await openMenu(page, 'view');
  await page.getByTestId('menu-core-view-toggle').click();
  await expect(page.getByTestId('rf-node-label-Gateway')).toHaveAttribute('data-hidden', 'true');
});

test('SVG export ignores Core view — hidden elements never appear in it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();

  await openMenu(page, 'view');
  await page.getByTestId('menu-core-view-toggle').click();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(1);

  const svg = await exportSVG(page);
  expect(svg).not.toContain('HTTPS запит на вхід');
});
