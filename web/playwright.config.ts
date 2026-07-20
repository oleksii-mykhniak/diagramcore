import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // CI runners have far fewer effective cores than a dev machine — the
  // default worker count (based on `os.cpus()`) oversubscribes them,
  // causing real timing-sensitive tests (debounced autosave, a 5s
  // `toBeVisible` window) to time out under contention rather than any
  // actual regression (docs/bugfixes.md, 2026-07-20).
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
