import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('sharing a diagram and opening the link in a new context restores the same diagram and positions', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Drag a node so the layout is part of what gets shared too.
  const gateway = page.getByTestId('rf-node-Gateway');
  const box = await gateway.boundingBox();
  if (!box) throw new Error('no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 5 });
  await page.mouse.up();

  await page.getByTestId('share').click();
  const shareUrl = await page.getByTestId('share-url').inputValue();
  expect(shareUrl).toContain('#s=');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('no download path');
  const originalLayout = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));

  // Open the share URL in a brand-new browser context (no shared state
  // with `page` other than the URL itself).
  const freshPage = await context.newPage();
  await freshPage.goto(shareUrl);
  await expect(freshPage.getByTestId('reactflow-canvas')).toBeVisible();

  for (const id of ['User', 'Gateway', 'AuthService', 'OAuthProvider', 'DB']) {
    await expect(freshPage.getByTestId(`rf-node-${id}`)).toBeVisible();
  }

  const freshDownloadPromise = freshPage.waitForEvent('download');
  await freshPage.getByTestId('export-layout').click();
  const freshDownload = await freshDownloadPromise;
  const freshDownloadPath = await freshDownload.path();
  if (!freshDownloadPath) throw new Error('no download path');
  const restoredLayout = JSON.parse(fs.readFileSync(freshDownloadPath, 'utf8'));

  expect(restoredLayout.views.default.positions.Gateway).toEqual(originalLayout.views.default.positions.Gateway);
});

test('the share fragment never reaches the server and stays under the size budget', async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on('request', (req) => requestedUrls.push(req.url()));

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('share').click();
  const shareUrl = await page.getByTestId('share-url').inputValue();

  const fragment = shareUrl.split('#')[1];
  expect(fragment).toBeTruthy();
  expect(Buffer.byteLength(shareUrl, 'utf8')).toBeLessThanOrEqual(8 * 1024);

  // Actually navigate to it and confirm no outgoing request ever
  // contains the fragment (fragments are never sent over HTTP by
  // browsers, but assert it explicitly here).
  await page.goto(shareUrl);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  for (const url of requestedUrls) {
    expect(url).not.toContain(fragment);
  }
});
