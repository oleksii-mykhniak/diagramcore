import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(__dirname, '..', '..', 'examples');
const authSystemPath = path.join(examplesDir, 'auth-system.dc.yaml');
const oauthDetailPath = path.join(examplesDir, 'oauth-detail.dc.yaml');
const paymentPath = path.join(examplesDir, 'payment-processing.dc.yaml');

async function exportLayout(page: import('@playwright/test').Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  return JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
}

async function openOnReactFlow(page: import('@playwright/test').Page, files: string[]) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();
  await page.getByTestId('canvas-toggle').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
}

test('a node with details is marked, nodes without details are not (React Flow canvas)', async ({ page }) => {
  await openOnReactFlow(page, [authSystemPath, oauthDetailPath]);

  await expect(page.getByTestId('rf-node-OAuthProvider')).toHaveAttribute('data-has-details', 'true');
  await expect(page.getByTestId('rf-details-marker-OAuthProvider')).toBeVisible();

  for (const id of ['User', 'Gateway', 'AuthService', 'DB']) {
    await expect(page.getByTestId(`rf-node-${id}`)).not.toHaveAttribute('data-has-details', 'true');
  }
});

test('double-clicking a details node drills down, breadcrumbs track both levels, and clicking back restores dragged positions and the selected flow (React Flow canvas)', async ({
  page,
}) => {
  await openOnReactFlow(page, [authSystemPath, oauthDetailPath]);

  const box = await page.getByTestId('rf-node-Gateway').boundingBox();
  if (!box) throw new Error('Gateway has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 10 });
  await page.mouse.up();

  await page.getByTestId('flow-select').selectOption({ label: 'Успішна авторизація через OAuth' });
  await page.getByTestId('flow-next').click();
  await page.getByTestId('flow-next').click();

  const draggedLayout = await exportLayout(page);
  const draggedGatewayPos = draggedLayout.views.default.positions.Gateway;

  await page.getByTestId('rf-node-OAuthProvider').dblclick();

  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-ConsentScreen')).toBeVisible();
  await expect(page.getByTestId('rf-node-TokenIssuer')).toBeVisible();
  await expect(page.getByTestId('rf-node-TokenStore')).toBeVisible();

  await expect(page.getByTestId('breadcrumb-0')).toHaveText('Система авторизації');
  await expect(page.getByTestId('breadcrumb-1')).toHaveText('OAuth-провайдер: деталі');

  await page.getByTestId('breadcrumb-0').click();

  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();
  const restoredLayout = await exportLayout(page);
  expect(restoredLayout.views.default.positions.Gateway).toEqual(draggedGatewayPos);

  await expect(page.getByTestId('flow-step-count')).toHaveText('Step 2 / 6');
});

test('a broken details path shows a non-fatal error and keeps the current diagram (React Flow canvas)', async ({
  page,
}) => {
  await openOnReactFlow(page, [authSystemPath]);

  await page.getByTestId('rf-node-OAuthProvider').dblclick();

  await expect(page.getByTestId('drill-error')).toBeVisible();
  await expect(page.getByTestId('rf-node-Gateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-OAuthProvider')).toBeVisible();
});

test('a details-free diagram has no markers at all (React Flow canvas)', async ({ page }) => {
  await openOnReactFlow(page, [paymentPath]);
  await expect(page.locator('[data-has-details]')).toHaveCount(0);
});
