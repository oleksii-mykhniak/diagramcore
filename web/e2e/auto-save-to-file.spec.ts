import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const authSystemText = fs.readFileSync(authSystemPath, 'utf8');

/** Same in-memory File System Access fake as native-fs.spec.ts. */
async function installFakeNativeFs(page: import('@playwright/test').Page, initialFiles: Record<string, string>) {
  await page.addInitScript((initialFiles) => {
    const store: Record<string, string> = { ...initialFiles };
    (window as unknown as { __fsStore: Record<string, string> }).__fsStore = store;
    function makeHandle(name: string) {
      return {
        kind: 'file',
        name,
        async getFile() {
          return new File([store[name] ?? ''], name);
        },
        async createWritable() {
          return {
            async write(data: string) {
              store[name] = data;
            },
            async close() {},
          };
        },
      };
    }
    (window as unknown as { showOpenFilePicker: () => Promise<unknown[]> }).showOpenFilePicker = async () =>
      Object.keys(store).map((name) => makeHandle(name));
    (window as unknown as { showSaveFilePicker: (opts: { suggestedName: string }) => Promise<unknown> }).showSaveFilePicker =
      async (opts: { suggestedName: string }) => makeHandle(opts.suggestedName);
  }, initialFiles);
}

test('with Auto-save to file on, an edit reaches disk on its own — the indicator settles on Saved without Ctrl+S', async ({
  page,
}) => {
  await installFakeNativeFs(page, { 'auth-system.dc.yaml': authSystemText });
  await page.goto('/');
  await openMenu(page, 'file');
  await page.getByTestId('open-native').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  await page.getByTestId('menu-auto-save-to-file-toggle').click();

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-component"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'component');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 40, clientY: rect.y + 40 }),
    );
  });
  await expect(page.getByTestId('rf-node-component1')).toBeVisible();
  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();

  await expect(page.getByTestId('saved-indicator')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);

  const store = await page.evaluate(() => (window as unknown as { __fsStore: Record<string, string> }).__fsStore);
  expect(store['auth-system.dc.yaml']).toContain('id: component1');
});
