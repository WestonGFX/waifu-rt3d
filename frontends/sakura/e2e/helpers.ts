import type { Page } from '@playwright/test';

/**
 * Mock all backend API routes so E2E tests can run without a live server.
 *
 * Intercepts the key endpoints that the app calls on startup:
 * - GET /api/config — returns a minimal config object
 * - GET /api/characters — returns `{ characters: [...] }` wrapper
 * - GET /api/health — returns server version + status
 * - PATCH /api/config — accepts config saves silently
 *
 * **Important**: API response shapes must match what `lib/api.ts` expects.
 * The `getCharacters()` call extracts `.characters` from the response, so
 * we return `{ characters: [...] }`, not a bare array.
 *
 * @param page - Playwright page instance
 * @param overrides - Optional overrides for specific API responses
 */
export async function mockBackendAPIs(
  page: Page,
  overrides: {
    config?: Record<string, unknown>;
    characters?: Record<string, unknown>[];
    healthVersion?: string;
  } = {},
) {
  const config = overrides.config ?? {
    onboarded: true,
    onboarding_version: 2,
    last_seen_version: '5.34.0',
    llm: { endpoint: 'http://localhost:1234', model: 'test-model' },
    tts_provider: 'kokoro',
    theme: 'sakura',
  };

  const characters = overrides.characters ?? [
    {
      id: 1,
      name: 'Test Character',
      system_prompt: 'You are a test character.',
      avatar_url: null,
      voice_id: 'af_heart',
      tts_provider: 'kokoro',
      greeting_message: 'Hello!',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const healthVersion = overrides.healthVersion ?? '5.34.0';

  // ── IMPORTANT: Register catch-all FIRST so specific routes override it ──
  // Playwright matches routes in reverse registration order (last wins).

  // Catch-all for any API route not explicitly mocked
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {} });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  // Config — response is the config object directly
  await page.route('**/api/config', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: config });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  // Characters list — response shape: { characters: Character[] }
  await page.route('**/api/characters', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { characters } });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  // Recent messages per character
  await page.route('**/api/characters/recent-messages', async (route) => {
    await route.fulfill({ json: { ok: true, recent: {} } });
  });

  // Health
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      json: {
        status: 'ok',
        version: healthVersion,
        uptime: 3600,
        services: { database: 'connected', vector_store: 'active', llm: 'connected' },
      },
    });
  });

  // Sessions (character-specific)
  await page.route('**/api/characters/*/sessions', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Relationship
  await page.route('**/api/characters/*/relationship', async (route) => {
    await route.fulfill({
      json: { relationship: { affinity: 50, tier: 'friend' } },
    });
  });

  // LLM status
  await page.route('**/api/llm/status', async (route) => {
    await route.fulfill({
      json: { connected: true, provider: 'LM Studio', model: 'test-model' },
    });
  });

  // Scan endpoints
  await page.route('**/api/scan/vrm', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });
  await page.route('**/api/scan/live2d', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });
  await page.route('**/api/scan/images', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Voice catalog
  await page.route('**/api/tts/voices*', async (route) => {
    await route.fulfill({ json: [] });
  });

  // TTS models
  await page.route('**/api/tts/models*', async (route) => {
    await route.fulfill({
      json: { models: [], catalog_updated: '2026-01-01', total_installed_mb: 0 },
    });
  });

  // Hardware info
  await page.route('**/api/hardware', async (route) => {
    await route.fulfill({
      json: { gpu_name: 'RTX 5080', vram_mb: 16384, ram_mb: 32768 },
    });
  });

  // LM Studio models (for hardware scan step)
  await page.route('**/api/lm-studio/models', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });

  // Ollama models
  await page.route('**/api/ollama/models', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });

  // Image gen status
  await page.route('**/api/image-gen/status', async (route) => {
    await route.fulfill({ json: { comfyui: 'disconnected', available: false } });
  });

  // ASR adapters
  await page.route('**/api/asr/adapters', async (route) => {
    await route.fulfill({ json: [] });
  });
}
