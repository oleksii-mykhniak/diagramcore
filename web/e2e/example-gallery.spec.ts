import { expect, test } from '@playwright/test';

test('clicking an example from the gallery opens it in the editor with all its nodes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('example-auth-system.dc.yaml')).toBeVisible();

  await page.getByTestId('example-auth-system.dc.yaml').click();

  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();
  for (const id of ['User', 'Gateway', 'AuthService', 'OAuthProvider', 'DB']) {
    await expect(page.getByTestId(`rf-node-${id}`)).toBeVisible();
  }
});

test('example previews are build-generated SVGs, not hand-drawn images', async ({ page, request }) => {
  await page.goto('/');
  const img = page.getByTestId('example-auth-system.dc.yaml').locator('img');
  const src = await img.getAttribute('src');
  expect(src).toBe('/example-previews/auth-system.svg');

  const response = await request.get(src as string);
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain('<svg');
  // Every node from the actual example file appears in the rendered SVG.
  for (const label of ['Користувач', 'API Gateway', 'Auth Service', 'OAuth-провайдер', 'База даних користувачів']) {
    expect(body).toContain(label);
  }
});
