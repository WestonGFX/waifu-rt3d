import { defineConfig } from '@playwright/test';

const liveBackend = process.env.E2E_LIVE_BACKEND === '1';
const baseURL = process.env.E2E_BASE_URL ?? (liveBackend ? 'http://127.0.0.1:8080' : 'http://127.0.0.1:4174');

export default defineConfig({
  testDir: './e2e',
  timeout: liveBackend ? 60_000 : 30_000,
  expect: {
    timeout: liveBackend ? 10_000 : 5_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: liveBackend
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4174',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
