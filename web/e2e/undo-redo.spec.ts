import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

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

test('adding a node, then undo, then redo round-trips it on both the canvas and the YAML', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  const yamlAfterAdd = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfterAdd).toContain('id: service1');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-service1')).toHaveCount(0);
  const yamlAfterUndo = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfterUndo).not.toContain('id: service1');

  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  const yamlAfterRedo = await page.getByTestId('yaml-source').inputValue();
  expect(yamlAfterRedo).toContain('id: service1');
});

test('a visual edit and a YAML-panel edit undo in the correct order through one shared history', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // Visual edit #1: add a node from the palette.
  await dropPaletteItem(page, 'service');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  // Text edit #2 in the YAML panel: add a second node via a precise
  // CodeMirror transaction (see problems-panel.spec.ts for why not
  // simulated keystrokes).
  await openDock(page, 'yaml');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="yaml-panel"]') as unknown as { __cmView?: unknown };
    return Boolean(el?.__cmView);
  });
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="yaml-panel"]') as unknown as {
      __cmView: { state: { doc: { toString(): string } }; dispatch: (tx: unknown) => void };
    };
    const view = el.__cmView;
    const text = view.state.doc.toString();
    const marker = '  - id: service1\n    type: service\n';
    const insertAfter = text.indexOf(marker) + marker.length;
    const insert = '  - id: extraNode\n    type: component\n';
    view.dispatch({ changes: { from: insertAfter, to: insertAfter, insert } });
  });
  await expect(page.getByTestId('rf-node-extraNode')).toBeVisible({ timeout: 5000 });

  // Undo #2 (the text edit) first: extraNode goes away, service1 remains.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-extraNode')).toHaveCount(0);
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  // Undo #1 (the visual edit): service1 goes away too.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('rf-node-service1')).toHaveCount(0);

  // Redo brings back the visual edit, then the text edit, in order.
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('rf-node-extraNode')).toBeVisible();
});
