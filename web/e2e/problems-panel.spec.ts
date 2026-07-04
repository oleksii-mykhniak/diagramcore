import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

// Removes the "AuthService -> OAuthProvider" link block from the YAML
// panel's document by dispatching a precise CodeMirror transaction
// (via the test-only `__cmView` hook — CodeMirror virtualizes offscreen
// lines, so simulating clicks/keystrokes that deep in the document isn't
// reliable). The OAuth flow's matching step then has no backing link
// (DC004).
async function deleteAuthServiceToOAuthProviderLink(page: import('@playwright/test').Page) {
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
    const block = '  - from: AuthService\n    to: OAuthProvider\n    type: request\n    label: "Запит на OAuth-автентифікацію"\n';
    if (!text.includes(block)) throw new Error('expected link block not found in current YAML text');
    const newText = text.replace(block, '');
    view.dispatch({ changes: { from: 0, to: text.length, insert: newText } });
  });
}

test('a valid document shows the OK indicator and an empty problems list', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-ok')).toBeVisible();
  await expect(page.getByTestId('problems-list')).toHaveCount(0);
});

test('deleting a link used by a flow (via the YAML panel) flags the flow with DC004 in the Problems panel automatically', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-ok')).toBeVisible();

  await deleteAuthServiceToOAuthProviderLink(page);

  await expect(page.getByTestId('problems-list')).toBeVisible({ timeout: 5000 });
  const problemsText = await page.getByTestId('problems-list').innerText();
  expect(problemsText).toContain('DC004');
});

test('clicking a problem centers the canvas on the offending node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await deleteAuthServiceToOAuthProviderLink(page);

  await page.getByTestId('status-validation').click();
  await expect(page.getByTestId('problems-list')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('problem-0').click();

  // The Problems panel resolved the DC004 message ("flow step AuthService
  // -> OAuthProvider has no backing link") to the "AuthService" node it
  // names and selected it, opening the properties panel on it.
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  await expect(page.getByTestId('properties-panel')).toContainText('AuthService');
});
