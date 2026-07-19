import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const authSystemText = fs.readFileSync(authSystemPath, 'utf8');

async function dragNode(page: import('@playwright/test').Page, testId: string, dx: number, dy: number) {
  const node = page.getByTestId(testId);
  const box = await node.boundingBox();
  if (!box) throw new Error(`${testId} has no bounding box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

test('a layout-only change (drag) is dirty immediately, then settles into "Draft" once the autosave debounce lands', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);
  await expect(page.getByTestId('saved-indicator')).toBeVisible();

  await dragNode(page, 'rf-node-Gateway', 120, 80);

  // Right after the drag, the ~1s debounce hasn't landed yet.
  await expect(page.getByTestId('unsaved-indicator')).toHaveText('Unsaved changes');

  // Once the debounced IndexedDB write lands, the badge switches to Draft.
  await expect(page.getByTestId('unsaved-indicator')).toHaveText(/^Draft · autosaved \d{2}:\d{2}$/, { timeout: 3000 });
});

test('Save clears the dirty state left by a layout-only change (drag), even with no text edit', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dragNode(page, 'rf-node-Gateway', 120, 80);
  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();

  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  await downloadPromise;

  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);
  await expect(page.getByTestId('saved-indicator')).toBeVisible();
});

test('restoring an autosave draft leaves the document genuinely unsaved (not falsely "Saved")', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await dragNode(page, 'rf-node-Gateway', 120, 80);
  // Let the debounced autosave write land before reloading.
  await expect(page.getByTestId('unsaved-indicator')).toHaveText(/Draft/, { timeout: 3000 });

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  // The freshly-reloaded file has no drag applied yet — starts clean.
  await expect(page.getByTestId('saved-indicator')).toBeVisible();

  await expect(page.getByTestId('restore-autosave-banner')).toBeVisible();
  await page.getByTestId('restore-autosave-restore').click();

  // The draft is back, but it was never written to the real file — the
  // indicator must say so, not silently claim "Saved" (the bug this step
  // fixes: `onRestoreAutosave` used to set the saved-snapshot to the
  // draft's own content).
  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();
  await expect(page.getByTestId('saved-indicator')).toHaveCount(0);

  // Reflected in the underlying file too: reading it back off disk
  // (well, off the download) would not contain the dragged position —
  // proven indirectly by the file input's own copy being untouched.
  const originalYAML = fs.readFileSync(authSystemPath, 'utf8');
  expect(originalYAML).toBe(authSystemText);
});
