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

test('changing fill/stroke/width/line-style/rounded shows up immediately and leaves the YAML untouched', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const yamlBefore = await page.getByTestId('yaml-source').inputValue();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  const shapeRect = page.locator('[data-testid="rf-node-Gateway"] svg rect').first();

  await page.getByTestId('prop-style-fill').fill('#ff00ff');
  await expect(shapeRect).toHaveAttribute('fill', '#ff00ff');

  await page.getByTestId('prop-style-stroke').fill('#00ffff');
  await page.getByTestId('prop-style-stroke-width').selectOption('4');
  await page.getByTestId('prop-style-line-style').selectOption('dashed');
  await page.getByTestId('prop-style-rounded').check();

  // Gateway is still selected, so its stroke shows the selection accent
  // color rather than the override (by design — same precedence as the
  // active/visited flow-highlight colors). Select a different node to
  // see Gateway's resolved style as it renders normally.
  await page.getByTestId('rf-node-User').click();
  await expect(shapeRect).toHaveAttribute('stroke', '#00ffff');
  await expect(shapeRect).toHaveAttribute('stroke-width', '4');
  await expect(shapeRect).toHaveAttribute('stroke-dasharray', '6,4');
  const rx = await shapeRect.getAttribute('rx');
  expect(Number(rx)).toBeGreaterThan(0);

  const yamlAfter = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfter).toBe(yamlBefore);
});

test('Reset style clears the override back to the theme default', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  const shapeRect = page.locator('[data-testid="rf-node-Gateway"] svg rect').first();

  await page.getByTestId('prop-style-fill').fill('#ff00ff');
  await expect(shapeRect).toHaveAttribute('fill', '#ff00ff');
  await expect(page.getByTestId('reset-style')).toBeEnabled();

  await page.getByTestId('reset-style').click();
  await expect(shapeRect).not.toHaveAttribute('fill', '#ff00ff');
  await expect(page.getByTestId('reset-style')).toBeDisabled();
});

test('a style override survives Export layout -> Import layout', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await page.getByTestId('prop-style-fill').fill('#ff00ff');
  await page.getByTestId('prop-style-rounded').check();

  const layout = await exportLayout(page);
  expect(layout.views.default.styles.Gateway.fill).toBe('#ff00ff');
  expect(layout.views.default.styles.Gateway.rounded).toBe(true);

  const tmpLayoutPath = path.join(__dirname, '.tmp-style-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(layout));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  const shapeRect = page.locator('[data-testid="rf-node-Gateway"] svg rect').first();
  await expect(shapeRect).toHaveAttribute('fill', '#ff00ff');

  fs.unlinkSync(tmpLayoutPath);
});

test('the sketch render preset still draws the overridden fill/stroke', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await page.getByTestId('prop-style-fill').fill('#ff00ff');

  await openMenu(page, 'view');
  await page.getByTestId('menu-render-style-toggle').click();

  const svgHtml = await page.locator('[data-testid="rf-node-Gateway"] svg').innerHTML();
  expect(svgHtml).toContain('#ff00ff');
});
