import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { openMenu } from './helpers/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const authSystemPath = path.join(repoRoot, 'examples', 'auth-system.dc.yaml');
const dcBinary = path.join(repoRoot, 'dc');

test('exporting PNG downloads a non-empty file', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-png').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('auth-system.png');
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  const stat = fs.statSync(downloadPath);
  expect(stat.size).toBeGreaterThan(0);
  // PNG magic bytes.
  const header = fs.readFileSync(downloadPath).subarray(0, 8);
  expect(header.toString('hex')).toBe('89504e470d0a1a0a');
});

test('exporting the AI context markdown matches `dc context` for the same file', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-context').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('auth-system.md');
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  const webMarkdown = fs.readFileSync(downloadPath, 'utf8');

  const cliMarkdown = execFileSync(dcBinary, ['context', authSystemPath]).toString();
  expect(webMarkdown).toBe(cliMarkdown);
});

test('exporting flow steps as a zip contains one PNG per step', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(authSystemPath);
  await expect(page.getByTestId('reactflow-canvas')).toBeVisible();

  await openMenu(page, 'file');
  await expect(page.getByTestId('export-flow-steps-zip')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByTestId('flow-select').selectOption({ label: 'Успішна авторизація через OAuth' });

  await openMenu(page, 'file');
  await expect(page.getByTestId('export-flow-steps-zip')).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-flow-steps-zip').click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('download has no path');
  const entries = unzipSync(fs.readFileSync(downloadPath));
  const names = Object.keys(entries).sort();
  expect(names).toEqual(['step-01.png', 'step-02.png', 'step-03.png', 'step-04.png', 'step-05.png', 'step-06.png']);
  for (const name of names) {
    expect(entries[name].length).toBeGreaterThan(0);
  }
});
