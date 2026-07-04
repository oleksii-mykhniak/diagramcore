import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '..', '..', 'testdata', 'styled-custom-type.dc.yaml');

test('opening a diagram with a styled custom type shows it in the palette; dragging it onto the canvas creates a valid node', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixturePath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // The existing "cache" node (from the fixture) already renders via the
  // custom hexagon shape.
  await expect(page.getByTestId('rf-node-A')).toHaveAttribute('data-node-type', 'cache');
  await expect(page.getByTestId('rf-node-icon-A')).toBeAttached();

  const paletteItem = page.getByTestId('palette-item-cache');
  await expect(paletteItem).toBeVisible();

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-cache"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'cache');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 300, clientY: rect.y + 200 }),
    );
  });

  await expect(page.getByTestId('rf-node-cache1')).toBeVisible();
  await expect(page.getByTestId('rf-node-cache1')).toHaveAttribute('data-node-type', 'cache');

  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('type: cache');

  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-ok')).toBeVisible();
});

test('a custom type with no style still renders as component (no crash)', async ({ page }) => {
  const yaml = `diagram:
  title: "T"
  custom_types:
    - plainCustom
nodes:
  - id: A
    type: plainCustom
links: []
`;
  await page.goto('/');
  const file = { name: 'plain-custom.dc.yaml', mimeType: 'application/x-yaml', buffer: Buffer.from(yaml) };
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await expect(page.getByTestId('rf-node-A')).toHaveAttribute('data-node-type', 'plainCustom');
});
