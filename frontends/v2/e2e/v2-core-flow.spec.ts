import { expect, test } from '@playwright/test';

const characters = [
  {
    id: 1,
    name: 'Airi',
    system_prompt: 'Primary companion',
    avatar_url: '',
    model_type: '3d'
  },
  {
    id: 2,
    name: 'Sable',
    system_prompt: 'Secondary companion',
    avatar_url: '',
    model_type: '2d'
  }
];

test('v2 core flow: send/retry, character switch, settings save, memory panel', async ({ page }) => {
  let failOnce = true;
  let persistedConfig = {
    llm: { temperature: 0.7 },
    tts: { tts_pitch: 1 },
    ui: { speech_auto: true }
  };

  await page.route('**/viewer/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>viewer</body></html>'
    });
  });

  await page.route('**/api/characters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ characters })
    });
  });

  await page.route('**/api/v2/memory/graph**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'session',
        nodes: [
          { id: 'u-1', label: 'hello', role: 'user', x: 50, y: 120 },
          { id: 'a-1', label: 'ack', role: 'assistant', x: 170, y: 120 }
        ],
        edges: [{ id: 'e-1', source: 'u-1', target: 'a-1', kind: 'sequence' }],
        stats: {
          sessionMessages: 2,
          memoryHits: 0,
          ragAvailable: false
        }
      })
    });
  });

  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(persistedConfig)
      });
      return;
    }

    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as typeof persistedConfig;
      persistedConfig = {
        ...persistedConfig,
        ...body,
        llm: { ...persistedConfig.llm, ...(body.llm ?? {}) },
        tts: { ...persistedConfig.tts, ...(body.tts ?? {}) },
        ui: { ...persistedConfig.ui, ...(body.ui ?? {}) }
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, config: persistedConfig })
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as {
      text?: string;
      client_message_id?: string;
    };

    if (body.text === 'fail once' && failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'temporary' })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        reply: body.text === 'fail once' ? 'Recovered on retry' : `Echo: ${body.text}`,
        audio: null,
        session_id: 1,
        status: 'ok',
        client_message_id: body.client_message_id,
        user_message_id: 101,
        assistant_message_id: 102,
        memory_hits: []
      })
    });
  });

  await page.goto('/v2/');

  await expect(page.getByRole('heading', { name: 'Neural Roster' })).toBeVisible();
  await expect(page.getByText('Memory Bank')).toBeVisible();
  await expect(page.getByText('Messages: 2')).toBeVisible();

  await page.getByText('Sable').click();
  await expect(page.locator('.v2-viewer-overlay h2')).toHaveText('Sable');

  const composer = page.getByPlaceholder('Transmit to neural channel...');
  await composer.fill('fail once');
  await composer.press('Enter');

  await expect(page.locator('.v2-chat-error')).toHaveText('Transmission failed. Retry protocol available.');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Recovered on retry')).toBeVisible();

  await page.getByRole('button', { name: 'Open HUD' }).click();
  await expect(page.getByRole('heading', { name: 'Settings HUD' })).toBeVisible();

  await page.getByLabel('Voice Pitch').fill('1.2');
  await page.getByLabel('Creativity').fill('0.9');
  await page.getByLabel('Auto transmit on').uncheck();

  await page.getByRole('button', { name: 'Apply protocol' }).click();
  await expect(page.getByRole('heading', { name: 'Settings HUD' })).toHaveCount(0);
});
