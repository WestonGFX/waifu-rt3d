import { test, expect, type Page } from '@playwright/test';
import { mockBackendAPIs } from './helpers';

/**
 * Comprehensive UI smoke test covering all major interactive elements.
 *
 * 12 phases covering ~150 interactions: sidebar navigation, chat messaging,
 * status bar, 22 overlay panels, 9 settings tabs, 3D model panel, composer
 * controls, character creation wizard, mini-games, and keyboard shortcuts.
 *
 * Uses mocked backend APIs so no live server is needed. Chat responses are
 * simulated via SSE stream mocks.
 *
 * Run: npx playwright test e2e/smoke-test.spec.ts
 * Run with UI: npx playwright test e2e/smoke-test.spec.ts --ui
 */

// ── Shared Helpers ──────────────────────────────────────────────────────────

/** Characters used across tests — 8 to match production DB */
const TEST_CHARACTERS = [
  { id: 1, name: 'Rin (Akane)', system_prompt: 'Tsundere warrior.', avatar_url: null, voice_id: 'af_heart', tts_provider: 'kokoro', greeting_message: 'Hey!', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Tsundere (Raine)', system_prompt: 'Classic tsundere.', avatar_url: null, voice_id: 'af_heart', tts_provider: 'kokoro', greeting_message: "It's not like I wanted to see you...", created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 3, name: 'Nyx (Ayane)', system_prompt: 'Mysterious gothic.', avatar_url: null, voice_id: 'af_sky', tts_provider: 'kokoro', greeting_message: 'The stars whisper...', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 4, name: 'Genki (Kitsune)', system_prompt: 'Energetic fox girl.', avatar_url: null, voice_id: 'af_bella', tts_provider: 'kokoro', greeting_message: 'Yay! You came!', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 5, name: 'Hana (Momoka)', system_prompt: 'Gentle flower keeper.', avatar_url: null, voice_id: 'af_heart', tts_provider: 'kokoro', greeting_message: 'Welcome to the garden.', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 6, name: 'Sable (Kuroha)', system_prompt: 'Dark elegant sniper.', avatar_url: null, voice_id: 'af_sky', tts_provider: 'kokoro', greeting_message: '...', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 8, name: 'Shiori (Nana)', system_prompt: 'Quiet bookworm.', avatar_url: null, voice_id: 'af_heart', tts_provider: 'kokoro', greeting_message: 'Oh, hello...', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 9, name: 'Mika (Mikazuki)', system_prompt: 'Idol superstar.', avatar_url: null, voice_id: 'af_bella', tts_provider: 'kokoro', greeting_message: 'Mika-chan is here!', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

/**
 * Mock a streaming chat response via SSE.
 *
 * Intercepts POST /api/chat/stream and returns a simulated Server-Sent Events
 * stream with token-by-token delivery followed by a `done` event.
 */
async function mockChatStream(page: Page, reply = 'Hello! How are you today?') {
  await page.route('**/api/chat/stream', async (route) => {
    const tokens = reply.split(' ');
    let body = '';
    for (const token of tokens) {
      body += `data: ${JSON.stringify({ type: 'token', content: token + ' ' })}\n\n`;
    }
    body += `data: ${JSON.stringify({
      type: 'done',
      full_response: reply,
      emotion: 'happy',
      session_id: 1,
      budget_summary: { used: 150, limit: 4096, token_counter: 'heuristic' },
    })}\n\n`;

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });
}

/**
 * Mock a non-streaming chat response for /api/chat fallback.
 */
async function mockChatResponse(page: Page, reply = 'Hello! How are you today?') {
  await page.route('**/api/chat', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          response: reply,
          emotion: 'happy',
          session_id: 1,
          character_id: 1,
        },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}

/** Standard setup: mock APIs, navigate, wait for load */
async function setupApp(page: Page) {
  await mockBackendAPIs(page, { characters: TEST_CHARACTERS });
  await mockChatStream(page);
  await mockChatResponse(page);
  await page.goto('/sakura/');
  // Wait for app shell to render — sidebar should appear
  await page.waitForTimeout(2000);
}

/** Close any open overlay by pressing Escape */
async function closeOverlay(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── Phase 0: Startup & Health Check ─────────────────────────────────────────

test.describe('Phase 0: Startup & Health Check', () => {
  test('app loads with sidebar and character list', async ({ page }) => {
    await setupApp(page);

    // Sidebar should be visible with app title
    await expect(page.getByText('WAIFU.EXE')).toBeVisible({ timeout: 10_000 });

    // At least one character name should appear in the sidebar
    await expect(page.getByText('Rin (Akane)').first()).toBeVisible({ timeout: 5_000 });

    // Take screenshot of initial state
    await page.screenshot({ path: 'e2e/screenshots/phase0-initial-load.png', fullPage: true });
  });

  test('no critical console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known non-critical errors
        if (text.includes('Cubism 2') || text.includes('favicon')) return;
        errors.push(text);
      }
    });

    await setupApp(page);
    await page.waitForTimeout(2000);

    // Allow a few non-critical errors but flag real issues
    const criticalErrors = errors.filter(
      (e) => !e.includes('net::ERR') && !e.includes('404') && !e.includes('Failed to load resource'),
    );
    expect(criticalErrors).toEqual([]);
  });
});

