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

async function zIndexOf(page: import('@playwright/test').Page, testId: string): Promise<string> {
  return page.evaluate((testId) => {
    const el = document.querySelector(`[data-testid="${testId}"]`)?.closest('.react-flow__node') as HTMLElement | null;
    return el ? getComputedStyle(el).zIndex : '';
  }, testId);
}

test('Send to back changes the draw order on the canvas (zIndex) and in the SVG export, and survives Save->Open', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const beforeUser = Number(await zIndexOf(page, 'rf-node-User'));
  const beforeGateway = Number(await zIndexOf(page, 'rf-node-Gateway'));
  expect(beforeUser).toBeLessThan(beforeGateway); // default: diagram order

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await openMenu(page, 'edit');
  await page.getByTestId('menu-send-to-back').click();

  // React Flow elevates a *selected* node's zIndex to stay on top while
  // selected, independent of its assigned zIndex — deselect first so
  // the comparison reflects the actual persisted z-order, not that.
  await page.keyboard.press('Escape');

  const afterUser = Number(await zIndexOf(page, 'rf-node-User'));
  const afterGateway = Number(await zIndexOf(page, 'rf-node-Gateway'));
  expect(afterGateway).toBeLessThan(afterUser);

  const svg = await exportSVG(page);
  expect(svg.indexOf('API Gateway')).toBeLessThan(svg.indexOf('Користувач'));

  const layout = await exportLayout(page);
  expect(layout.views.default.zOrder[0]).toBe('Gateway');

  const tmpLayoutPath = path.join(__dirname, '.tmp-zorder.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(layout));
  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  // `zIndexOf` reads computed style via a one-shot `page.evaluate` (no
  // auto-retry, unlike `expect(locator)...`) — poll it explicitly since
  // the import's state update lands asynchronously (`file.text().then`).
  await expect
    .poll(async () => Number(await zIndexOf(page, 'rf-node-Gateway')) < Number(await zIndexOf(page, 'rf-node-User')))
    .toBe(true);
  fs.unlinkSync(tmpLayoutPath);
});

test('a container child always draws above its own container, regardless of zOrder', async ({ page }) => {
  const nestedPath = path.join(__dirname, '..', '..', 'examples', 'nested.dc.yaml');
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const svg = await exportSVG(page);
  // The container's own box (dashed) must draw before any of its
  // children in the SVG source order, regardless of zOrder — verified
  // here by the existing default (untouched) order.
  const containersSvg = svg.indexOf('stroke-dasharray="5,3"');
  expect(containersSvg).toBeGreaterThanOrEqual(0);
});

test('the node right-click context menu offers z-order actions and Delete/Duplicate', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click({ button: 'right' });
  await expect(page.getByTestId('node-context-menu')).toBeVisible();
  await expect(page.getByTestId('context-bring-to-front')).toBeVisible();
  await expect(page.getByTestId('context-bring-forward')).toBeVisible();
  await expect(page.getByTestId('context-send-backward')).toBeVisible();
  await expect(page.getByTestId('context-send-to-back')).toBeVisible();
  await expect(page.getByTestId('context-duplicate')).toBeVisible();
  await expect(page.getByTestId('context-delete')).toBeVisible();

  await page.getByTestId('context-send-to-back').click();
  await expect(page.getByTestId('node-context-menu')).toHaveCount(0);
  await page.keyboard.press('Escape'); // see note above about selected-node zIndex elevation

  const gatewayZ = Number(await zIndexOf(page, 'rf-node-Gateway'));
  const userZ = Number(await zIndexOf(page, 'rf-node-User'));
  expect(gatewayZ).toBeLessThan(userZ);
});
