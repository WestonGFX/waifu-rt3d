import { test, expect } from '@playwright/test';
import { mockBackendAPIs } from './helpers';

/**
 * E2E tests for the Settings view.
 *
 * Covers tab navigation, Setup Guides section, and settings controls.
 * Settings is opened via the sidebar toolbar or Ctrl+, keyboard shortcut.
 */

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackendAPIs(page);
    await page.goto('/sakura/');
    // Wait for the app to load and render
    await page.waitForTimeout(3000);
  });

  test('opens settings via keyboard shortcut', async ({ page }) => {
    await page.keyboard.press('Control+,');
    // Settings drawer should appear — look for tab labels
    await expect(page.getByText('General', { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('all 9 tabs are visible', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);

    const tabLabels = [
      'General', 'Character', 'Brain', 'Voice',
      'Safety', 'AI Art', 'System', 'TTS Models', 'LM Models',
    ];

    for (const label of tabLabels) {
      const tab = page.getByText(label, { exact: true }).first();
      await expect(tab).toBeVisible({ timeout: 3_000 });
    }
  });

  test('clicking Voice tab shows voice-related content', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);

    await page.getByText('Voice', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Should see voice-related content
    const voiceContent = page.getByText(/TTS Provider|Voice Engine|voice/i).first();
    await expect(voiceContent).toBeVisible({ timeout: 3_000 });
  });

  test('Setup Guides section is visible in General tab', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);

    // General is the default tab — Setup Guides is at the bottom, so scroll to it
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(300);

    // Scroll the settings content area to find Setup Guides
    const setupGuides = page.getByText('Setup Guides');
    await setupGuides.scrollIntoViewIfNeeded();
    await expect(setupGuides).toBeVisible({ timeout: 3_000 });

    // Verify individual guide buttons
    await expect(page.getByText('Set up Voice')).toBeVisible();
    await expect(page.getByText('Configure LLM')).toBeVisible();
    await expect(page.getByText('Import Character')).toBeVisible();
    await expect(page.getByText('Expression Portraits').first()).toBeVisible();
    await expect(page.getByText('Re-run Onboarding')).toBeVisible();
  });

  test('clicking a setup guide opens its wizard modal', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);

    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(300);

    // Scroll to Setup Guides section
    const setupGuides = page.getByText('Setup Guides');
    await setupGuides.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Click "Set up Voice"
    await page.getByText('Set up Voice').click();

    // The Voice Setup wizard should appear
    await expect(page.getByText('Voice Setup').first()).toBeVisible({ timeout: 5_000 });
  });
});
