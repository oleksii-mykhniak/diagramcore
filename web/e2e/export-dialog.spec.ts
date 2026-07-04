import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function openExportDialog(page: import('@playwright/test').Page) {
  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
}

test('exporting as SVG downloads a file starting with <svg containing node shapes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openExportDialog(page);
  await page.getByTestId('export-format').selectOption('svg');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const svg = fs.readFileSync(downloadPath!, 'utf8');
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toContain('<ellipse'); // User (actor) node
});

test('exporting PNG at 2x scale doubles the decoded image dimensions', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openExportDialog(page);
  await page.getByTestId('export-scale').selectOption('1');
  const download1xPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download1x = await download1xPromise;
  const dims1x = await imageDimensions(await download1x.path());

  await openExportDialog(page);
  await page.getByTestId('export-scale').selectOption('2');
  const download2xPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download2x = await download2xPromise;
  const dims2x = await imageDimensions(await download2x.path());

  expect(dims2x.width).toBe(dims1x.width * 2);
  expect(dims2x.height).toBe(dims1x.height * 2);
});

test('PNG with transparent background has alpha; JPG disables the transparent option', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openExportDialog(page);
  await page.getByTestId('export-background').selectOption('transparent');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const hasAlpha = await pngHasAlpha(await download.path());
  expect(hasAlpha).toBe(true);

  await openExportDialog(page);
  await page.getByTestId('export-format').selectOption('jpg');
  const transparentOptionDisabled = await page
    .getByTestId('export-background')
    .locator('option[value="transparent"]')
    .evaluate((el) => (el as HTMLOptionElement).disabled);
  expect(transparentOptionDisabled).toBe(true);

  const jpgDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const jpgDownload = await jpgDownloadPromise;
  expect(jpgDownload.suggestedFilename()).toBe('auth-system.jpg');
});

async function imageDimensions(filePath: string | null): Promise<{ width: number; height: number }> {
  if (!filePath) throw new Error('no download path');
  const buf = fs.readFileSync(filePath);
  // PNG: width/height are big-endian uint32 at bytes 16 and 20 (IHDR chunk).
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function pngHasAlpha(filePath: string | null): Promise<boolean> {
  if (!filePath) throw new Error('no download path');
  const buf = fs.readFileSync(filePath);
  // PNG color type byte is at offset 25; 6 = RGBA, 4 = grayscale+alpha.
  const colorType = buf.readUInt8(25);
  return colorType === 6 || colorType === 4;
}
