import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const paymentPath = path.join(__dirname, '..', '..', 'examples', 'payment-processing.dc.yaml');

// HTML5 drag-and-drop needs real dragstart/drop DragEvents with a shared
// DataTransfer, which Playwright's synthetic mouse actions don't produce
// reliably across browsers — dispatch the events directly in-page instead.
async function dropPaletteItem(page: import('@playwright/test').Page, type: string, at?: { x: number; y: number }) {
  await page.evaluate(
    ({ type, at }) => {
      const source = document.querySelector(`[data-testid="palette-item-${type}"]`) as HTMLElement;
      const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/dc-node-type', type);
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      const rect = canvas.getBoundingClientRect();
      const clientX = at ? at.x : rect.x + rect.width / 2;
      const clientY = at ? at.y : rect.y + rect.height / 2;
      canvas.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX, clientY }));
    },
    { type, at },
  );
}

test('adding a node from the palette adds it to the canvas and to the YAML state', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const before = await page.getByTestId('yaml-source').inputValue();
  expect(before).not.toContain('service2');

  await dropPaletteItem(page, 'service');

  await expect(page.getByTestId('rf-node-service1')).toBeVisible();
  const after = await page.getByTestId('yaml-source').inputValue();
  expect(after).toContain('id: service1');
});

test('editing the label in the properties panel updates the YAML and the canvas label', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  await page.getByTestId('prop-label').fill('Renamed User');

  await expect(page.getByTestId('rf-node-User')).toContainText('Renamed User');
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('Renamed User');
});

test('deleting a node with dependent links shows a confirmation listing them and removes the node and its links', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  let dialogMessage = '';
  page.on('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await page.getByTestId('rf-node-AuthService').click();
  await page.getByTestId('delete-node').click();

  expect(dialogMessage).toContain('AuthService');
  expect(dialogMessage.toLowerCase()).toContain('link');

  await expect(page.getByTestId('rf-node-AuthService')).toHaveCount(0);
  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).not.toContain('id: AuthService');
  expect(yaml).not.toContain('to: AuthService');
  expect(yaml).not.toContain('from: AuthService');
});

test('deleting a node with no dependents removes it without a confirmation dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(paymentPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  let dialogFired = false;
  page.on('dialog', async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  await dropPaletteItem(page, 'component');
  await expect(page.getByTestId('rf-node-component1')).toBeVisible();

  await page.getByTestId('rf-node-component1').click();
  await page.getByTestId('delete-node').click();

  expect(dialogFired).toBe(false);
  await expect(page.getByTestId('rf-node-component1')).toHaveCount(0);
});
