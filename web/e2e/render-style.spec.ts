import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('View > Diagram style > sketch changes the canvas and SVG export; a share-link reload preserves it', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await expect(page.getByTestId('reactflow-canvas')).toHaveAttribute('data-render-style', 'clean');

  await openMenu(page, 'view');
  await page.getByTestId('menu-render-style-toggle').click();

  await expect(page.getByTestId('reactflow-canvas')).toHaveAttribute('data-render-style', 'sketch');

  await openMenu(page, 'file');
  await page.getByTestId('share').click();
  const shareUrl = await page.getByTestId('share-url').inputValue();

  const freshPage = await context.newPage();
  await freshPage.goto(shareUrl);
  await expect(freshPage.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(freshPage.getByTestId('reactflow-canvas')).toHaveAttribute('data-render-style', 'sketch');

  await openMenu(freshPage, 'file');
  await freshPage.getByTestId('export-png').click();
  await expect(freshPage.getByTestId('export-dialog')).toBeVisible();
  await expect(freshPage.getByTestId('export-render-style')).toContainText('Sketch');
  await freshPage.getByTestId('export-format').selectOption('svg');
  const downloadPromise = freshPage.waitForEvent('download');
  await freshPage.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const svg = fs.readFileSync((await download.path())!, 'utf8');
  expect(svg).not.toContain('<polyline');
  expect(svg).not.toContain('<ellipse');
});