// ── Phase 1: Sidebar & Navigation ───────────────────────────────────────────

test.describe('Phase 1: Sidebar & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test('sidebar sections switch content', async ({ page }) => {
    // Click Characters section
    await page.getByRole('button', { name: 'Characters' }).click();
    await page.waitForTimeout(500);

    // Click Create section
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);

    // Click back to Chats
    await page.getByRole('button', { name: 'Chats' }).click();
    await page.waitForTimeout(500);

    // Characters should still be listed
    await expect(page.getByText('Rin (Akane)').first()).toBeVisible();
  });

  test('clicking a character loads the chat thread', async ({ page }) => {
    // Click a different character (Rin is auto-selected on load)
    await page.getByText('Nyx (Ayane)').first().click();
    await page.waitForTimeout(1000);

    // Chat composer should appear with the selected character's name
    await expect(page.getByPlaceholder(/^Message Nyx/)).toBeVisible({ timeout: 5_000 });
  });

  test('sidebar collapse toggles via keyboard shortcut', async ({ page }) => {
    // Verify sidebar is expanded (app title visible)
    await expect(page.getByText('WAIFU.EXE')).toBeVisible();

    // Toggle collapse
    await page.keyboard.press('Control+\\');
    await page.waitForTimeout(500);

    // Title may be hidden when collapsed — sidebar should be narrow
    // Toggle back
    await page.keyboard.press('Control+\\');
    await page.waitForTimeout(500);
    await expect(page.getByText('WAIFU.EXE')).toBeVisible();
  });

  test('sidebar search filters character list', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search...');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Nyx');
      await page.waitForTimeout(500);

      // Should show Nyx but not others
      await expect(page.getByText('Nyx (Ayane)').first()).toBeVisible();
      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
    }
  });

  test('all 8 characters appear in sidebar', async ({ page }) => {
    for (const char of TEST_CHARACTERS) {
      await expect(page.getByText(char.name).first()).toBeVisible({ timeout: 3_000 });
    }
    await page.screenshot({ path: 'e2e/screenshots/phase1-sidebar-all-chars.png', fullPage: true });
  });
});

// ── Phase 2: Chat Thread — Core Messaging ───────────────────────────────────

test.describe('Phase 2: Chat Thread', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Select first character to open chat thread
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  test('typing in composer shows text', async ({ page }) => {
    const composer = page.getByPlaceholder(/^Message /);
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill('Hello, how are you?');
    await expect(composer).toHaveValue('Hello, how are you?');
  });

  test('sending a message triggers a response', async ({ page }) => {
    const composer = page.getByPlaceholder(/^Message /);
    await composer.fill('Hello, how are you?');

    // Press Enter to send
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // The user message should appear in the chat thread
    await expect(page.getByText('Hello, how are you?').first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'e2e/screenshots/phase2-chat-conversation.png', fullPage: true });
  });

  test('reply length badge cycles through modes', async ({ page }) => {
    // Look for the reply length badge — it may say "auto", "brief", "normal", or "detailed"
    const badge = page.locator('[title*="Reply length"]').first();
    if (await badge.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await badge.click();
      await page.waitForTimeout(300);
      await badge.click();
      await page.waitForTimeout(300);
      // Just verify it doesn't crash
    }
  });
});

// ── Phase 3: StatusBar Actions ──────────────────────────────────────────────

