import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(__dirname, '..', '..', 'examples');
const authSystemPath = path.join(examplesDir, 'auth-system.dc.yaml');
const oauthDetailPath = path.join(examplesDir, 'oauth-detail.dc.yaml');

async function rubberBandSelect(page: import('@playwright/test').Page, startX: number, startY: number, endX: number, endY: number) {
  await page.keyboard.down('Shift');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

async function selectUserAndGateway(page: import('@playwright/test').Page) {
  const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
  const userBox = await page.getByTestId('rf-node-User').boundingBox();
  const gatewayBox = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!canvasBox || !userBox || !gatewayBox) throw new Error('missing bounding box');
  const top = Math.min(userBox.y, gatewayBox.y) - 20;
  const bottom = Math.max(userBox.y + userBox.height, gatewayBox.y + gatewayBox.height) + 20;
  await rubberBandSelect(page, canvasBox.x + 5, top, canvasBox.x + canvasBox.width - 5, bottom);
}

test('copying two connected nodes and pasting adds two new nodes with a link between them, styles kept, undo in one step', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Give "User" a style override so the test can check it survives paste.
  await page.getByTestId('rf-node-User').click();
  await page.getByTestId('prop-style-fill').fill('#ff00aa');

  await selectUserAndGateway(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');

  const userCopy = page.getByTestId('rf-node-User-copy');
  const gatewayCopy = page.getByTestId('rf-node-Gateway-copy');
  await expect(userCopy).toBeVisible();
  await expect(gatewayCopy).toBeVisible();

  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('id: User-copy');
  expect(yaml).toContain('id: Gateway-copy');
  expect(yaml).toMatch(/from:\s*User-copy\s*\n\s*to:\s*Gateway-copy/);

  // The pasted node kept the copied fill override.
  await userCopy.click();
  await expect(page.getByTestId('prop-style-fill')).toHaveValue('#ff00aa');

  // Undo removes both new nodes and their link in one step.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-User-copy')).toHaveCount(0);
  await expect(page.getByTestId('rf-node-Gateway-copy')).toHaveCount(0);
});

test('pasting on a different tab than the copy works', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  await page.keyboard.press('Control+c');

  await page.getByTestId('tab-oauth-detail.dc.yaml').click();
  await expect(page.getByTestId('tab-oauth-detail.dc.yaml')).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('rf-node-User-copy')).toBeVisible();
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('id: User-copy');
});

test('Cmd/Ctrl+X cuts the selection (copies then deletes)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  page.on('dialog', (d) => d.accept());
  await page.getByTestId('rf-node-DB').click();
  await page.keyboard.press('Control+x');
  await expect(page.getByTestId('rf-node-DB')).toHaveCount(0);

  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('rf-node-DB-copy')).toBeVisible();
});
