import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const authSystemText = fs.readFileSync(authSystemPath, 'utf8');

/** Installs an in-memory fake of the File System Access API, keyed by
 * filename, before any page script runs. `window.__fsStore` exposes the
 * resulting file contents for assertions — there's no way to drive a real
 * native OS file picker from Playwright, so this is the standard way to
 * test code built on this API (also how the "no native FS" test below
 * disables it: by deleting these same globals). */
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

test('opening via the native picker, adding a node, and saving writes the change back to the same file; the layout is saved separately', async ({
  page,
}) => {
  await installFakeNativeFs(page, { 'auth-system.dc.yaml': authSystemText });
  await page.goto('/');

  await page.getByTestId('open-native').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="palette-item-service"]') as HTMLElement;
    const canvas = document.querySelector('[data-testid="reactflow-canvas"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('application/dc-node-type', 'service');
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: rect.x + 40, clientY: rect.y + 40 }),
    );
  });
  await expect(page.getByTestId('rf-node-service1')).toBeVisible();

  // Drag it so a layout file becomes necessary too.
  const node = page.getByTestId('rf-node-service1');
  const box = await node.boundingBox();
  if (!box) throw new Error('no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);

  const store = await page.evaluate(() => (window as unknown as { __fsStore: Record<string, string> }).__fsStore);
  expect(store['auth-system.dc.yaml']).toContain('id: service1');
  expect(store['auth-system.layout.json']).toBeDefined();
  const layout = JSON.parse(store['auth-system.layout.json']);
  expect(layout.views.default.positions.service1).toBeDefined();
});

test('without native File System Access support, Open/Save degrade to the file input and download without throwing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');

  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  // "Open" degrades to clicking the plain file input instead of throwing.
  await page.getByTestId('open-native').click();
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  // "Save" degrades to a download instead of throwing.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('auth-system.dc.yaml');

  expect(pageErrors).toHaveLength(0);
});

test('an unsaved-changes indicator appears after editing and a beforeunload warning is armed', async ({ page }) => {
  await installFakeNativeFs(page, { 'auth-system.dc.yaml': authSystemText });
  await page.goto('/');
  await page.getByTestId('open-native').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);

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

  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();

  const armed = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const evt = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(evt);
        resolve(evt.defaultPrevented);
      }),
  );
  expect(armed).toBe(true);
});
