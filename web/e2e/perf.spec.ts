import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Generates a valid, fully-connected-enough diagram with `nodeCount`
 * nodes and up to `linkCount` links (PLAN3.md step 11.11's 100-node/
 * 150-edge perf smoke check) — written to a temp file rather than
 * checked into the repo, since it exists only for this one-off timing
 * check, not as a fixture other tests build on. */
function generatePerfDiagram(nodeCount: number, linkCount: number): string {
  const types = ['service', 'storage', 'external', 'component', 'actor', 'queue'];
  const nodes = Array.from(
    { length: nodeCount },
    (_, i) => `  - id: n${i}\n    type: ${types[i % types.length]}\n    label: "Node ${i}"`,
  );
  const links: string[] = [];
  for (let i = 0; i < linkCount; i++) {
    const from = i % nodeCount;
    const to = (i * 7 + 3) % nodeCount;
    if (from === to) continue;
    links.push(`  - from: n${from}\n    to: n${to}\n    type: request`);
  }
  return (
    `diagram:\n  title: "Perf check"\n  purpose: "${nodeCount}-node/${linkCount}-edge perf smoke (PLAN3.md step 11.11)"\n` +
    `  audience: developers\n  version: "0.1"\n\nnodes:\n${nodes.join('\n')}\n\nlinks:\n${links.join('\n')}\n`
  );
}

test('a 100-node/150-edge diagram opens, drags, pans, and zooms within a reasonable time budget', async ({ page }) => {
  const tmpPath = path.join(os.tmpdir(), `dc-perf-${Date.now()}.dc.yaml`);
  fs.writeFileSync(tmpPath, generatePerfDiagram(100, 150));

  try {
    const loadStart = Date.now();
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles(tmpPath);
    await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
    await expect(page.getByTestId('rf-node-n99')).toBeVisible({ timeout: 15000 });
    const loadMs = Date.now() - loadStart;

    const box = await page.getByTestId('rf-node-n0').boundingBox();
    if (!box) throw new Error('node has no bounding box');

    const dragStart = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 15 });
    await page.mouse.up();
    const dragMs = Date.now() - dragStart;

    const canvasBox = await page.getByTestId('reactflow-canvas').boundingBox();
    if (!canvasBox) throw new Error('canvas has no bounding box');
    const panStart = Date.now();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2 - 150, canvasBox.y + canvasBox.height / 2 - 100, { steps: 15 });
    await page.mouse.up();
    const panMs = Date.now() - panStart;

    const zoomStart = Date.now();
    await page.getByTestId('reactflow-canvas').hover();
    await page.mouse.wheel(0, -300);
    await page.mouse.wheel(0, 300);
    const zoomMs = Date.now() - zoomStart;

    // eslint-disable-next-line no-console
    console.log(`[perf] 100 nodes/150 edges — load: ${loadMs}ms, drag: ${dragMs}ms, pan: ${panMs}ms, zoom: ${zoomMs}ms`);

    // Generous ceilings — this asserts "doesn't freeze/hang", not a
    // strict performance budget; see docs/progress-log.md (step 11.11)
    // for the actual measured numbers from this run.
    expect(loadMs).toBeLessThan(15000);
    expect(dragMs).toBeLessThan(5000);
    expect(panMs).toBeLessThan(5000);
    expect(zoomMs).toBeLessThan(5000);
  } finally {
    fs.unlinkSync(tmpPath);
  }
});
