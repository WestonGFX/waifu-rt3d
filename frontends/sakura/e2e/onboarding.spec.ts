import { test, expect } from '@playwright/test';
import { mockBackendAPIs } from './helpers';

/**
 * E2E tests for the 7-step onboarding wizard flow.
 *
 * The onboarding wizard is shown on first launch when `config.onboarded` is
 * falsy. It walks the user through: Welcome → System Scan → LLM Setup →
 * Voice Setup → Character Create → Feature Tour → Done.
 *
 * These tests mock backend APIs so no real server is needed.
 */

test.describe('Onboarding Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock config as NOT onboarded to trigger the wizard
    await mockBackendAPIs(page, {
      config: { onboarded: false },
      characters: [],
    });
  });

  test('shows the wizard on first launch (not onboarded)', async ({ page }) => {
    await page.goto('/sakura/');
    // The welcome step should be visible
    await expect(page.getByText('Welcome to Waifu-RT3D')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  });

  test('does not show the wizard when already onboarded', async ({ page }) => {
    // Override to onboarded — register AFTER mockBackendAPIs to take priority
    await page.route('**/api/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: { onboarded: true, onboarding_version: 2, last_seen_version: '5.34.0' },
        });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
    });

    await page.goto('/sakura/');
    await page.waitForTimeout(2000);
    // The wizard should NOT appear
    await expect(page.getByText('Welcome to Waifu-RT3D')).not.toBeVisible();
  });

  test('navigates from Welcome → System Scan on "Get started" click', async ({ page }) => {
    await page.goto('/sakura/');
    await expect(page.getByText('Welcome to Waifu-RT3D')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Get started' }).click();

    // System Scan step should appear
    await expect(page.getByText('System Scan')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Checking your hardware')).toBeVisible();
  });

  test('System Scan shows scan rows', async ({ page }) => {
    await page.goto('/sakura/');
    await page.getByRole('button', { name: 'Get started' }).click({ timeout: 10_000 });

    // Wait for scan rows to appear
    await expect(page.getByText('Hardware').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('LM Studio').first()).toBeVisible();
    await expect(page.getByText('Ollama').first()).toBeVisible();
    await expect(page.getByText('Database').first()).toBeVisible();
  });

  test('System Scan Skip button advances to next step', async ({ page }) => {
    await page.goto('/sakura/');
    await page.getByRole('button', { name: 'Get started' }).click({ timeout: 10_000 });

    await expect(page.getByText('System Scan')).toBeVisible({ timeout: 5_000 });

    // Click the "Skip" link
    await page.getByText('Skip', { exact: true }).click();

    // Should advance past System Scan
    await expect(page.getByText('System Scan')).not.toBeVisible({ timeout: 5_000 });
  });

  test('"Skip setup" dismisses the entire wizard', async ({ page }) => {
    await page.goto('/sakura/');
    await expect(page.getByText('Welcome to Waifu-RT3D')).toBeVisible({ timeout: 10_000 });

    await page.getByText('Skip setup').click();

    // Wizard should close
    await expect(page.getByText('Welcome to Waifu-RT3D')).not.toBeVisible({ timeout: 5_000 });
  });

  test('Back button navigates backwards', async ({ page }) => {
    await page.goto('/sakura/');
    await page.getByRole('button', { name: 'Get started' }).click({ timeout: 10_000 });

    // We're on System Scan
    await expect(page.getByText('System Scan')).toBeVisible({ timeout: 5_000 });

    // Click Back
    await page.getByText('Back').click();
    await expect(page.getByText('Welcome to Waifu-RT3D')).toBeVisible({ timeout: 5_000 });
  });

  test('progress indicator is visible during wizard', async ({ page }) => {
    await page.goto('/sakura/');
    await expect(page.getByText('Welcome to Waifu-RT3D')).toBeVisible({ timeout: 10_000 });

    // WizardProgress renders "Step N of 7: <title>" for each step
    await expect(page.getByText(/Step 1 of 7/)).toBeVisible();
  });
});
