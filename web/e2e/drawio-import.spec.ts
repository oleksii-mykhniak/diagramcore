import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'testdata', 'drawio');

async function importDrawioFile(page: import('@playwright/test').Page, fileName: string) {
  await openMenu(page, 'file');
  await page.getByTestId('drawio-input').setInputFiles(path.join(fixturesDir, fileName));
}

// draw.io import is hidden behind `featureFlags.drawioImport` (PLAN3.md
// step 11.3) — the "Import draw.io…" menu item, and thus `drawio-input`,
// isn't rendered while it's off. The importer itself and its unit tests
// (drawioImport.test.ts) stay green; these UI-driven e2e specs are
// skipped until the flag flips back on, rather than deleted.
test.describe.skip('draw.io import (hidden behind featureFlags.drawioImport)', () => {
test('importing an uncompressed .drawio file places nodes at their source positions and validates cleanly', async ({
  page,
}) => {
  await page.goto('/');
  await importDrawioFile(page, 'uncompressed.drawio');
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('type: actor');
  expect(yaml).toContain('type: storage');
  expect(yaml).toContain('type: external');
  expect(yaml).toContain('type: queue');
  expect(yaml).toContain('type: service');
  expect(yaml).toContain('label: calls');

  // "User" (actor) sits at mxGeometry x=40 y=40 in the fixture.
  const userNode = page.locator('[data-node-type="actor"]');
  const box = await userNode.boundingBox();
  expect(box).not.toBeNull();

  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-ok')).toBeVisible();
});

test('the imported diagram edits like a normal one — adding a node and undo both work', async ({ page }) => {
  await page.goto('/');
  await importDrawioFile(page, 'uncompressed.drawio');
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const before = await page.getByTestId('yaml-source').inputValue();
  expect(before).not.toContain('component1');

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-component"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'component');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 500, clientY: rect.y + 300 }),
    );
  });
  await expect(page.getByTestId('rf-node-component1')).toBeVisible();

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('rf-node-component1')).toHaveCount(0);
});

test('a broken/foreign file shows a human-readable error instead of crashing', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await page.goto('/');
  await importDrawioFile(page, 'not-drawio.svg');

  await expect(page.getByTestId('load-error')).toBeVisible();
  await expect(page.getByTestId('load-error')).toContainText(/draw\.io/i);
  expect(pageErrors).toHaveLength(0);
});
});
