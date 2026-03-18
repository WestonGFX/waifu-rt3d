import { loadState, saveState } from './storageService.ts';
import { type ChatMessage } from '../types/index.ts';

const FIGMA_HOMEPAGE_PRESET = 'figma-home-desktop';
const FIGMA_HOMEPAGE_MODEL_URL = '/local-models/melon_r18%2B.vrm';

function buildFigmaHomepageMessages(baseTimestamp: number): ChatMessage[] {
  return [
    {
      id: 'preset-user-1',
      role: 'user',
      content: 'Hey Melon, give me a cute hello and ask what we should talk about today.',
      timestamp: baseTimestamp - 12000,
    },
    {
      id: 'preset-assistant-1',
      role: 'assistant',
      content: 'Hiii~ I am ready whenever you are. Want anime recs, outfit ideas, or a fun little roleplay scene?',
      timestamp: baseTimestamp - 9000,
      isStreaming: false,
    },
    {
      id: 'preset-user-2',
      role: 'user',
      content: 'Let’s do anime recs for chill vibes tonight.',
      timestamp: baseTimestamp - 6000,
    },
    {
      id: 'preset-assistant-2',
      role: 'assistant',
      content: 'Perfect choice. I would start with Frieren, Yuru Camp, and Apothecary Diaries. Want me to rank them by mood?',
      timestamp: baseTimestamp - 3000,
      isStreaming: false,
    },
  ];
}

export function applyDevPresetFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset');
  if (preset !== FIGMA_HOMEPAGE_PRESET) return;

  const currentState = loadState();
  saveState({
    ...currentState,
    setupComplete: true,
    renderMode: '3d',
    chatHistory: buildFigmaHomepageMessages(Date.now()),
    modelUrl: FIGMA_HOMEPAGE_MODEL_URL,
  });
}
