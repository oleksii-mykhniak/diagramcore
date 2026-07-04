import { expect, test } from '@playwright/test';
import { openMenu } from './helpers/menu';

test('Help > Tour opens, steps through all tips, and Done closes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();

  await openMenu(page, 'help');
  await page.getByTestId('menu-tour').click();

  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  const tip1 = await page.getByTestId('tour-tip').innerText();

  let steps = 0;
  while ((await page.getByTestId('tour-next').count()) > 0) {
    await page.getByTestId('tour-next').click();
    steps += 1;
    if (steps > 20) throw new Error('tour-next never reached the last tip');
  }
  const lastTip = await page.getByTestId('tour-tip').innerText();
  expect(lastTip).not.toBe(tip1);

  await expect(page.getByTestId('tour-done')).toBeVisible();
  await page.getByTestId('tour-done').click();
  await expect(tour).toHaveCount(0);
});

test('the Start Screen\'s own "Show tour" button opens the same tour, and Skip closes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();

  await page.getByTestId('show-tour').click();
  await expect(page.getByTestId('tour')).toBeVisible();

  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});
