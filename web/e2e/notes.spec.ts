import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

// HTML5 drag-and-drop needs real dragstart/drop DragEvents with a shared
// DataTransfer (see node-crud.spec.ts) — the palette's "Text" item uses the
// same `application/dc-node-type` key with value "note" (`NOTE_DND_TYPE`).
async function dropNote(page: import('@playwright/test').Page, at?: { x: number; y: number }) {
  await page.evaluate(
    (at) => {
      const source = document.querySelector('[data-testid="palette-item-note"]') as HTMLElement;
      const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/dc-node-type', 'note');
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      const rect = canvas.getBoundingClientRect();
      const clientX = at ? at.x : rect.x + rect.width / 2;
      const clientY = at ? at.y : rect.y + rect.height / 2;
      canvas.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX, clientY }));
    },
    at,
  );
}

async function exportLayout(page: import('@playwright/test').Page) {
  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-layout').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  return JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
}

test('adding a note from the palette adds it to the YAML, drag moves it, and undo removes it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropNote(page);
  const note = page.getByTestId('rf-note-note1');
  await expect(note).toBeVisible();
  await expect(note).toContainText('New note');

  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('notes:');
  expect(yaml).toContain('id: note1');

  const box = await note.boundingBox();
  if (!box) throw new Error('note has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();

  const layout = await exportLayout(page);
  expect(layout.views.default.notePositions.note1).toBeTruthy();

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('rf-note-note1')).toHaveCount(0);
  const afterUndo = await page.getByTestId('yaml-source').inputValue();
  expect(afterUndo).not.toContain('id: note1');
});

test('double-clicking a note edits its text, and the note appears in the SVG export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dropNote(page);
  const note = page.getByTestId('rf-note-note1');
  await expect(note).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('Trigger refresh');
  });
  await note.dblclick();
  await expect(note).toContainText('Trigger refresh');

  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format').selectOption('svg');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const svg = fs.readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('Trigger refresh');
});

test('View → "Show descriptions" shows/hides node descriptions on the canvas and in the SVG export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('rf-node-User').click();
  await page.getByTestId('prop-description').fill('The end user');

  await expect(page.getByTestId('rf-node-description-User')).toHaveCount(0);

  await openMenu(page, 'view');
  await page.getByTestId('menu-show-descriptions-toggle').click();

  await expect(page.getByTestId('rf-node-description-User')).toContainText('The end user');

  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format').selectOption('svg');
  await page.getByTestId('export-include-descriptions').check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const svg = fs.readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('The end user');
});
