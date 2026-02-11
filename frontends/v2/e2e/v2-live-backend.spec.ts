import { expect, test } from '@playwright/test';

test('v2 live backend smoke: app loads and chat handles response or failure', async ({ page }) => {
  const probeMessage = `playwright-live-${Date.now()}`;

  await page.goto('/v2/');

  await expect(page.getByRole('heading', { name: 'Neural Roster' })).toBeVisible();
  const composer = page.getByPlaceholder('Transmit to neural channel...');
  await expect(composer).toBeVisible();

  await composer.fill(probeMessage);
  await composer.press('Enter');
  await expect(page.locator('.v2-bubble.user p').last()).toHaveText(probeMessage);

  const aiBubble = page.locator('.v2-bubble.ai p').last();
  const chatError = page.locator('.v2-chat-error');

  await expect
    .poll(
      async () => {
        if ((await aiBubble.count()) > 0) return 'assistant';
        if ((await chatError.count()) > 0) return 'error';
        return 'pending';
      },
      {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000, 3_000]
      }
    )
    .not.toBe('pending');

  if ((await chatError.count()) > 0) {
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  }
});