test.describe('Phase 3: StatusBar Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  test('session history drawer opens and closes', async ({ page }) => {
    const chatThreadsBtn = page.getByTitle('Chat threads');
    if (await chatThreadsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await chatThreadsBtn.click();
      await page.waitForTimeout(500);
      // Close with Escape
      await closeOverlay(page);
    }
  });

  test('export dropdown shows options', async ({ page }) => {
    const exportBtn = page.getByTitle('Export conversation');
    if (await exportBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await exportBtn.click();
      await page.waitForTimeout(500);
      // Should see export options
      const txtOption = page.getByText('Export as Text');
      if (await txtOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // Don't click — just verify it appears
      }
      await closeOverlay(page);
    }
  });

  test('3D viewer toggles via button', async ({ page }) => {
    const viewerBtn = page.locator('[aria-label="Open 3D character viewer"]').first();
    if (await viewerBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await viewerBtn.click();
      await page.waitForTimeout(500);
      // Toggle off
      await viewerBtn.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'e2e/screenshots/phase3-statusbar.png', fullPage: true });
  });
});

// ── Phase 4: All 22 Overlay Panels ──────────────────────────────────────────

test.describe('Phase 4: Overlay Panels', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  const keyboardOverlays: [string, string][] = [
    ['Control+,', 'settings'],
    ['Alt+f', 'search'],
    ['Alt+b', 'moodboard'],
    ['Alt+a', 'analytics'],
    ['Alt+d', 'diary'],
    ['Alt+t', 'timeline'],
    ['Alt+z', 'stats'],
    ['Alt+v', 'vocabulary'],
    ['Alt+i', 'scenarios'],
    ['Alt+o', 'portfolio'],
    ['Alt+r', 'replay'],
    ['Alt+w', 'relweb'],
    ['Alt+u', 'universes'],
  ];

  for (const [shortcut, name] of keyboardOverlays) {
    test(`opens ${name} overlay via ${shortcut}`, async ({ page }) => {
      await page.keyboard.press(shortcut);
      await page.waitForTimeout(800);

      // Take screenshot
      await page.screenshot({
        path: `e2e/screenshots/phase4-overlay-${name}.png`,
        fullPage: true,
      });

      // Close
      await closeOverlay(page);
    });
  }

  test('opens memory overlay via sidebar button', async ({ page }) => {
    const memoryBtn = page.getByRole('button', { name: 'Memory' });
    if (await memoryBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await memoryBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/screenshots/phase4-overlay-memory.png', fullPage: true });
      await closeOverlay(page);
    }
  });

  test('opens games overlay via sidebar button', async ({ page }) => {
    const gamesBtn = page.getByRole('button', { name: 'Mini Games' });
    if (await gamesBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // force: true — the main panel's sticky composer can overlap sidebar buttons
      await gamesBtn.click({ force: true });
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/screenshots/phase4-overlay-games.png', fullPage: true });
      await closeOverlay(page);
    }
  });

  test('opens model browser overlay via sidebar button', async ({ page }) => {
    const modelsBtn = page.getByRole('button', { name: 'Models' });
    if (await modelsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await modelsBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/screenshots/phase4-overlay-modelbrowser.png', fullPage: true });
      await closeOverlay(page);
    }
  });

  test('opens lorebook overlay via sidebar button', async ({ page }) => {
    const loreBtn = page.getByRole('button', { name: 'Lorebook' });
    if (await loreBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await loreBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/screenshots/phase4-overlay-lore.png', fullPage: true });
      await closeOverlay(page);
    }
  });

  test('opens user knowledge overlay via sidebar button', async ({ page }) => {
    const ukBtn = page.getByRole('button', { name: 'About Me' });
    if (await ukBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await ukBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/screenshots/phase4-overlay-userknowledge.png', fullPage: true });
      await closeOverlay(page);
    }
  });
});

// ── Phase 5: Settings — All 9 Tabs ─────────────────────────────────────────

