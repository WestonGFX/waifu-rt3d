import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { useChatStore } from './stores/chatStore';
import * as api from './lib/api';

vi.mock('./hooks/useVoiceLevels', () => ({
  useVoiceLevels: () => ({
    level: 0,
    sample: { level: 0, source: 'idle', timestamp: 0 },
    micEnabled: false,
    micError: null,
    toggleMic: vi.fn(),
  }),
}));

vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof import('./lib/api')>('./lib/api');
  return {
    ...actual,
    fetchCharacters: vi.fn(),
    fetchUiConfig: vi.fn(),
    fetchMemoryGraph: vi.fn().mockResolvedValue({
      mode: 'session',
      nodes: [],
      edges: [],
      stats: { sessionMessages: 0, memoryHits: 0, ragAvailable: false },
    }),
  };
});

const mockedFetchCharacters = vi.mocked(api.fetchCharacters);
const mockedFetchUiConfig = vi.mocked(api.fetchUiConfig);

describe('App settings bootstrap', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      draft: '',
      isTyping: false,
      loading: false,
      lastError: null,
      sessionId: 1,
      charId: 1,
      lastAudioUrl: null,
    });

    mockedFetchCharacters.mockReset();
    mockedFetchUiConfig.mockReset();

    mockedFetchCharacters.mockResolvedValue([
      {
        id: 1,
        name: 'Airi',
        system_prompt: 'Main character',
      },
    ] as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('applies speech_auto from config to the TTS toggle', async () => {
    mockedFetchUiConfig.mockResolvedValue({
      llm: { temperature: 0.9 },
      tts: { tts_pitch: 1.2 },
      ui: { speech_auto: false },
    } as never);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'TTS' })).not.toBeChecked();
    });
  });

  it('preloads HUD controls from fetched config', async () => {
    mockedFetchUiConfig.mockResolvedValue({
      llm: { temperature: 0.95 },
      tts: { tts_pitch: 1.25 },
      ui: { speech_auto: false },
    } as never);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open HUD' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open HUD' }));

    expect(await screen.findByRole('heading', { name: 'Settings HUD' })).toBeInTheDocument();
    expect(screen.getByLabelText('Voice Pitch')).toHaveValue('1.25');
    expect(screen.getByLabelText('Creativity')).toHaveValue('0.95');
    expect(screen.getByRole('checkbox', { name: 'Manual transmit only' })).not.toBeChecked();
  });
});
