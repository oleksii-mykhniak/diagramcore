import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');

test('recording a flow by clicking edges produces a flow with correctly-ordered steps, valid against DC004, and playable immediately', async ({
  page,
}) => {
  let promptCount = 0;
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      promptCount += 1;
      if (promptCount === 1) {
        await dialog.accept('Recorded scenario');
      } else {
        // step notes
        await dialog.accept(`note ${promptCount - 1}`);
      }
    }
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await page.getByTestId('new-flow').click();
  await expect(page.getByTestId('toggle-recording')).toHaveText('Stop recording');

  // React Flow layers an invisible wider "interaction" path on top of the
  // visible edge path to make clicking easier — that intercepts
  // Playwright's actionability-checked .click(), so click through it
  // directly instead.
  await page.getByTestId('rf-edge-link-0-User-Gateway').dispatchEvent('click');
  await page.getByTestId('rf-edge-link-1-Gateway-AuthService').dispatchEvent('click');
  await page.getByTestId('rf-edge-link-2-AuthService-OAuthProvider').dispatchEvent('click');

  await page.getByTestId('toggle-recording').click();

  const yaml = await page.getByTestId('yaml-source').inputValue();
  expect(yaml).toContain('name: Recorded scenario');
  const flowSection = yaml.split('name: Recorded scenario')[1];
  expect(flowSection).toContain('from: User');
  expect(flowSection).toContain('to: Gateway');
  expect(flowSection).toContain('from: Gateway');
  expect(flowSection).toContain('to: AuthService');
  expect(flowSection).toContain('from: AuthService');
  expect(flowSection).toContain('to: OAuthProvider');

  // Order: from:User should appear before from:Gateway which should appear before from:AuthService.
  const userIdx = flowSection.indexOf('from: User');
  const gatewayIdx = flowSection.indexOf('from: Gateway');
  const authIdx = flowSection.indexOf('from: AuthService');
  expect(userIdx).toBeLessThan(gatewayIdx);
  expect(gatewayIdx).toBeLessThan(authIdx);

  // 0 validation errors (DC004 or otherwise) after recording.
  await expect(page.getByTestId('validation-errors')).toHaveCount(0);

  // Immediately playable by the flow player.
  await page.getByTestId('flow-select').selectOption({ label: 'Recorded scenario' });
  await page.getByTestId('flow-next').click();
  await expect(page.getByTestId('flow-step-count')).toHaveText('Step 1 / 3');
});
