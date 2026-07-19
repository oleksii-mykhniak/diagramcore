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

test('clicking an edge on the canvas opens its properties in the Properties dock', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');

  await expect(page.getByTestId('link-properties-panel')).toBeVisible();
  await expect(page.getByTestId('link-edit-marker-end')).toBeVisible();
});

test('changing marker/line-style/width/color shows up on the canvas edge and leaves the YAML untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const yamlBefore = await page.getByTestId('yaml-source').inputValue();

  await page.getByTestId('overview-link-0').click();
  await page.getByTestId('link-edit-marker-start').selectOption('open-arrow');
  await page.getByTestId('link-edit-line-style').selectOption('dashed');
  await page.getByTestId('link-edit-stroke-width').selectOption('3');
  await page.getByTestId('link-edit-color').fill('#ff8800');

  // The panel row is still hovered from the click above, and the hover
  // highlight color legitimately takes priority over the override (same
  // precedence as node style overrides vs. selection) — move the mouse
  // away first to see the edge's normal resolved style.
  await page.mouse.move(10, 10);

  const edgePath = page.getByTestId('rf-edge-link-0-User-Gateway');
  await expect(edgePath).toHaveCSS('stroke', 'rgb(255, 136, 0)');
  await expect(edgePath).toHaveAttribute('style', /stroke-width:\s*3/);
  await expect(edgePath).toHaveAttribute('style', /stroke-dasharray:\s*6,\s*4/);
  await expect(edgePath).toHaveAttribute('marker-start', /.+/);

  const yamlAfter = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfter).toBe(yamlBefore);
});

test('an edge style override survives Export layout -> Import layout, same on canvas and SVG export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('overview-link-0').click();
  await page.getByTestId('link-edit-color').fill('#ff8800');

  const layout = await exportLayout(page);
  expect(layout.views.default.edgeStyles['User->Gateway:request'].color).toBe('#ff8800');

  const tmpLayoutPath = path.join(__dirname, '.tmp-edge-style-import.layout.json');
  fs.writeFileSync(tmpLayoutPath, JSON.stringify(layout));

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openMenu(page, 'file');
  await page.getByTestId('layout-input').setInputFiles(tmpLayoutPath);

  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).toHaveCSS('stroke', 'rgb(255, 136, 0)');

  fs.unlinkSync(tmpLayoutPath);
});

test('Reset style clears the edge override', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('overview-link-0').click();
  await page.getByTestId('link-edit-color').fill('#ff8800');
  await expect(page.getByTestId('link-reset-style')).toBeEnabled();

  await page.getByTestId('link-reset-style').click();
  await expect(page.getByTestId('rf-edge-link-0-User-Gateway')).not.toHaveCSS('stroke', 'rgb(255, 136, 0)');
  await expect(page.getByTestId('link-reset-style')).toBeDisabled();
});

test('dragging an edge label moves it independently and the offset survives Export -> Import layout', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const label = page.getByTestId('rf-edge-label-link-0-User-Gateway');
  const before = await label.boundingBox();
  if (!before) throw new Error('label has no bounding box');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, { steps: 10 });
  await page.mouse.up();

  const after = await label.boundingBox();
  if (!after) throw new Error('label has no bounding box after drag');
  expect(after.x - before.x).toBeGreaterThan(30);

  const layout = await exportLayout(page);
  const offset = layout.views.default.edgeLabelOffsets['User->Gateway:request'];
  expect(offset.x).toBeGreaterThan(30);
});

test('double-clicking an edge label opens an inline input (no window.prompt) that patches the YAML label on Enter', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  let dialogFired = false;
  page.on('dialog', (dialog) => {
    dialogFired = true;
    void dialog.dismiss();
  });

  await page.getByTestId('rf-edge-label-link-0-User-Gateway').dispatchEvent('dblclick');

  const input = page.getByTestId('rf-edge-label-input-link-0-User-Gateway');
  await expect(input).toBeVisible();
  await input.fill('New label text');
  await input.press('Enter');

  expect(dialogFired).toBe(false);
  await expect(page.getByTestId('rf-edge-label-link-0-User-Gateway')).toHaveText('New label text');
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('New label text');
});

test('Escape cancels an in-progress edge label edit, leaving the label untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-edge-label-link-0-User-Gateway').dispatchEvent('dblclick');
  const input = page.getByTestId('rf-edge-label-input-link-0-User-Gateway');
  await input.fill('should not be committed');
  await input.press('Escape');

  await expect(page.getByTestId('rf-edge-label-link-0-User-Gateway')).not.toHaveText('should not be committed');
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).not.toContain('should not be committed');
});

test('View → Connection labels hides every label; the per-edge hide checkbox hides just one', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await expect(page.getByTestId('rf-edge-label-link-0-User-Gateway')).toBeVisible();

  await page.getByTestId('overview-link-1').click();
  await page.getByTestId('link-edit-hide-label').check();
  await expect(page.getByTestId('rf-edge-label-link-1-Gateway-AuthService')).toHaveCount(0);
  await expect(page.getByTestId('rf-edge-label-link-0-User-Gateway')).toBeVisible();

  await openMenu(page, 'view');
  await page.getByTestId('menu-show-edge-labels-toggle').click();
  await expect(page.getByTestId('rf-edge-label-link-0-User-Gateway')).toHaveCount(0);
});
