import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMenu } from './helpers/menu';
import { openDock } from './helpers/dock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nestedPath = path.join(__dirname, '..', '..', 'examples', 'nested.dc.yaml');

async function dragNode(page: import('@playwright/test').Page, testId: string, toX: number, toY: number) {
  const node = page.getByTestId(testId);
  const box = (await node.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 10 });
  await page.mouse.up();
}

test('nested containers render distinctly and children render inside them', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  for (const id of ['gcp', 'k8s', 'namespace']) {
    await expect(page.getByTestId(`rf-node-${id}`)).toHaveAttribute('data-node-type', 'container');
  }
  for (const id of ['api', 'worker', 'cache', 'client']) {
    await expect(page.getByTestId(`rf-node-${id}`)).not.toHaveAttribute('data-node-type', 'container');
  }

  // Every leaf node's box is fully inside its container's box.
  const gcpBox = (await page.getByTestId('rf-node-gcp').boundingBox())!;
  const cacheBox = (await page.getByTestId('rf-node-cache').boundingBox())!;
  expect(cacheBox.x).toBeGreaterThanOrEqual(gcpBox.x);
  expect(cacheBox.y).toBeGreaterThanOrEqual(gcpBox.y);
  expect(cacheBox.x + cacheBox.width).toBeLessThanOrEqual(gcpBox.x + gcpBox.width);
  expect(cacheBox.y + cacheBox.height).toBeLessThanOrEqual(gcpBox.y + gcpBox.height);
});

test('dragging a child within its container keeps its parent unchanged', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const namespaceBox = (await page.getByTestId('rf-node-namespace').boundingBox())!;
  // Move "api" a little, staying well inside its "namespace" container.
  await dragNode(page, 'rf-node-api', namespaceBox.x + namespaceBox.width / 2, namespaceBox.y + namespaceBox.height - 15);

  const yaml = await page.getByTestId('yaml-source').inputValue();
  const apiBlock = yaml.slice(yaml.indexOf('id: api'), yaml.indexOf('id: api') + 120);
  expect(apiBlock).toContain('parent: namespace');
});

test('dragging a node into a container sets its parent; dragging it back out clears it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const namespaceBox = (await page.getByTestId('rf-node-namespace').boundingBox())!;
  // "client" starts outside every container.
  let yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml.slice(yaml.indexOf('id: client'), yaml.indexOf('id: client') + 100)).not.toContain('parent:');

  await dragNode(page, 'rf-node-client', namespaceBox.x + namespaceBox.width / 2, namespaceBox.y + namespaceBox.height / 2);

  // The reparent patch goes through the async applyOps/validate/layout
  // pipeline (unlike a plain position-only drag), so poll rather than
  // read yaml-source immediately after the mouse-up.
  await expect(async () => {
    const y = await page.getByTestId('yaml-source').inputValue();
    expect(y.slice(y.indexOf('id: client'), y.indexOf('id: client') + 100)).toContain('parent: namespace');
  }).toPass();

  // Drag it far away, out of every container.
  const canvas = (await page.getByTestId('reactflow-canvas').boundingBox())!;
  await dragNode(page, 'rf-node-client', canvas.x + canvas.width - 40, canvas.y + 40);

  await expect(async () => {
    const y = await page.getByTestId('yaml-source').inputValue();
    expect(y.slice(y.indexOf('id: client'), y.indexOf('id: client') + 100)).not.toContain('parent:');
  }).toPass();
});

test('dragging a container moves its children together', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  const beforeContainer = (await page.getByTestId('rf-node-namespace').boundingBox())!;
  const beforeChild = (await page.getByTestId('rf-node-api').boundingBox())!;
  const beforeWorker = (await page.getByTestId('rf-node-worker').boundingBox())!;
  const offsetX = beforeChild.x - beforeContainer.x;
  const offsetY = beforeChild.y - beforeContainer.y;

  const dx = 60;
  const dy = 40;
  // Grab a point in the container's own top padding strip, not its
  // center — "namespace" is tightly nested around its "api"/"worker"
  // children, so a center-of-box grab can land on a child's DOM element
  // instead of the container's, silently dragging the child (or nothing
  // at all) rather than the container.
  const topOfChildren = Math.min(beforeChild.y, beforeWorker.y);
  const grabX = beforeContainer.x + beforeContainer.width / 2;
  const grabY = (beforeContainer.y + topOfChildren) / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + dx, grabY + dy, { steps: 10 });
  await page.mouse.up();

  const afterContainer = (await page.getByTestId('rf-node-namespace').boundingBox())!;
  const afterChild = (await page.getByTestId('rf-node-api').boundingBox())!;
  // The container itself actually moved (a same-offset assertion alone
  // would trivially pass if the drag silently failed to register and
  // nothing moved at all).
  expect(afterContainer.x).toBeGreaterThan(beforeContainer.x + 20);
  // The child kept the same offset relative to its container — it moved
  // together with it, not independently (PLAN3.md step 11.6).
  expect(afterChild.x - afterContainer.x).toBeCloseTo(offsetX, 0);
  expect(afterChild.y - afterContainer.y).toBeCloseTo(offsetY, 0);
});

test('Re-layout keeps the hierarchy without overlaps', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('relayout').click();

  await expect(page.getByTestId('rf-node-api')).toBeVisible();
  const namespaceBox = (await page.getByTestId('rf-node-namespace').boundingBox())!;
  const apiBox = (await page.getByTestId('rf-node-api').boundingBox())!;
  expect(apiBox.x).toBeGreaterThanOrEqual(namespaceBox.x);
  expect(apiBox.y).toBeGreaterThanOrEqual(namespaceBox.y);
  expect(apiBox.x + apiBox.width).toBeLessThanOrEqual(namespaceBox.x + namespaceBox.width);
  expect(apiBox.y + apiBox.height).toBeLessThanOrEqual(namespaceBox.y + namespaceBox.height);

  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-ok')).toBeVisible();
});

test('SVG export draws containers the same way the canvas does', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format').selectOption('svg');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-confirm').click();
  const download = await downloadPromise;
  const svg = fs.readFileSync((await download.path())!, 'utf8');

  expect(svg).toContain('GKE Cluster');
  expect(svg).toContain('prod namespace');
  expect(svg).toContain('stroke-dasharray="5,3"');
});

test('opening the YAML dock tab shows the parent: field for a nested node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(nestedPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await openDock(page, 'yaml');
  const text = await page.getByTestId('yaml-panel').locator('.cm-content').innerText();
  expect(text).toContain('parent: k8s');
});
