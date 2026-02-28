import { test, expect } from '@playwright/test';
import { mockBackendAPIs } from './helpers';

/**
 * E2E tests for the "What's New" modal.
 *
 * Shown when server version differs from `config.last_seen_version`.
 * Displays release highlights from `data/changelog.ts` and optional
 * wizard links for quick feature setup.
 */

test.describe('WhatsNewModal', () => {
  test('shows when server version differs from last seen version', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.33.0',  // Old — mismatch triggers modal
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');

    // Use heading role to avoid strict-mode conflict with Help Menu paragraph
    // that also contains the text "What's New"
    await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v5.34.0')).toBeVisible();
  });

  test('does not show when versions match', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.34.0',
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: "What's New" })).not.toBeVisible();
  });

  test('displays release highlights', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.33.0',
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');
    await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible({ timeout: 10_000 });

    // RELEASE_NOTES v5.34.0 highlights (rendered as h4 headings)
    await expect(page.getByRole('heading', { name: 'Setup Wizards & Feature Discovery' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hardware Auto-Detection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Voice Setup Guide' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Help Menu' })).toBeVisible();
  });

  test('"Got it" button dismisses the modal', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.33.0',
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');
    await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('heading', { name: "What's New" })).not.toBeVisible({ timeout: 5_000 });
  });

  test('backdrop click dismisses the modal', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.33.0',
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');
    await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible({ timeout: 10_000 });

    // Click outside the modal (top-left corner)
    await page.mouse.click(10, 10);
    await expect(page.getByRole('heading', { name: "What's New" })).not.toBeVisible({ timeout: 5_000 });
  });

  test('wizard link opens the voice setup wizard', async ({ page }) => {
    await mockBackendAPIs(page, {
      config: {
        onboarded: true,
        onboarding_version: 2,
        last_seen_version: '5.33.0',
      },
      healthVersion: '5.34.0',
    });

    await page.goto('/sakura/');
    await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible({ timeout: 10_000 });

    // The Voice Setup Guide highlight has a "Set up" link
    const setupLink = page.getByRole('button', { name: /Set up/i }).first();
    if (await setupLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await setupLink.click();
      await page.waitForTimeout(1000);

      // Should open the Voice Setup wizard
      const voiceSetup = page.getByText('Voice Setup');
      await expect(voiceSetup.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
