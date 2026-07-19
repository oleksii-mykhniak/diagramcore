import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDock } from './helpers/dock';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

/** Reads the canvas's own resolved marker-end color/kind for one edge —
 * React Flow bakes the color into the marker id (`type=arrowclosed`,
 * `type=arrow`, or absent for `'none'`) and repeats it as an inline
 * style on the marker's `<polyline>` (PLAN4.md step 12.2). */
async function canvasMarkerEnd(page: import('@playwright/test').Page, edgeTestId: string) {
  return page.evaluate((edgeTestId) => {
    const edge = document.querySelector(`[data-testid="${edgeTestId}"]`);
    const attr = edge?.getAttribute('marker-end');
    if (!attr) return { kind: 'none' as const };
    // e.g. url('#1__color=var(--dc-node-border)&type=arrowclosed') — the
    // color itself contains a `)`, so match up to the LAST `')` instead
    // of the first `)`.
    const id = attr.match(/'#([^']+)'\)/)?.[1];
    const marker = id ? document.getElementById(id) : null;
    const polyline = marker?.querySelector('polyline');
    const style = polyline ? getComputedStyle(polyline) : null;
    return {
      kind: marker?.querySelector('polyline')?.classList.contains('arrowclosed') ? 'arrow' : 'open-arrow',
      fill: style?.fill,
      stroke: style?.stroke,
    };
  }, edgeTestId);
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

test('the default edge draws the same closed-arrow marker on the canvas and in the SVG export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const canvasMarker = await canvasMarkerEnd(page, 'rf-edge-link-0-User-Gateway');
  expect(canvasMarker.kind).toBe('arrow');
  expect(canvasMarker.fill).not.toBe('none');

  const svg = await exportSVG(page);
  expect(svg).toMatch(/<path d="M0,0 L10,5 L0,10 z" fill="[^"]+"\s*\/>/);
});

test('a colored edge override paints the same color on the canvas marker and the exported SVG marker', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openDock(page, 'links');
  await page.getByTestId('link-item-0').click();
  await page.getByTestId('link-edit-color-0').fill('#ff8800');
  await page.mouse.move(10, 10); // clear the hover highlight from the panel click

  const canvasMarker = await canvasMarkerEnd(page, 'rf-edge-link-0-User-Gateway');
  expect(canvasMarker.fill).toBe('rgb(255, 136, 0)');

  const svg = await exportSVG(page);
  expect(svg).toContain('<path d="M0,0 L10,5 L0,10 z" fill="#ff8800" />');
});

test("an 'open-arrow' override renders as an unfilled chevron identically on canvas and export", async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openDock(page, 'links');
  await page.getByTestId('link-item-0').click();
  await page.getByTestId('link-edit-marker-end-0').selectOption('open-arrow');
  await page.mouse.move(10, 10);

  const canvasMarker = await canvasMarkerEnd(page, 'rf-edge-link-0-User-Gateway');
  expect(canvasMarker.kind).toBe('open-arrow');
  expect(canvasMarker.fill).toBe('none');

  const svg = await exportSVG(page);
  expect(svg).toMatch(/<path d="M0,0 L10,5 L0,10" fill="none" stroke="[^"]+" stroke-width="1\.5" \/>/);
});

test("a 'none' marker override draws no arrowhead on either the canvas or the export", async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openDock(page, 'links');
  await page.getByTestId('link-item-0').click();
  await page.getByTestId('link-edit-marker-end-0').selectOption('none');
  await page.mouse.move(10, 10);

  const edge = page.getByTestId('rf-edge-link-0-User-Gateway');
  await expect(edge).not.toHaveAttribute('marker-end', /.+/);

  const svg = await exportSVG(page);
  expect(svg).not.toContain('marker-end="url(#dc-marker-end-0)"');
});
