import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('switching to the React Flow canvas renders all 5 nodes and 4 edges', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  await page.getByTestId('canvas-toggle').click();
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  for (const id of ['User', 'Gateway', 'AuthService', 'OAuthProvider', 'DB']) {
    await expect(page.getByTestId(`rf-node-${id}`)).toBeVisible();
  }

  const edges = [
    ['User', 'Gateway'],
    ['Gateway', 'AuthService'],
    ['AuthService', 'OAuthProvider'],
    ['AuthService', 'DB'],
  ];
  for (const [from, to] of edges) {
    await expect(page.locator(`[data-testid^="rf-edge-link-"][id*="${from}-${to}"]`)).toHaveCount(1);
  }

  // minimap + pan/zoom controls present out of the box.
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.locator('.react-flow__controls')).toBeVisible();
});
