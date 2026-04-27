import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

// ── Heavy mocks to keep SettingsView renderable ───────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../lib/api', () => ({
  api: {
    scanVrm: vi.fn().mockResolvedValue([]),
    scanLive2d: vi.fn().mockResolvedValue([]),
    scanImages: vi.fn().mockResolvedValue([]),
    getVoices: vi.fn().mockResolvedValue([]),
    getDefaultVoice: vi.fn().mockResolvedValue({ voice_id: '', provider: '', name: '' }),
    getTTSModels: vi.fn().mockResolvedValue({ ok: true, models: [], installed: [] }),
    getInstalledModels: vi.fn().mockResolvedValue([]),
    getRecommendedModels: vi.fn().mockResolvedValue([]),
    getHardwareInfo: vi.fn().mockResolvedValue({}),
    getDownloadStatus: vi.fn().mockResolvedValue({ active: false }),
    getActiveModelCapabilities: vi.fn().mockResolvedValue({ ok: false }),
    getRelationship: vi.fn().mockResolvedValue({ affinity: 0.5, mood: 0.5, trust: 0.5, interactions: 0, last_updated: null }),
    resetRelationship: vi.fn().mockResolvedValue({ ok: true }),
    getCharacters: vi.fn().mockResolvedValue([]),
    createCharacter: vi.fn().mockResolvedValue({ id: 99, name: 'Imported', system_prompt: 'You are...' }),
    updateCharacter: vi.fn().mockResolvedValue({}),
    deleteCharacter: vi.fn().mockResolvedValue({ ok: true }),
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getStats: vi.fn().mockResolvedValue({}),
    getVocabStats: vi.fn().mockResolvedValue({ total: 0, base_count: 0, user_count: 0, category_count: 0 }),
    uploadAvatar: vi.fn().mockResolvedValue({ url: '/api/avatars/test.jpg' }),
    getExprPortraits: vi.fn().mockResolvedValue({ expr_portraits: {} }),
    listExpressionPortraits: vi.fn().mockResolvedValue({ ok: true, portraits: {}, mode: 0 }),
    getUserFacts: vi.fn().mockResolvedValue({ facts: [] }),
    getMemoryStats: vi.fn().mockResolvedValue({ total: 0 }),
    // FormatRulesEditor mounts inside the Character tab and fetches on mount.
    // Without these stubs the editor throws "api.getFormatRules is not a function"
    // and crashes the SettingsView subtree before Export/Import controls can render.
    getFormatRules: vi.fn().mockResolvedValue({ rules: [] }),
    createFormatRule: vi.fn().mockResolvedValue({ ok: true }),
    updateFormatRule: vi.fn().mockResolvedValue({ ok: true }),
    deleteFormatRule: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

// ── Test character fixture ────────────────────────────────────────────────────

const CHAR = {
  id: 7,
  name: 'Aria',
  system_prompt: 'You are Aria, a cheerful assistant.',
  greeting_message: 'Hello!',
  avatar_url: '',
  voice_id: '',
  tts_provider: 'edge-tts',
};

/**
 * Tests for character JSON export and import in Settings > Character tab.
 *
 * Export: serializes to JSON with id field stripped.
 * Import: reads JSON, validates required fields, calls api.createCharacter.
 */
describe('SettingsView — character export / import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      activeCharacter: CHAR as ReturnType<typeof useAppStore.getState>['activeCharacter'],
      characters: [CHAR] as unknown as ReturnType<typeof useAppStore.getState>['characters'],
      config: {},
      configLoaded: true,
      activeOverlay: 'settings',
    } as unknown as Parameters<typeof useAppStore.setState>[0]);
  });

  // ── Export ─────────────────────────────────────────────────────────────────

  it('export creates a JSON blob without the id field', async () => {
    // Capture whatever blob gets passed to URL.createObjectURL
    let capturedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:fake-url';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    // Stub anchor.click() so nothing tries to download
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    render(<SettingsView />);

    // Navigate to Character tab
    fireEvent.click(screen.getByText('Character', { selector: '.settings-tab-pill' }));

    // Click the Export button (exact match — not "Export Card")
    await waitFor(() => expect(screen.getByText('Export')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Export'));

    // Verify the blob was created and anchor was clicked
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    // Parse the blob content and check id is absent
    const text = await capturedBlob!.text();
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe('Aria');
    expect(parsed.system_prompt).toContain('Aria');
    expect(parsed).not.toHaveProperty('id');
  });

  // ── Import ─────────────────────────────────────────────────────────────────

  it('import calls api.createCharacter with parsed name and system_prompt', async () => {
    const importData = {
      name: 'Nova',
      system_prompt: 'You are Nova, a quiet librarian.',
      greeting_message: 'Shh…',
    };

    // `new FileReader()` requires a real constructor — arrow functions and vi.fn()
    // wrappers are not constructable.  We use a class expression so `new FileReader()`
    // works, and defer the onload call via Promise so the component has a chance to
    // set reader.onload before we fire it.
    const jsonResult = JSON.stringify(importData);
    const FakeFileReader = class {
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsText() {
        const handler = this.onload;
        Promise.resolve().then(() => {
          handler?.({ target: { result: jsonResult } } as unknown as ProgressEvent<FileReader>);
        });
      }
    };
    vi.stubGlobal('FileReader', FakeFileReader);

    render(<SettingsView />);

    // Navigate to Character tab
    fireEvent.click(screen.getByText('Character', { selector: '.settings-tab-pill' }));

    // Find the hidden file input
    // Target the JSON import input specifically (not the avatar image input)
    await waitFor(() => {
      const input = document.querySelector('input[accept=".json,application/json"]');
      expect(input).not.toBeNull();
    });
    const input = document.querySelector('input[accept=".json,application/json"]') as HTMLInputElement;

    const file = new File([JSON.stringify(importData)], 'nova.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(api.createCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nova',
          system_prompt: expect.stringContaining('Nova'),
        })
      );
    });
  });

  it('import shows an error when required fields are missing', async () => {
    const badData = { greeting_message: 'Hello' }; // missing name and system_prompt

    const jsonResult = JSON.stringify(badData);
    const FakeFileReader = class {
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsText() {
        const handler = this.onload;
        Promise.resolve().then(() => {
          handler?.({ target: { result: jsonResult } } as unknown as ProgressEvent<FileReader>);
        });
      }
    };
    vi.stubGlobal('FileReader', FakeFileReader);

    render(<SettingsView />);
    fireEvent.click(screen.getByText('Character', { selector: '.settings-tab-pill' }));

    // Target the JSON import input specifically (not the avatar image input)
    await waitFor(() => {
      const input = document.querySelector('input[accept=".json,application/json"]');
      expect(input).not.toBeNull();
    });
    const input = document.querySelector('input[accept=".json,application/json"]') as HTMLInputElement;
    const file = new File([JSON.stringify(badData)], 'bad.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/missing required/i)).toBeInTheDocument();
    });
    expect(api.createCharacter).not.toHaveBeenCalled();
  });
});
