import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

async function typeInPanel(page: import('@playwright/test').Page, text: string) {
  await page.getByTestId('yaml-panel').locator('.cm-content').click();
  await page.keyboard.type(text);
}

test('typing a new node into the YAML panel adds it to the canvas without reloading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openDock(page, 'yaml');
  await expect(page.getByTestId('yaml-panel')).toBeVisible();

  // Click at the end of the first node's "type: actor" line and insert a
  // sibling node right after it (avoids jumping to the end of the whole
  // document, which would land inside the unrelated `flows:` section).
  // `insertText` (rather than `type`) bypasses CodeMirror's smart-indent-
  // on-Enter, which would otherwise double up the leading spaces already
  // present in the pasted text.
  await page.getByTestId('yaml-panel').getByText('type: actor').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('\n  - id: NewNode\n    type: component');

  await expect(page.getByTestId('rf-node-NewNode')).toBeVisible({ timeout: 5000 });
});

test('adding a node from the palette shows up in the YAML panel text, preserving comments', async ({ page }) => {
  const withComment = `diagram:
  title: "T"
nodes:
  - id: A
    type: actor
  # keep me
  - id: B
    type: service
links: []
`;
  await page.goto('/');
  const file = { name: 'commented.dc.yaml', mimeType: 'application/x-yaml', buffer: Buffer.from(withComment) };
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openDock(page, 'yaml');
  await expect(page.getByTestId('yaml-panel')).toBeVisible();

  await dropPaletteItem(page, 'storage');
  await expect(page.getByTestId('rf-node-storage1')).toBeVisible();

  // Dropping a node selects it, which switches the dock to Properties
  // (as it should — see view.spec's node-selection behavior); switch back
  // to inspect the YAML.
  await openDock(page, 'yaml');
  const panelText = await page.getByTestId('yaml-panel').locator('.cm-content').innerText();
  expect(panelText).toContain('keep me');
  expect(panelText).toContain('storage1');
});

async function dropPaletteItem(page: import('@playwright/test').Page, type: string) {
  await page.evaluate((type) => {
    const source = document.querySelector(`[data-testid="palette-item-${type}"]`) as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', type);
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 40, clientY: rect.y + 40 }),
    );
  }, type);
}

test('typing syntactically broken YAML keeps the canvas on the previous state and shows an error marker', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openDock(page, 'yaml');

  const nodeCountBefore = await page.locator('[data-testid^="rf-node-"]').count();

  await typeInPanel(page, ': not: valid: yaml: [[[');

  await expect(page.getByTestId('yaml-panel-error')).toBeVisible({ timeout: 5000 });
  const nodeCountAfter = await page.locator('[data-testid^="rf-node-"]').count();
  expect(nodeCountAfter).toBe(nodeCountBefore);
});
