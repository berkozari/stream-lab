import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './apps/web/tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Run infrastructure first (PostgreSQL, Redis); do not build contracts here.
  // Rebuilding @streamlab/contracts while API watch runs may restart the server.
  webServer: [
    {
      command: 'pnpm --filter @streamlab/api dev',
      url: 'http://127.0.0.1:4000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @streamlab/web dev',
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
