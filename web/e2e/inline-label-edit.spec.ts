import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const oauthDetailPath = path.join(__dirname, '..', '..', 'examples', 'oauth-detail.dc.yaml');

test('double-clicking a node without details opens an inline editor; Enter commits the new label to the YAML', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').dblclick();

  const input = page.getByTestId('rf-node-label-input-Gateway');
  await expect(input).toBeVisible();
  await input.fill('Edge Gateway');
  await input.press('Enter');

  await expect(page.getByTestId('rf-node-Gateway')).toContainText('Edge Gateway');
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('Edge Gateway');
});

test('Escape cancels the inline node label edit, leaving the label untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').dblclick();
  const input = page.getByTestId('rf-node-label-input-Gateway');
  await input.fill('should not be committed');
  await input.press('Escape');

  await expect(page.getByTestId('rf-node-label-input-Gateway')).toHaveCount(0);
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).not.toContain('should not be committed');
});

test('undo after an inline label edit restores the previous text in one step', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-Gateway').dblclick();
  await page.getByTestId('rf-node-label-input-Gateway').fill('Renamed Gateway');
  await page.getByTestId('rf-node-label-input-Gateway').press('Enter');
  await expect(page.getByTestId('rf-node-Gateway')).toContainText('Renamed Gateway');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-Gateway')).not.toContainText('Renamed Gateway');
});

test('F2 on the selected node opens the same inline editor, even for a node with details (which keeps dblclick for drill-down)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([authSystemPath, oauthDetailPath]);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Plain node, F2 without a prior dblclick. The `selectedNodeId` F2
  // acts on (unlike the `data-selected` attribute, driven by RF's own
  // near-instant native selection) only lands ~250ms after the click
  // (the double-click detection window) — wait for the Properties panel
  // to reflect it before F2, otherwise F2 fires before there's anything
  // selected to act on.
  await page.getByTestId('rf-node-Gateway').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await page.keyboard.press('F2');
  await expect(page.getByTestId('rf-node-label-input-Gateway')).toBeVisible();
  await page.keyboard.press('Escape');

  // dblclick on the details node still drills down (unchanged behavior).
  await page.getByTestId('rf-node-OAuthProvider').dblclick();
  await expect(page.getByTestId('rf-node-OAuthGateway')).toBeVisible();
  await expect(page.getByTestId('rf-node-label-input-OAuthProvider')).toHaveCount(0);

  // Back to the main diagram, select the details node, and F2 edits its label.
  await page.getByTestId('breadcrumb-0').click();
  await page.getByTestId('rf-node-OAuthProvider').click();
  await expect(page.getByTestId('rf-node-OAuthProvider')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('F2');
  const input = page.getByTestId('rf-node-label-input-OAuthProvider');
  await expect(input).toBeVisible();
  await input.fill('OAuth Provider (renamed)');
  await input.press('Enter');
  await expect(page.getByTestId('rf-node-OAuthProvider')).toContainText('OAuth Provider (renamed)');
});
