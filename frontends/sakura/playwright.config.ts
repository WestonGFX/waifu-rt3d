import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for the Sakura frontend.
 *
 * - Starts the Vite dev server on port 5175 before tests
 * - Tests use route interception to mock backend API responses
 * - Only tests Chromium (primary browser target for this desktop app)
 *
 * Run: npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:5175/sakura/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5175/sakura/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
