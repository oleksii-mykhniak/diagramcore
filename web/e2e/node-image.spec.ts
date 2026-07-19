import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

// 1x1 red PNG.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

test('adding a custom image shows it on the canvas, the layout stores a path (not a data URI), the SVG export inlines a data URI, and Remove clears it', async ({
  page,
}) => {
  // No native FS in this test — the fallback path (plain download)
  // exercises without a picker. Must run before `goto` — an init
  // script registered after the page already loaded only applies to
  // the *next* navigation.
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  const downloadPromise = page.waitForEvent('download'); // the fallback image download
  await page.getByTestId('prop-image-input').setInputFiles({
    name: 'icon.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await downloadPromise;

  await expect(page.getByTestId('rf-node-image-Gateway')).toBeVisible();
  await expect(page.getByTestId('prop-image-preview')).toBeVisible();

  const layout = await exportLayout(page);
  const imagePath = layout.views.default.styles.Gateway.image as string;
  expect(imagePath).toMatch(/^assets\//);
  expect(imagePath).not.toMatch(/^data:/);

  const svg = await exportSVG(page);
  expect(svg).toContain('<image href="data:image/png;base64,');
  expect(svg).not.toContain(imagePath);

  await page.getByTestId('prop-image-remove').click();
  await expect(page.getByTestId('rf-node-image-Gateway')).toHaveCount(0);
  await expect(page.getByTestId('prop-image-preview')).toHaveCount(0);
});

test('opening a diagram whose layout references a missing image file does not crash — the node draws normally', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const tmpLayoutPath = path.join(__dirname, '.tmp-missing-image.layout.json');
  fs.writeFileSync(
    tmpLayoutPath,
    JSON.stringify({
      views: { default: { positions: {}, styles: { Gateway: { image: 'assets/does-not-exist.png' } } } },
    }),
  );

  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-image-Gateway')).toHaveCount(0);
  expect(pageErrors).toHaveLength(0);

  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('prop-image-missing')).toBeVisible();

  fs.unlinkSync(tmpLayoutPath);
});
