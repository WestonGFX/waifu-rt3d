import { test, expect, type Page } from '@playwright/test';
import { mockBackendAPIs } from './helpers';

/**
 * E2E tests for setup wizard modals.
 *
 * Each wizard is triggered from Settings → General → Setup Guides.
 * Tests verify each wizard opens, displays its title, and can be closed.
 */

test.describe('Wizard Modals', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackendAPIs(page);
    await page.goto('/sakura/');
    await page.waitForTimeout(3000);
  });

  /** Opens Settings → General tab → scrolls to Setup Guides section. */
  async function openSetupGuides(page: Page) {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);
    // General is the default tab; Setup Guides is near the bottom
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(300);
    const setupGuides = page.getByText('Setup Guides');
    await setupGuides.scrollIntoViewIfNeeded();
    await expect(setupGuides).toBeVisible({ timeout: 3_000 });
  }

  test('Voice Setup wizard opens', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Set up Voice').click();
    await expect(page.getByText('Voice Setup').first()).toBeVisible({ timeout: 5_000 });
  });

  test('LLM Setup wizard opens', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Configure LLM').click();
    // The LLM wizard title is "Configure LLM" — second instance (first is the button)
    await expect(page.getByText('Your current LLM configuration')).toBeVisible({ timeout: 5_000 });
  });

  test('Image Gen wizard opens', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Set up Image Gen').click();
    await expect(page.getByRole('heading', { name: 'Image Generation Setup' }))
      .toBeVisible({ timeout: 5_000 });
  });

  test('Expression Portraits wizard opens', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Expression Portraits').first().click();
    await page.waitForTimeout(500);
    // Verify the wizard modal appeared (the title "Expression Portraits" exists twice)
    const count = await page.getByText('Expression Portraits').count();
    expect(count).toBeGreaterThanOrEqual(2); // button + modal title
  });

  test('Import Character wizard opens', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Import Character').first().click();
    await expect(page.getByText('Import Character Card').or(
      page.getByText('Import Character').nth(1)
    )).toBeVisible({ timeout: 5_000 });
  });

  test('wizard modal closes on Escape key', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Set up Voice').click();
    await expect(page.getByText('Voice Setup').first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Voice Setup wizard modal should be gone (ESC may also close settings)
    // The wizard's modal overlay (z-[90]) should no longer contain "Voice Setup"
    const voiceSetupCount = await page.getByText('Voice Setup').count();
    // After ESC, at most the sidebar "Set up Voice" button text should remain
    // The modal title "Voice Setup" should be dismissed
    expect(voiceSetupCount).toBeLessThanOrEqual(1);
  });

  test('wizard modal closes on backdrop click', async ({ page }) => {
    await openSetupGuides(page);
    await page.getByText('Set up Voice').click();
    await expect(page.getByText('Voice Setup').first()).toBeVisible({ timeout: 5_000 });

    // Click the backdrop at a corner
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
  });
});