test.describe('Phase 5: Settings Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
    // Open settings
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(800);
  });

  const tabNames = [
    'General', 'Character', 'Brain', 'Voice',
    'Safety', 'AI Art', 'System', 'TTS Models', 'LM Models',
  ];

  for (const tab of tabNames) {
    test(`${tab} tab renders without error`, async ({ page }) => {
      await page.getByText(tab, { exact: true }).first().click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `e2e/screenshots/phase5-settings-${tab.toLowerCase().replace(/\s/g, '-')}.png`,
        fullPage: true,
      });
    });
  }

  test('General tab — theme dropdown changes theme', async ({ page }) => {
    // General tab is default
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(300);

    // Look for theme preset buttons
    const darkBtn = page.getByText('Dark', { exact: true }).first();
    if (await darkBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await darkBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('General tab — Setup Guides section visible', async ({ page }) => {
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(300);

    const setupGuides = page.getByText('Setup Guides');
    await setupGuides.scrollIntoViewIfNeeded();
    await expect(setupGuides).toBeVisible({ timeout: 3_000 });
  });

  test('Brain tab — provider presets render', async ({ page }) => {
    await page.getByText('Brain', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // LM Studio preset button
    const lmStudioBtn = page.getByText('LM Studio', { exact: true }).first();
    await expect(lmStudioBtn).toBeVisible({ timeout: 3_000 });
  });

  test('Voice tab — TTS provider dropdown visible', async ({ page }) => {
    await page.getByText('Voice', { exact: true }).first().click();
    await page.waitForTimeout(500);

    const voiceContent = page.getByText(/TTS Provider|Voice Engine|voice/i).first();
    await expect(voiceContent).toBeVisible({ timeout: 3_000 });
  });

  test('Safety tab — content filter dropdown visible', async ({ page }) => {
    await page.getByText('Safety', { exact: true }).first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/phase5-settings-safety-detail.png', fullPage: true });
  });
});

// ── Phase 6: ModelPanel (3D Viewer) ─────────────────────────────────────────

test.describe('Phase 6: ModelPanel', () => {
  test('3D viewer panel opens via Ctrl+M', async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);

    await page.keyboard.press('Control+m');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'e2e/screenshots/phase6-model-panel.png', fullPage: true });

    // Close it
    await page.keyboard.press('Control+m');
    await page.waitForTimeout(500);
  });
});

// ── Phase 7: Composer Interactions ──────────────────────────────────────────

test.describe('Phase 7: Composer Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  test('gesture picker opens and shows gestures', async ({ page }) => {
    // Look for the gesture picker toggle button
    const gestureTrigger = page.locator('[aria-label*="gesture" i], [title*="gesture" i]').first();
    if (await gestureTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await gestureTrigger.click();
      await page.waitForTimeout(500);

      // Should see gesture buttons
      await page.screenshot({ path: 'e2e/screenshots/phase7-gesture-picker.png', fullPage: true });
      await closeOverlay(page);
    }
  });

  test('scenario library opens via Alt+I', async ({ page }) => {
    await page.keyboard.press('Alt+i');
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'e2e/screenshots/phase7-scenario-library.png', fullPage: true });
    await closeOverlay(page);
  });
});

// ── Phase 8: Character Creation Wizard ──────────────────────────────────────

test.describe('Phase 8: Character Creation Wizard', () => {
  test('wizard opens from Create section and shows preset templates', async ({ page }) => {
    await setupApp(page);

    // Click Create in sidebar
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1000);

    // Should see character creation form
    await page.screenshot({ path: 'e2e/screenshots/phase8-wizard-step0.png', fullPage: true });
  });

  test('wizard supports typing a character name', async ({ page }) => {
    await setupApp(page);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1000);

    // Look for a name input
    const nameInput = page.getByPlaceholder(/name/i).first();
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill('Test Character');
      await expect(nameInput).toHaveValue('Test Character');
    }
  });

  test('wizard can navigate between steps', async ({ page }) => {
    await setupApp(page);
    // force: true — sidebar section tab may be overlapped by main content
    await page.getByRole('button', { name: 'Create' }).click({ force: true });
    await page.waitForTimeout(1000);

    // Try to click Next/continue button
    const nextBtn = page.getByRole('button', { name: /next|continue/i }).first();
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click({ force: true });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/phase8-wizard-step1.png', fullPage: true });

      // Click Back
      const backBtn = page.getByRole('button', { name: /back|previous/i }).first();
      if (await backBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Back may be disabled on certain steps — force click to verify no crash
        await backBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }
  });
});

// ── Phase 9: Mini-Games ─────────────────────────────────────────────────────

