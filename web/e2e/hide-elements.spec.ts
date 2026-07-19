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

test('hiding a connector removes it from the canvas but keeps it in the YAML; unhide restores it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const yamlBefore = await page.getByTestId('yaml-source').inputValue();

  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();

  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(0);
  const yamlAfterHide = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfterHide).toBe(yamlBefore);

  const svg = await exportSVG(page);
  expect(svg).not.toContain('HTTPS запит на вхід');

  // Deselect first — the checkbox above still has focus, and Escape
  // while an editable element is focused is deliberately a no-op
  // (PLAN4.md step 12.7 didn't change that; see useDiagramEditing.ts's
  // `isEditableTarget` guard).
  await page.getByTestId('link-edit-hide-connection').blur();
  await page.keyboard.press('Escape');

  // Unhide restores it.
  await page.getByTestId('overview-link-0').click();
  await expect(page.getByTestId('link-edit-hide-connection')).toBeChecked();
  await page.getByTestId('link-edit-hide-connection').uncheck();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(1);
});

test('a hidden connector survives Export layout -> Import layout', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(0);

  const layout = await exportLayout(page);
  expect(layout.views.default.hiddenEdges).toContain('User->Gateway:request');

  const tmpLayoutPath = path.join(__dirname, '.tmp-hide-edge.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(layout));
  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCount(0);
  fs.unlinkSync(tmpLayoutPath);
});

test('hidden connections are marked with an eye badge in the diagram overview', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('link-edit-hide-connection').check();

  await page.getByTestId('link-edit-hide-connection').blur();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('diagram-overview')).toBeVisible();
  await expect(page.getByTestId('overview-link-hidden-0')).toBeVisible();
});

test('hiding a node label removes the text on the canvas and in the SVG export, keeping the shape', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.getByTestId('prop-hide-label').check();

  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-label-Gateway')).toHaveAttribute('data-hidden', 'true');

  const svg = await exportSVG(page);
  expect(svg).not.toContain('>Gateway<');

  await page.getByTestId('prop-hide-label').uncheck();
  await expect(page.getByTestId('rf-node-label-Gateway')).not.toHaveAttribute('data-hidden', 'true');
  await expect(page.getByTestId('rf-node-Gateway')).toContainText('Gateway');
});
