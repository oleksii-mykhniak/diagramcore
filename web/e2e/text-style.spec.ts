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

test('changing node text size/bold/color shows up immediately, leaves the YAML untouched, and matches the SVG export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const yamlBefore = await page.getByTestId('yaml-source').inputValue();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  await page.getByTestId('prop-text-font-size').selectOption('24');
  await page.getByTestId('prop-text-bold').click();
  await page.getByTestId('prop-text-color').fill('#ff8800');

  const label = page.getByTestId('rf-node-label-Gateway');
  await expect(label).toHaveCSS('font-size', '24px');
  await expect(label).toHaveCSS('font-weight', '700');
  await expect(label).toHaveCSS('color', 'rgb(255, 136, 0)');

  const yamlAfter = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfter).toBe(yamlBefore);

  const svg = await exportSVG(page);
  expect(svg).toContain('font-size="24"');
  expect(svg).toContain('font-weight="bold"');
  expect(svg).toContain('fill="#ff8800"');
});

test('a node text override survives Export layout -> Import layout', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.getByTestId('prop-text-font-size').selectOption('28');
  await page.getByTestId('prop-text-italic').click();

  const layout = await exportLayout(page);
  expect(layout.views.default.styles.Gateway.text).toEqual({ fontSize: 28, italic: true });

  const tmpLayoutPath = path.join(__dirname, '.tmp-text-style-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(layout));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  await expect(page.getByTestId('rf-node-label-Gateway')).toHaveCSS('font-size', '28px');
  await expect(page.getByTestId('rf-node-label-Gateway')).toHaveCSS('font-style', 'italic');

  fs.unlinkSync(tmpLayoutPath);
});

test('Reset text clears the node text override back to the default', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.getByTestId('prop-text-font-size').selectOption('24');
  await expect(page.getByTestId('prop-reset-text')).toBeEnabled();

  await page.getByTestId('prop-reset-text').click();
  await expect(page.getByTestId('rf-node-label-Gateway')).not.toHaveCSS('font-size', '24px');
  await expect(page.getByTestId('prop-reset-text')).toBeDisabled();
});

test('node text align moves the label left/center/right on the canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  const label = page.getByTestId('rf-node-label-Gateway');

  await page.getByTestId('prop-text-align-left').click();
  await expect(label).toHaveCSS('text-align', 'left');

  await page.getByTestId('prop-text-align-right').click();
  await expect(label).toHaveCSS('text-align', 'right');
});

test('changing an edge label size/color shows up immediately and matches the SVG export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('overview-link-0').click();
  await page.getByTestId('link-text-font-size').selectOption('18');
  await page.getByTestId('link-text-color').fill('#00ff00');
  await page.mouse.move(10, 10);

  const label = page.getByTestId('rf-edge-label-link-0-User-Gateway');
  await expect(label).toHaveCSS('font-size', '18px');
  await expect(label).toHaveCSS('color', 'rgb(0, 255, 0)');

  const svg = await exportSVG(page);
  expect(svg).toContain('font-size="18"');
  expect(svg).toContain('fill="#00ff00"');
});
