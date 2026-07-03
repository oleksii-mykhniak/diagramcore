import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('opening auth-system.dc.yaml shows all 5 nodes and 4 edges', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('file-input').setInputFiles(authSystemPath);

  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  for (const id of ['User', 'Gateway', 'AuthService', 'OAuthProvider', 'DB']) {
    await expect(page.getByTestId(`node-${id}`)).toBeVisible();
  }

  const edges = [
    ['User', 'Gateway'],
    ['Gateway', 'AuthService'],
    ['AuthService', 'OAuthProvider'],
    ['AuthService', 'DB'],
  ];
  for (const [from, to] of edges) {
    await expect(page.getByTestId(`edge-${from}-${to}`)).toBeAttached();
  }
});
