import { expect, test } from '@playwright/test';

test('theme toggle switches computed body background and persists across reload', async ({ page }) => {
  await page.goto('/');

  const initialBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).not.toBe(initialBg);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const reloadedBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(reloadedBg).toBe(darkBg);
});