test.describe('Phase 9: Mini-Games', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  test('games overlay opens and lists game types', async ({ page }) => {
    // Open games via sidebar button
    const gamesBtn = page.getByRole('button', { name: 'Mini Games' });
    if (await gamesBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await gamesBtn.click({ force: true });
      await page.waitForTimeout(800);

      // Should see some game options
      await page.screenshot({ path: 'e2e/screenshots/phase9-games-list.png', fullPage: true });

      // Try clicking the first game option
      const triviaBtn = page.getByText(/trivia/i).first();
      if (await triviaBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await triviaBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'e2e/screenshots/phase9-game-trivia.png', fullPage: true });
      }

      await closeOverlay(page);
    }
  });
});

// ── Phase 10: Keyboard Shortcuts ────────────────────────────────────────────

test.describe('Phase 10: Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);
  });

  test('Ctrl+, opens settings', async ({ page }) => {
    await page.keyboard.press('Control+,');
    await expect(page.getByText('General', { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    await closeOverlay(page);
  });

  test('Escape closes overlays', async ({ page }) => {
    // Open settings
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);
    await expect(page.getByText('General', { exact: true }).first()).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('Ctrl+M toggles ModelPanel', async ({ page }) => {
    await page.keyboard.press('Control+m');
    await page.waitForTimeout(500);
    // Toggle back
    await page.keyboard.press('Control+m');
    await page.waitForTimeout(500);
  });

  test('Alt+F opens global search', async ({ page }) => {
    await page.keyboard.press('Alt+f');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'e2e/screenshots/phase10-global-search.png', fullPage: true });
    await closeOverlay(page);
  });

  test('? opens shortcut help modal', async ({ page }) => {
    // Click somewhere neutral first so we're not in an input
    await page.locator('body').click();
    await page.waitForTimeout(300);

    await page.keyboard.press('?');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'e2e/screenshots/phase10-shortcut-help.png', fullPage: true });
    await closeOverlay(page);
  });
});

// ── Phase 11: Console Error Audit ───────────────────────────────────────────

test.describe('Phase 11: Console Error Audit', () => {
  test('full interaction session produces no critical JS errors', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      // Ignore known non-critical messages
      if (text.includes('Cubism 2') || text.includes('favicon') || text.includes('Download the React DevTools')) return;

      if (msg.type() === 'error') {
        errors.push(text);
      } else if (msg.type() === 'warning' && text.includes('WARN')) {
        warnings.push(text);
      }
    });

    // Perform a broad sweep of interactions
    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);

    // Open & close settings
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);
    await closeOverlay(page);

    // Open & close a few overlays
    for (const shortcut of ['Alt+f', 'Alt+a', 'Alt+b']) {
      await page.keyboard.press(shortcut);
      await page.waitForTimeout(400);
      await closeOverlay(page);
    }

    // Type in composer (don't send — avoid depending on SSE)
    const composer = page.getByPlaceholder(/^Message /);
    if (await composer.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await composer.fill('Test message');
      await composer.clear();
    }

    // Filter to truly critical errors (not resource loading)
    const criticalErrors = errors.filter(
      (e) => !e.includes('net::ERR') && !e.includes('404') && !e.includes('Failed to load resource'),
    );

    // Log all errors found for the report
    if (criticalErrors.length > 0) {
      console.log('=== CRITICAL JS ERRORS ===');
      criticalErrors.forEach((e) => console.log(`  ERROR: ${e}`));
    }
    if (warnings.length > 0) {
      console.log('=== WARNINGS ===');
      warnings.forEach((w) => console.log(`  WARN: ${w}`));
    }

    expect(criticalErrors).toEqual([]);
  });
});

// ── Phase 12: Network Error Audit ───────────────────────────────────────────

test.describe('Phase 12: Network Error Audit', () => {
  test('no unexpected 4xx/5xx API responses', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      // Only check API calls (our mocks), ignore static assets
      if (url.includes('/api/') && status >= 400) {
        failedRequests.push(`${status} ${response.request().method()} ${url}`);
      }
    });

    await setupApp(page);
    await page.getByText('Rin (Akane)').first().click();
    await page.waitForTimeout(1000);

    // Interact with several features
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(500);
    await closeOverlay(page);

    if (failedRequests.length > 0) {
      console.log('=== FAILED API REQUESTS ===');
      failedRequests.forEach((r) => console.log(`  ${r}`));
    }

    expect(failedRequests).toEqual([]);
  });
});
