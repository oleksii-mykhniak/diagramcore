import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('selecting a flow and clicking next 3x highlights the first 3 steps and shows the 3rd note', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  await page.getByTestId('flow-select').selectOption({ label: 'Успішна авторизація через OAuth' });

  for (let i = 0; i < 3; i++) {
    await page.getByTestId('flow-next').click();
  }

  await expect(page.getByTestId('flow-step-count')).toHaveText('Step 3 / 6');
  // 3rd step: AuthService -> OAuthProvider, note "Ініціює OAuth-флоу з зовнішнім провайдером"
  await expect(page.getByTestId('flow-note')).toHaveText('Ініціює OAuth-флоу з зовнішнім провайдером');

  await expect(page.getByTestId('edge-User-Gateway')).toHaveAttribute('data-visited', 'true');
  await expect(page.getByTestId('edge-Gateway-AuthService')).toHaveAttribute('data-visited', 'true');
  await expect(page.getByTestId('edge-AuthService-OAuthProvider')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('flow-marker')).toBeAttached();
});

test('autoplay runs the flow to completion and stops', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('diagram-svg')).toBeVisible();

  await page.getByTestId('flow-select').selectOption({ label: 'Успішна авторизація через OAuth' });
  await page.getByTestId('flow-autoplay').click();

  await expect(page.getByTestId('flow-step-count')).toHaveText('Step 6 / 6', { timeout: 15_000 });
  await expect(page.getByTestId('flow-autoplay')).toHaveText('Autoplay');
  await expect(page.getByTestId('flow-next')).toBeDisabled();
});
