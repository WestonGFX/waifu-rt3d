# Sakura Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a consumer-grade React frontend ("Sakura") alongside the existing neon frontend, with chat-first visual novel UX, Sakura/Crystal themes, and progressive disclosure settings.

**Architecture:** React 19 + Vite + TypeScript + Tailwind CSS + Shadcn/ui + Framer Motion. Shared assets (viewer iframe, Three.js libs) in `frontends/shared/`. Both frontends talk to the same FastAPI backend at `/api/*`. Sakura served at `/` (new default), neon at `/neon`.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Shadcn/ui, Framer Motion 12, Zustand 5, Lucide React icons

**Design Doc:** `docs/plans/2026-02-26-sakura-frontend-design.md`

**Reference Implementation:** `frontends/v2/` (React 19 + Vite + Zustand — use for dep versions and patterns)

---

## Task 1: Move Shared Assets to `frontends/shared/`

Before creating Sakura, extract viewer and libs from neon so both frontends can reference them.

**Files:**
- Create: `frontends/shared/viewer/` (move from `frontends/neon/viewer/`)
- Create: `frontends/shared/lib/` (move from `frontends/neon/lib/`)
- Modify: `frontends/neon/index.html` — update script/iframe paths
- Modify: `backend/server.py` — add `/shared` static mount

**Step 1: Create shared directory and move files**

```bash
mkdir -p frontends/shared
mv frontends/neon/viewer frontends/shared/viewer
mv frontends/neon/lib frontends/shared/lib
```

**Step 2: Create symlinks in neon for backward compatibility**

```bash
cd frontends/neon
ln -s ../shared/viewer viewer
ln -s ../shared/lib lib
cd ../..
```

**Step 3: Add `/shared` static mount in `backend/server.py`**

Find the existing static mounts (~line 120-140) and add before the neon mounts:

```python
app.mount("/shared", StaticFiles(directory=str(BASE / "frontends" / "shared")), name="shared")
```

**Step 4: Update neon's `index.html` paths (if symlinks don't resolve)**

Verify the symlinks work by checking that `http://localhost:8080/viewer/viewer.html` still loads. If not, update paths to `/shared/viewer/` and `/shared/lib/`.

**Step 5: Verify**

```bash
# Confirm symlinks exist
ls -la frontends/neon/viewer frontends/neon/lib
# Confirm shared directory has files
ls frontends/shared/viewer/ frontends/shared/lib/
```

**Step 6: Commit**

```bash
git add -A frontends/shared/ frontends/neon/viewer frontends/neon/lib
git commit -m "refactor: move viewer and lib to frontends/shared/ for multi-frontend support"
```

---

## Task 2: Scaffold Sakura Vite + React Project

**Files:**
- Create: `frontends/sakura/package.json`
- Create: `frontends/sakura/vite.config.ts`
- Create: `frontends/sakura/tsconfig.json`
- Create: `frontends/sakura/tsconfig.app.json`
- Create: `frontends/sakura/tsconfig.node.json`
- Create: `frontends/sakura/index.html`
- Create: `frontends/sakura/src/main.tsx`
- Create: `frontends/sakura/src/App.tsx`
- Create: `frontends/sakura/src/index.css`
- Create: `frontends/sakura/src/vite-env.d.ts`

**Step 1: Create `package.json`**

Use exact versions from the working v2 frontend where possible:

```json
{
  "name": "sakura",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "framer-motion": "^12.34.0",
    "lucide-react": "^0.468.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.18",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "tailwindcss": "^4.1.18",
    "typescript": "~5.9.3",
    "vite": "^7.3.1",
    "vitest": "^4.0.18",
    "jsdom": "^28.0.0"
  }
}
```

**Step 2: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/files': 'http://127.0.0.1:8080',
      '/shared': 'http://127.0.0.1:8080',
      '/images': 'http://127.0.0.1:8080',
      '/live2d': 'http://127.0.0.1:8080',
      '/assets': 'http://127.0.0.1:8080'
    }
  },
  build: {
    outDir: 'dist'
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules/**', 'dist/**']
  }
});
```

**Step 3: Create TypeScript configs**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sakura</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create entry files**

`src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`src/App.tsx`:
```tsx
export function App() {
  return (
    <div className="min-h-screen bg-background text-primary flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Sakura</h1>
    </div>
  );
}
```

`src/index.css`:
```css
@import "tailwindcss";
```

`src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

**Step 6: Install dependencies and verify build**

```bash
cd frontends/sakura && npm install && npm run build
```

**Step 7: Commit**

```bash
git add frontends/sakura/
echo "frontends/sakura/node_modules/" >> .gitignore
echo "frontends/sakura/dist/" >> .gitignore
git add .gitignore
git commit -m "feat(sakura): scaffold React 19 + Vite + TypeScript + Tailwind project"
```

---

## Task 3: Theme System (Sakura + Crystal CSS Variables)

**Files:**
- Create: `frontends/sakura/src/styles/themes.css`
- Create: `frontends/sakura/src/styles/base.css`
- Create: `frontends/sakura/src/hooks/useTheme.ts`
- Modify: `frontends/sakura/src/index.css`

**Step 1: Create `src/styles/themes.css`**

Define both theme modes as CSS custom properties:

```css
/* Sakura Mode (default) — warm rose */
:root, [data-theme="sakura"] {
  --color-background: #FFF5F7;
  --color-surface: #FFFFFF;
  --color-border: #F3E0E6;
  --color-text-primary: #2D1B24;
  --color-text-secondary: #9B8A92;
  --color-accent: #E8788A;
  --color-accent-hover: #D4566A;
  --color-accent-text: #FFFFFF;
  --color-success: #7BC9A0;
  --color-warning: #F0C27A;
  --color-danger: #E05A6D;
  --shadow-card: 0 2px 12px rgba(232, 120, 138, 0.08);
  --shadow-elevated: 0 8px 32px rgba(232, 120, 138, 0.12);
  --radius-card: 16px;
  --radius-button: 12px;
  --radius-input: 10px;
}

/* Crystal Mode — cool ice */
[data-theme="crystal"] {
  --color-background: #F8FAFB;
  --color-surface: #FFFFFF;
  --color-border: #E2E8F0;
  --color-text-primary: #1A202C;
  --color-text-secondary: #94A3B8;
  --color-accent: #6B8AED;
  --color-accent-hover: #5472D4;
  --color-accent-text: #FFFFFF;
  --color-success: #68D391;
  --color-warning: #F6BE5C;
  --color-danger: #FC6B6B;
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
  --shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.1);
  --radius-card: 12px;
  --radius-button: 10px;
  --radius-input: 8px;
}
```

**Step 2: Create `src/styles/base.css`**

```css
body {
  margin: 0;
  padding: 0;
  font-family: 'SF Pro Text', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

* {
  transition-timing-function: ease-out;
}
```

**Step 3: Create `src/hooks/useTheme.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'sakura' | 'crystal';

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'sakura',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      toggle: () =>
        set((state) => {
          const next = state.theme === 'sakura' ? 'crystal' : 'sakura';
          document.documentElement.setAttribute('data-theme', next);
          return { theme: next };
        })
    }),
    { name: 'sakura-theme' }
  )
);
```

**Step 4: Update `src/index.css`**

```css
@import "tailwindcss";
@import "./styles/themes.css";
@import "./styles/base.css";
```

**Step 5: Verify themes render**

Update App.tsx temporarily to show a themed card, run `npm run dev`, check both themes.

**Step 6: Commit**

```bash
git commit -m "feat(sakura): add Sakura + Crystal theme system with CSS custom properties"
```

---

## Task 4: Core Infrastructure (Types, API Client, Stores)

**Files:**
- Create: `frontends/sakura/src/lib/api.ts`
- Create: `frontends/sakura/src/lib/types.ts`
- Create: `frontends/sakura/src/lib/events.ts`
- Create: `frontends/sakura/src/stores/appStore.ts`
- Create: `frontends/sakura/src/stores/chatStore.ts`

**Step 1: Create `src/lib/types.ts`**

Port and extend types from v2's `types/index.ts`. Add all fields the backend actually returns:

```typescript
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'sent' | 'failed';

export interface Character {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url?: string;
  voice_id?: string;
  tts_provider?: string;
  model_type?: string;
  model_vrm?: string;
  live2d_model?: string;
  background_url?: string;
  background_mode?: string;
  greeting_message?: string;
  llm_endpoint?: string;
  llm_model?: string;
  llm_temperature?: number;
  animation_profile?: {
    energy: number;
    confidence: number;
    nervousness: number;
    expressiveness: number;
    playfulness: number;
  };
  capability_profile?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  status: MessageStatus;
  serverMessageId?: number;
  emotion?: string;
  gesture?: string;
  audioUrl?: string;
  tokens?: number;
  tokensPerSecond?: number;
  latencyMs?: number;
  model?: string;
}

export interface Session {
  id: number;
  character_id: number;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatResponse {
  ok: boolean;
  reply: string;
  audio: string | null;
  session_id: number;
  emotion?: string;
  intensity?: number;
  gesture?: string | null;
  user_message_id?: number;
  assistant_message_id?: number;
  tokens_used?: number;
  tokens_per_second?: number;
  ttft_ms?: number;
  model?: string;
}

export interface AppConfig {
  [key: string]: unknown;
}

export interface VoiceEntry {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  installed?: boolean;
}
```

**Step 2: Create `src/lib/api.ts`**

Typed API client wrapping fetch. Port pattern from v2 but cover more endpoints:

```typescript
import type { AppConfig, Character, ChatResponse, Session, VoiceEntry } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  // Config
  getConfig: () => get<AppConfig>('/api/config'),
  saveConfig: (config: Partial<AppConfig>) => put<{ ok: boolean; config: AppConfig }>('/api/config', config),

  // Characters
  getCharacters: () => get<{ characters: Character[] }>('/api/characters').then(d => d.characters),
  createCharacter: (data: Partial<Character>) => post<Character>('/api/characters', data),
  updateCharacter: (id: number, data: Partial<Character>) => put<Character>(`/api/characters/${id}`, data),
  deleteCharacter: (id: number) => del<{ ok: boolean }>(`/api/characters/${id}`),

  // Sessions
  getSessions: () => get<{ sessions: Session[] }>('/api/sessions').then(d => d.sessions),
  createSession: (charId: number) => post<Session>('/api/sessions', { character_id: charId }),
  getMessages: (sessionId: number) => get<{ messages: Array<{ id: number; role: string; content: string; created_at: string }> }>(`/api/sessions/${sessionId}/messages`),

  // Chat
  sendChat: (req: { text: string; session_id: number; char_id: number; speak: boolean }) =>
    post<ChatResponse>('/api/chat', req),

  // TTS
  getVoices: (provider?: string) => {
    const params = provider ? `?provider=${provider}` : '';
    return get<{ voices: VoiceEntry[] }>(`/api/tts/voices${params}`).then(d => d.voices);
  },

  // Files
  scanVrm: () => get<{ models: string[] }>('/api/scan/vrm').then(d => d.models),
  scanImages: () => get<{ images: string[] }>('/api/scan/images').then(d => d.images),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/upload/avatar', { method: 'POST', body: form }).then(r => r.json());
  }
};
```

**Step 3: Create `src/lib/events.ts`**

Lightweight pub/sub for cross-component communication:

```typescript
type Handler = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Handler>>();

export const events = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  emit(event: string, ...args: unknown[]) {
    listeners.get(event)?.forEach(fn => fn(...args));
  },

  off(event: string, handler: Handler) {
    listeners.get(event)?.delete(handler);
  }
};
```

**Step 4: Create `src/stores/appStore.ts`**

Global app state (active character, config, layout):

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, AppConfig } from '../lib/types';
import { api } from '../lib/api';

type Tab = 'chats' | 'discover' | 'create' | 'memory' | 'settings';
type ChatLayout = 'chat-first' | 'model-first' | 'split';

interface AppState {
  // Navigation
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Characters
  characters: Character[];
  activeCharacter: Character | null;
  setActiveCharacter: (char: Character) => void;
  loadCharacters: () => Promise<void>;

  // Config
  config: AppConfig;
  loadConfig: () => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;

  // Layout
  chatLayout: ChatLayout;
  setChatLayout: (layout: ChatLayout) => void;
  modelPanelOpen: boolean;
  toggleModelPanel: () => void;
  memoryPanelOpen: boolean;
  toggleMemoryPanel: () => void;

  // Settings
  advancedMode: boolean;
  toggleAdvancedMode: () => void;
  compactMode: boolean;
  toggleCompactMode: () => void;

  // Chat thread navigation
  inChatThread: boolean;
  openChatThread: (char: Character) => void;
  closeChatThread: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeTab: 'chats',
      setActiveTab: (tab) => set({ activeTab: tab }),

      characters: [],
      activeCharacter: null,
      setActiveCharacter: (char) => set({ activeCharacter: char }),
      loadCharacters: async () => {
        const characters = await api.getCharacters();
        set({ characters });
      },

      config: {},
      loadConfig: async () => {
        const config = await api.getConfig();
        set({ config });
      },
      saveConfig: async (patch) => {
        const merged = { ...get().config, ...patch };
        await api.saveConfig(merged);
        set({ config: merged });
      },

      chatLayout: 'chat-first',
      setChatLayout: (layout) => set({ chatLayout: layout }),
      modelPanelOpen: false,
      toggleModelPanel: () => set((s) => ({ modelPanelOpen: !s.modelPanelOpen })),
      memoryPanelOpen: false,
      toggleMemoryPanel: () => set((s) => ({ memoryPanelOpen: !s.memoryPanelOpen })),

      advancedMode: false,
      toggleAdvancedMode: () => set((s) => ({ advancedMode: !s.advancedMode })),
      compactMode: false,
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),

      inChatThread: false,
      openChatThread: (char) => set({ activeCharacter: char, inChatThread: true }),
      closeChatThread: () => set({ inChatThread: false })
    }),
    {
      name: 'sakura-app',
      partialize: (s) => ({
        chatLayout: s.chatLayout,
        advancedMode: s.advancedMode,
        compactMode: s.compactMode,
        activeTab: s.activeTab
      })
    }
  )
);
```

**Step 5: Create `src/stores/chatStore.ts`**

Port and extend from v2's chatStore pattern. Add SSE streaming support stub:

```typescript
import { create } from 'zustand';
import type { ChatMessage } from '../lib/types';
import { api } from '../lib/api';

interface ChatState {
  messages: ChatMessage[];
  draft: string;
  loading: boolean;
  sessionId: number | null;
  charId: number | null;

  setDraft: (text: string) => void;
  setContext: (sessionId: number, charId: number) => void;
  sendMessage: (text: string, speak?: boolean) => Promise<void>;
  loadHistory: (sessionId: number) => Promise<void>;
  clear: () => void;
}

const genId = () => crypto.randomUUID();

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  draft: '',
  loading: false,
  sessionId: null,
  charId: null,

  setDraft: (text) => set({ draft: text }),

  setContext: (sessionId, charId) => set({ sessionId, charId, messages: [] }),

  clear: () => set({ messages: [], draft: '', loading: false }),

  loadHistory: async (sessionId) => {
    const data = await api.getMessages(sessionId);
    const messages: ChatMessage[] = data.messages.map((m) => ({
      id: String(m.id),
      role: m.role as ChatMessage['role'],
      text: m.content,
      createdAt: new Date(m.created_at).getTime(),
      status: 'sent',
      serverMessageId: m.id
    }));
    set({ messages });
  },

  sendMessage: async (text, speak = true) => {
    const { sessionId, charId, loading } = get();
    if (loading || !sessionId || !charId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
      status: 'sent'
    };
    const assistantMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      text: '',
      createdAt: Date.now(),
      status: 'pending'
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      loading: true,
      draft: ''
    }));

    try {
      const res = await api.sendChat({
        text: trimmed,
        session_id: sessionId,
        char_id: charId,
        speak
      });

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                text: res.reply,
                status: 'sent' as const,
                emotion: res.emotion,
                gesture: res.gesture ?? undefined,
                audioUrl: res.audio ?? undefined,
                tokens: res.tokens_used,
                tokensPerSecond: res.tokens_per_second,
                latencyMs: res.ttft_ms,
                model: res.model,
                serverMessageId: res.assistant_message_id
              }
            : m
        ),
        loading: false
      }));
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, text: 'Failed to get response.', status: 'failed' as const }
            : m
        ),
        loading: false
      }));
    }
  }
}));
```

**Step 6: Verify TypeScript compiles**

```bash
cd frontends/sakura && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git commit -m "feat(sakura): add typed API client, event bus, app store, and chat store"
```

---

## Task 5: App Shell + Tab Bar + Routing

**Files:**
- Create: `frontends/sakura/src/components/TabBar.tsx`
- Create: `frontends/sakura/src/views/ChatsView.tsx` (placeholder)
- Create: `frontends/sakura/src/views/DiscoverView.tsx` (placeholder)
- Create: `frontends/sakura/src/views/CreateView.tsx` (placeholder)
- Create: `frontends/sakura/src/views/SettingsView.tsx` (placeholder)
- Modify: `frontends/sakura/src/App.tsx`

**Step 1: Create `src/components/TabBar.tsx`**

Bottom navigation bar with 5 tabs, Lucide icons, keyboard shortcuts (Ctrl+1..5):

```tsx
import { useEffect } from 'react';
import { MessageCircle, Search, Sparkles, Brain, Settings } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'create', label: 'Create', icon: Sparkles },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'settings', label: 'Settings', icon: Settings }
] as const;

export function TabBar() {
  const { activeTab, setActiveTab, inChatThread } = useAppStore();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        setActiveTab(TABS[parseInt(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setActiveTab]);

  if (inChatThread) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-12 flex items-center justify-around"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        zIndex: 50
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex flex-col items-center gap-0.5 px-4 py-1 transition-colors duration-150"
            style={{
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)'
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

**Step 2: Create placeholder views**

Each view is a minimal placeholder that will be filled in later tasks:

`src/views/ChatsView.tsx`:
```tsx
export function ChatsView() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Chats</h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>Your characters will appear here.</p>
    </div>
  );
}
```

`src/views/DiscoverView.tsx`:
```tsx
export function DiscoverView() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
      <p className="text-lg font-medium" style={{ color: 'var(--color-text-secondary)' }}>Coming soon</p>
      <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>Browse and import community characters</p>
    </div>
  );
}
```

`src/views/CreateView.tsx`:
```tsx
export function CreateView() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Create</h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>Character creation wizard coming soon.</p>
    </div>
  );
}
```

`src/views/SettingsView.tsx`:
```tsx
export function SettingsView() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Settings</h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>Settings panel coming soon.</p>
    </div>
  );
}
```

**Step 3: Update `src/App.tsx`**

Wire up the tab bar shell with view switching:

```tsx
import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { ChatsView } from './views/ChatsView';
import { DiscoverView } from './views/DiscoverView';
import { CreateView } from './views/CreateView';
import { SettingsView } from './views/SettingsView';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';

function ViewRouter() {
  const { activeTab } = useAppStore();
  switch (activeTab) {
    case 'chats': return <ChatsView />;
    case 'discover': return <DiscoverView />;
    case 'create': return <CreateView />;
    case 'memory': return <div className="p-6"><h2 className="text-xl font-semibold">Memory</h2></div>;
    case 'settings': return <SettingsView />;
    default: return <ChatsView />;
  }
}

export function App() {
  const { loadCharacters, loadConfig } = useAppStore();
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: 'var(--color-background)' }}>
      <ViewRouter />
      <TabBar />
    </div>
  );
}
```

**Step 4: Verify**

```bash
cd frontends/sakura && npm run dev
# Open http://localhost:5175 — should see tab bar, click between tabs
```

**Step 5: Commit**

```bash
git commit -m "feat(sakura): add app shell with bottom tab bar and view routing"
```

---

## Task 6: Chats View (Character List)

**Files:**
- Create: `frontends/sakura/src/components/CharacterCard.tsx`
- Modify: `frontends/sakura/src/views/ChatsView.tsx`

**Step 1: Create `src/components/CharacterCard.tsx`**

List item card showing avatar, name, last message preview, timestamp:

```tsx
import type { Character } from '../lib/types';

interface CharacterCardProps {
  character: Character;
  onClick: () => void;
  lastMessage?: string;
  timestamp?: string;
}

export function CharacterCard({ character, onClick, lastMessage, timestamp }: CharacterCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 transition-colors duration-150 text-left"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)'
      }}
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-full bg-cover bg-center flex-shrink-0"
        style={{
          backgroundImage: character.avatar_url ? `url(${character.avatar_url})` : undefined,
          backgroundColor: character.avatar_url ? undefined : 'var(--color-border)'
        }}
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
            {character.name}
          </span>
          {timestamp && (
            <span className="text-xs flex-shrink-0 ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              {timestamp}
            </span>
          )}
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          {lastMessage || character.greeting_message || 'Start a conversation...'}
        </p>
      </div>
    </button>
  );
}
```

**Step 2: Update `src/views/ChatsView.tsx`**

```tsx
import { useAppStore } from '../stores/appStore';
import { CharacterCard } from '../components/CharacterCard';

export function ChatsView() {
  const { characters, openChatThread } = useAppStore();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Chats
      </h2>
      <div className="flex flex-col gap-2">
        {characters.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
            No characters yet. Create one in the Create tab.
          </p>
        ) : (
          characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onClick={() => openChatThread(char)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify**

With the backend running at :8080, open Sakura at :5175. The Chats tab should show character cards from the database.

**Step 4: Commit**

```bash
git commit -m "feat(sakura): add ChatsView with character list cards"
```

---

## Task 7: Chat Thread (Visual Novel Dialogue)

This is the core experience — the main chat view with visual novel-style dialogue bubbles.

**Files:**
- Create: `frontends/sakura/src/views/ChatThread.tsx`
- Create: `frontends/sakura/src/components/DialogueBubble.tsx`
- Create: `frontends/sakura/src/components/MessageMeta.tsx`
- Create: `frontends/sakura/src/components/StatusBar.tsx`
- Create: `frontends/sakura/src/styles/dialogue.css`
- Modify: `frontends/sakura/src/App.tsx` — add ChatThread route

**Step 1: Create `src/styles/dialogue.css`**

```css
.dialogue-her {
  border-left: 3px solid var(--color-accent);
}

.dialogue-you {
  background-color: var(--color-accent);
  color: var(--color-accent-text);
}

.dialogue-meta {
  opacity: 0;
  transition: opacity 150ms ease;
}

.dialogue-bubble:hover .dialogue-meta {
  opacity: 1;
}
```

Import in `index.css`: `@import "./styles/dialogue.css";`

**Step 2: Create `src/components/MessageMeta.tsx`**

Hover-to-reveal token count, tok/s, latency, model info:

```tsx
import type { ChatMessage } from '../lib/types';

export function MessageMeta({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.tokens) return null;

  return (
    <div className="dialogue-meta flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
      {message.tokens && <span>{message.tokens} tok</span>}
      {message.tokensPerSecond && <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>}
      {message.latencyMs && <span>{message.latencyMs}ms TTFT</span>}
      {message.model && <span>{message.model}</span>}
    </div>
  );
}
```

**Step 3: Create `src/components/DialogueBubble.tsx`**

Visual novel style message — her messages are full-width cards with portrait, user messages are right-aligned accent bubbles:

```tsx
import { Volume2 } from 'lucide-react';
import type { ChatMessage, Character } from '../lib/types';
import { MessageMeta } from './MessageMeta';

interface DialogueBubbleProps {
  message: ChatMessage;
  character?: Character;
  onPlayAudio?: () => void;
  isPlaying?: boolean;
}

export function DialogueBubble({ message, character, onPlayAudio, isPlaying }: DialogueBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="dialogue-you px-4 py-2.5 max-w-[75%] text-sm"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          {message.text}
        </div>
      </div>
    );
  }

  // Assistant (her) message — visual novel card
  return (
    <div className="dialogue-bubble mb-3">
      <div
        className="dialogue-her p-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        {/* Header: name + audio button */}
        <div className="flex items-center gap-2 mb-2">
          {character?.avatar_url && (
            <img
              src={character.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          )}
          <span className="font-semibold text-sm" style={{ color: 'var(--color-accent)' }}>
            {character?.name || 'Assistant'}
          </span>
          {message.audioUrl && onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="ml-auto p-1 transition-opacity"
              style={{ color: 'var(--color-accent)' }}
            >
              <Volume2 size={14} className={isPlaying ? 'animate-pulse' : ''} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {message.status === 'pending' ? (
            <span className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>thinking...</span>
          ) : (
            message.text
          )}
        </div>

        {/* Hover meta */}
        <MessageMeta message={message} />
      </div>
    </div>
  );
}
```

**Step 4: Create `src/components/StatusBar.tsx`**

Chat header with character name, online status, ambient idle text, model panel toggle:

```tsx
import { ArrowLeft, Eye } from 'lucide-react';
import type { Character } from '../lib/types';
import { useAppStore } from '../stores/appStore';

const IDLE_PHRASES = ['daydreaming...', 'humming a song~', 'reading something...', 'thinking about you...'];

export function StatusBar({ character }: { character: Character }) {
  const { closeChatThread, toggleModelPanel, modelPanelOpen } = useAppStore();

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-4 h-12"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)'
      }}
    >
      <button onClick={closeChatThread} className="p-1" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={20} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{character.name}</span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
        </div>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {IDLE_PHRASES[Math.floor(Date.now() / 10000) % IDLE_PHRASES.length]}
        </p>
      </div>

      <button
        onClick={toggleModelPanel}
        className="p-1.5 rounded-lg transition-colors"
        style={{
          color: modelPanelOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          backgroundColor: modelPanelOpen ? 'var(--color-accent)' + '15' : 'transparent'
        }}
      >
        <Eye size={18} />
      </button>
    </header>
  );
}
```

**Step 5: Create `src/views/ChatThread.tsx`**

Full chat thread view with message list, input, and model panel slot:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { DialogueBubble } from '../components/DialogueBubble';
import { StatusBar } from '../components/StatusBar';

export function ChatThread() {
  const { activeCharacter } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, setContext, loadHistory, sessionId } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Set chat context when character changes
  useEffect(() => {
    if (!activeCharacter) return;
    // Use session_id 0 to auto-create/resume (backend handles this)
    setContext(0, activeCharacter.id);
  }, [activeCharacter, setContext]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!draft.trim() || loading) return;
    sendMessage(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const playAudio = (msg: { id: string; audioUrl?: string }) => {
    if (!msg.audioUrl) return;
    const audio = new Audio(msg.audioUrl);
    setPlayingAudioId(msg.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  };

  if (!activeCharacter) return null;

  return (
    <div className="flex flex-col h-screen">
      <StatusBar character={activeCharacter} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
        {messages.map((msg) => (
          <DialogueBubble
            key={msg.id}
            message={msg}
            character={activeCharacter}
            onPlayAudio={() => playAudio(msg)}
            isPlaying={playingAudioId === msg.id}
          />
        ))}
      </div>

      {/* Input */}
      <div
        className="sticky bottom-0 p-3"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)'
        }}
      >
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Say something..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || loading}
            className="p-2.5 transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              borderRadius: 'var(--radius-button)'
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 6: Update `src/App.tsx`**

Add ChatThread when `inChatThread` is true:

```tsx
// Add import:
import { ChatThread } from './views/ChatThread';

// In App component, wrap ViewRouter:
export function App() {
  const { loadCharacters, loadConfig, inChatThread } = useAppStore();
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {inChatThread ? <ChatThread /> : (
        <div className="pb-12">
          <ViewRouter />
          <TabBar />
        </div>
      )}
    </div>
  );
}
```

**Step 7: Verify**

Open Sakura, click a character in Chats → chat thread opens with visual novel bubbles. Send a message, get a reply. Click back arrow → returns to chat list.

**Step 8: Commit**

```bash
git commit -m "feat(sakura): add ChatThread with visual novel dialogue bubbles"
```

---

## Task 8: 3D Model Panel (Viewer iframe)

**Files:**
- Create: `frontends/sakura/src/components/ModelPanel.tsx`
- Create: `frontends/sakura/src/hooks/useViewer.ts`
- Modify: `frontends/sakura/src/views/ChatThread.tsx` — integrate panel

**Step 1: Create `src/hooks/useViewer.ts`**

postMessage bridge to the 3D viewer iframe:

```typescript
import { useCallback, useRef, useEffect } from 'react';

export function useViewer() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const loadCharacter = useCallback((modelUrl: string) => {
    post({ type: 'loadCharacter', payload: { modelUrl } });
  }, [post]);

  const setEmotion = useCallback((emotion: string, intensity = 0.8, duration = 3000) => {
    post({ type: 'setEmotion', emotion, intensity, duration });
  }, [post]);

  const playGesture = useCallback((gesture: string) => {
    post({ type: 'playGesture', payload: { gesture } });
  }, [post]);

  const setCameraPreset = useCallback((preset: 'fullbody' | 'bust' | 'face') => {
    post({ type: 'setCameraPreset', payload: { preset } });
  }, [post]);

  const playAudio = useCallback((audioUrl: string) => {
    post({ type: 'playAudio', audioUrl });
  }, [post]);

  return {
    iframeRef,
    loadCharacter,
    setEmotion,
    playGesture,
    setCameraPreset,
    playAudio
  };
}
```

**Step 2: Create `src/components/ModelPanel.tsx`**

Slide-out right panel with viewer iframe:

```tsx
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useViewer } from '../hooks/useViewer';
import type { Character } from '../lib/types';

interface ModelPanelProps {
  character: Character;
}

export function ModelPanel({ character }: ModelPanelProps) {
  const { modelPanelOpen, toggleModelPanel } = useAppStore();
  const { iframeRef, loadCharacter, setCameraPreset } = useViewer();

  useEffect(() => {
    if (modelPanelOpen && character.model_vrm) {
      // Small delay to let iframe load
      const timer = setTimeout(() => {
        loadCharacter(character.model_vrm!);
        setCameraPreset('bust');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modelPanelOpen, character.model_vrm, loadCharacter, setCameraPreset]);

  return (
    <AnimatePresence>
      {modelPanelOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '40%', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex-shrink-0 h-full overflow-hidden"
          style={{
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)'
          }}
        >
          <iframe
            ref={iframeRef}
            src="/shared/viewer/viewer.html"
            className="w-full h-full border-0"
            title="3D Viewer"
          />
          <button
            onClick={toggleModelPanel}
            className="absolute bottom-4 left-4 flex items-center gap-1 px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-button)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <ChevronLeft size={14} /> Hide
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 3: Update `src/views/ChatThread.tsx`**

Wrap in a flex row layout — chat on left (flex-1), model panel on right:

Add to the ChatThread component return:
```tsx
return (
  <div className="flex h-screen">
    {/* Chat column */}
    <div className="flex flex-col flex-1 min-w-0">
      <StatusBar character={activeCharacter} />
      {/* ... existing messages + input ... */}
    </div>

    {/* Model panel */}
    <ModelPanel character={activeCharacter} />
  </div>
);
```

**Step 4: Verify**

Open a chat thread, click the eye icon → 3D model panel slides in from right at 40% width. Click "Hide" → panel slides out.

**Step 5: Commit**

```bash
git commit -m "feat(sakura): add 3D model panel with viewer iframe bridge"
```

---

## Task 9: Settings View (Progressive Disclosure)

**Files:**
- Create: `frontends/sakura/src/views/SettingsView.tsx` (replace placeholder)
- Create: `frontends/sakura/src/components/SettingField.tsx`

**Step 1: Create `src/components/SettingField.tsx`**

Reusable setting row with label, description (hideable in compact mode), tooltip, and control:

```tsx
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SettingFieldProps {
  label: string;
  description?: string;
  tooltip?: string;
  advanced?: boolean;
  children: React.ReactNode;
}

export function SettingField({ label, description, tooltip, advanced, children }: SettingFieldProps) {
  const { advancedMode, compactMode } = useAppStore();
  const [showTooltip, setShowTooltip] = useState(false);

  if (advanced && !advancedMode) return null;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {label}
          </span>
          {tooltip && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="p-0.5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <HelpCircle size={13} />
              </button>
              {showTooltip && (
                <div
                  className="absolute left-6 top-0 z-50 w-56 p-2 text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-elevated)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
      {description && !compactMode && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Implement `src/views/SettingsView.tsx`**

Progressive disclosure settings with Standard/Advanced toggle and Compact Mode:

```tsx
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../hooks/useTheme';
import { SettingField } from '../components/SettingField';

export function SettingsView() {
  const { advancedMode, toggleAdvancedMode, compactMode, toggleCompactMode, config, saveConfig } = useAppStore();
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Settings</h2>

      {/* Master toggles */}
      <div className="flex items-center gap-4 mb-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={advancedMode} onChange={toggleAdvancedMode} className="accent-[var(--color-accent)]" />
          <span style={{ color: 'var(--color-text-primary)' }}>Advanced Mode</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={compactMode} onChange={toggleCompactMode} className="accent-[var(--color-accent)]" />
          <span style={{ color: 'var(--color-text-primary)' }}>Compact</span>
        </label>
      </div>

      {/* Appearance */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Appearance
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4 divide-y" >

          <SettingField label="Theme" description="Choose between warm sakura pink or cool crystal blue.">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'sakura' | 'crystal')}
              className="text-sm px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value="sakura">Sakura</option>
              <option value="crystal">Crystal</option>
            </select>
          </SettingField>

          <SettingField
            label="Chat Layout"
            description="How the chat and 3D model are arranged."
            tooltip="Chat-first shows the conversation full width. Model-first gives the 3D model most of the screen. Split shows both side-by-side."
          >
            <select
              value={String(config.chat_layout || 'chat-first')}
              onChange={(e) => saveConfig({ chat_layout: e.target.value })}
              className="text-sm px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value="chat-first">Chat First</option>
              <option value="model-first">Model First</option>
              <option value="split">Split</option>
            </select>
          </SettingField>
        </div>
      </section>

      {/* Voice */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Voice
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4 divide-y">

          <SettingField label="Auto-speak" description="Automatically play TTS audio for new messages.">
            <input
              type="checkbox"
              checked={Boolean((config.tts as Record<string, unknown>)?.auto_speak)}
              onChange={(e) => saveConfig({ tts: { ...(config.tts as Record<string, unknown>), auto_speak: e.target.checked } })}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
        </div>
      </section>

      {/* AI (Advanced) */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          AI Model
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4 divide-y">

          <SettingField label="AI Model" description="Which language model to use for chat.">
            <input
              type="text"
              value={String((config.llm as Record<string, unknown>)?.model || '')}
              onChange={(e) => saveConfig({ llm: { ...(config.llm as Record<string, unknown>), model: e.target.value } })}
              className="text-sm px-2 py-1 w-48 rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </SettingField>

          <SettingField label="Temperature" description="Higher = more creative, lower = more focused." advanced tooltip="Controls randomness in AI responses. 0.0 is deterministic, 1.0+ is very creative. Default: 0.7">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={Number(config.temperature || 0.7)}
              onChange={(e) => saveConfig({ temperature: parseFloat(e.target.value) })}
              className="w-32"
            />
            <span className="text-xs ml-2 w-8 inline-block" style={{ color: 'var(--color-text-secondary)' }}>
              {Number(config.temperature || 0.7).toFixed(1)}
            </span>
          </SettingField>

          <SettingField label="History Limit" description="Max messages sent to the AI per request." advanced tooltip="Set to 0 for unlimited. Higher values use more tokens but give the AI more context. Default: 30">
            <input
              type="number"
              min="0"
              max="200"
              value={Number((config.llm as Record<string, unknown>)?.history_limit || 30)}
              onChange={(e) => saveConfig({ llm: { ...(config.llm as Record<string, unknown>), history_limit: parseInt(e.target.value) } })}
              className="text-sm px-2 py-1 w-20 rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </SettingField>
        </div>
      </section>
    </div>
  );
}
```

**Step 3: Verify**

Open Settings tab. See Standard settings. Toggle "Advanced Mode" → temperature and history limit appear. Toggle "Compact" → descriptions hide, tooltips remain on hover.

**Step 4: Commit**

```bash
git commit -m "feat(sakura): add Settings view with progressive disclosure and compact mode"
```

---

## Task 10: Character Creation Wizard

**Files:**
- Create: `frontends/sakura/src/views/CreateView.tsx` (replace placeholder)
- Create: `frontends/sakura/src/components/WizardStep.tsx`
- Create: `frontends/sakura/src/components/VoicePicker.tsx`

**Step 1: Create `src/components/WizardStep.tsx`**

Animated step container with Framer Motion slide transitions:

```tsx
import { motion } from 'framer-motion';

interface WizardStepProps {
  children: React.ReactNode;
  direction?: 'left' | 'right';
}

export function WizardStep({ children, direction = 'left' }: WizardStepProps) {
  const x = direction === 'left' ? 100 : -100;
  return (
    <motion.div
      initial={{ x, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -x, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
```

**Step 2: Create `src/components/VoicePicker.tsx`**

Voice selection dropdown that fetches from `/api/tts/voices`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { VoiceEntry } from '../lib/types';

interface VoicePickerProps {
  value: string;
  provider?: string;
  onChange: (voiceId: string, provider: string) => void;
}

export function VoicePicker({ value, provider, onChange }: VoicePickerProps) {
  const [voices, setVoices] = useState<VoiceEntry[]>([]);

  useEffect(() => {
    api.getVoices(provider).then(setVoices).catch(console.error);
  }, [provider]);

  const grouped = voices.reduce<Record<string, VoiceEntry[]>>((acc, v) => {
    const key = v.engine.charAt(0).toUpperCase() + v.engine.slice(1);
    (acc[key] ??= []).push(v);
    return acc;
  }, {});

  return (
    <select
      value={value}
      onChange={(e) => {
        const voice = voices.find(v => v.id === e.target.value);
        if (voice) onChange(voice.id, voice.engine);
      }}
      className="text-sm px-2 py-1.5 w-full rounded"
      style={{
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)'
      }}
    >
      <option value="">Select a voice...</option>
      {Object.entries(grouped).map(([engine, voiceList]) => (
        <optgroup key={engine} label={engine}>
          {voiceList.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.description}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

**Step 3: Implement `src/views/CreateView.tsx`**

5-step wizard (Identity → Appearance → Voice → Personality → Review):

This is a large component. Implement the wizard state machine and the Identity step (step 1) for MVP. The other steps can be filled in iteratively:

```tsx
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { WizardStep } from '../components/WizardStep';
import { VoicePicker } from '../components/VoicePicker';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

const STEPS = ['Identity', 'Appearance', 'Voice', 'Personality', 'Review'];

export function CreateView() {
  const { loadCharacters, setActiveTab } = useAppStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [data, setData] = useState<Partial<Character>>({
    name: '',
    system_prompt: '',
    greeting_message: '',
    voice_id: '',
    tts_provider: 'edge-tts'
  });
  const [creating, setCreating] = useState(false);

  const patch = (updates: Partial<Character>) => setData(prev => ({ ...prev, ...updates }));

  const next = () => { setDirection('left'); setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const prev = () => { setDirection('right'); setStep(s => Math.max(s - 1, 0)); };

  const create = async () => {
    setCreating(true);
    try {
      await api.createCharacter(data);
      await loadCharacters();
      setActiveTab('chats');
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">Create Character</h2>

      {/* Progress bar */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full" style={{
            backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-border)'
          }} />
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Step {step + 1}: {STEPS[step]}
      </p>

      {/* Steps */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <WizardStep key="identity" direction={direction}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input type="text" value={data.name || ''} onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Sakura" className="w-full text-sm px-3 py-2 rounded"
                  style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role / Persona</label>
                <textarea value={data.system_prompt || ''} onChange={e => patch({ system_prompt: e.target.value })}
                  placeholder="Describe who this character is..." rows={4} className="w-full text-sm px-3 py-2 rounded resize-none"
                  style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Greeting Message</label>
                <input type="text" value={data.greeting_message || ''} onChange={e => patch({ greeting_message: e.target.value })}
                  placeholder="What does she say when you open the chat?" className="w-full text-sm px-3 py-2 rounded"
                  style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
              </div>
            </div>
          </WizardStep>
        )}

        {step === 1 && (
          <WizardStep key="appearance" direction={direction}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              VRM model picker and background image will be added here. For now, characters use the default model.
            </p>
          </WizardStep>
        )}

        {step === 2 && (
          <WizardStep key="voice" direction={direction}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Voice</label>
                <VoicePicker
                  value={data.voice_id || ''}
                  onChange={(voiceId, provider) => patch({ voice_id: voiceId, tts_provider: provider })}
                />
              </div>
            </div>
          </WizardStep>
        )}

        {step === 3 && (
          <WizardStep key="personality" direction={direction}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Personality sliders (energy, confidence, etc.) will be added here.
            </p>
          </WizardStep>
        )}

        {step === 4 && (
          <WizardStep key="review" direction={direction}>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold text-sm mb-2">{data.name || 'Unnamed'}</h3>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                {data.system_prompt?.slice(0, 120) || 'No persona set'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Voice: {data.voice_id || 'Default'} ({data.tts_provider})
              </p>
            </div>
          </WizardStep>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={prev} disabled={step === 0}
          className="px-4 py-2 text-sm rounded-lg disabled:opacity-30"
          style={{ color: 'var(--color-text-secondary)' }}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={next}
            className="px-4 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            Next
          </button>
        ) : (
          <button onClick={create} disabled={creating || !data.name}
            className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Verify**

Open Create tab. Step through the 5 wizard steps. Fill in name and persona. Select a voice. Click Create → character appears in Chats tab.

**Step 5: Commit**

```bash
git commit -m "feat(sakura): add 5-step character creation wizard with voice picker"
```

---

## Task 11: Memory Panel (Slide-out Right Panel)

**Files:**
- Create: `frontends/sakura/src/components/MemoryPanel.tsx`
- Modify: `frontends/sakura/src/App.tsx` — integrate memory panel trigger

**Step 1: Create `src/components/MemoryPanel.tsx`**

Right slide-out panel showing active context, relationship score, and token budget info:

```tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface ContextBudget {
  total_tokens?: number;
  used_tokens?: number;
  system_tokens?: number;
  history_tokens?: number;
  memory_tokens?: number;
}

export function MemoryPanel() {
  const { memoryPanelOpen, toggleMemoryPanel, activeCharacter } = useAppStore();
  const [budget, setBudget] = useState<ContextBudget | null>(null);

  useEffect(() => {
    if (!memoryPanelOpen) return;
    // Fetch context budget for current session if available
    fetch('/api/context-budget/0')
      .then(r => r.ok ? r.json() : null)
      .then(setBudget)
      .catch(() => setBudget(null));
  }, [memoryPanelOpen]);

  return (
    <AnimatePresence>
      {memoryPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={toggleMemoryPanel}
            className="fixed inset-0 bg-black z-40"
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 w-80 z-50 overflow-y-auto p-4"
            style={{ backgroundColor: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Memory Bank</h3>
              <button onClick={toggleMemoryPanel} style={{ color: 'var(--color-text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            {activeCharacter ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Active Character</p>
                  <p className="text-sm font-semibold">{activeCharacter.name}</p>
                </div>

                {budget && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Token Budget</p>
                    <div className="space-y-1 text-xs">
                      {budget.total_tokens && <div className="flex justify-between"><span>Total</span><span>{budget.total_tokens}</span></div>}
                      {budget.used_tokens && <div className="flex justify-between"><span>Used</span><span>{budget.used_tokens}</span></div>}
                      {budget.system_tokens && <div className="flex justify-between"><span>System</span><span>{budget.system_tokens}</span></div>}
                      {budget.history_tokens && <div className="flex justify-between"><span>History</span><span>{budget.history_tokens}</span></div>}
                      {budget.memory_tokens && <div className="flex justify-between"><span>Memory</span><span>{budget.memory_tokens}</span></div>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Open a chat to see memory details.
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Update App.tsx**

Add `<MemoryPanel />` at root level and wire the Memory tab to toggle it:

In `ViewRouter`, change the memory case:
```tsx
case 'memory':
  // Toggle panel instead of showing a view
  useAppStore.getState().toggleMemoryPanel();
  useAppStore.getState().setActiveTab('chats'); // snap back to previous tab
  return <ChatsView />;
```

Add `<MemoryPanel />` to the App return.

**Step 3: Verify**

Click Memory tab → panel slides in from right. Shows active character info and token budget. Click X or backdrop to close.

**Step 4: Commit**

```bash
git commit -m "feat(sakura): add Memory Bank slide-out panel with token budget display"
```

---

## Task 12: Backend Routing (Serve Sakura at `/`)

**Files:**
- Modify: `backend/server.py` — add Sakura static mount + route handlers
- Modify: `backend/config/app.json` — add `default_frontend` config

**Step 1: Add Sakura static mounts in `server.py`**

Find the existing static mount section and add:

```python
# Sakura frontend (built React app)
FRONTEND_SAKURA_DIST = BASE / "frontends" / "sakura" / "dist"
if FRONTEND_SAKURA_DIST.exists():
    app.mount("/sakura/assets", StaticFiles(directory=str(FRONTEND_SAKURA_DIST / "assets")), name="sakura-assets")
```

**Step 2: Add route handler for `/sakura`**

```python
@app.get("/sakura")
@app.get("/sakura/{full_path:path}")
async def sakura_frontend(full_path: str = ""):
    """Serve the Sakura React frontend."""
    index = FRONTEND_SAKURA_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "Sakura frontend not built. Run: cd frontends/sakura && npm run build"}, status_code=404)
```

**Step 3: Add `default_frontend` config option**

In `app.json`, add at the top level:
```json
"default_frontend": "neon"
```

Update the existing `GET /` handler to check this config and redirect:
```python
@app.get("/")
async def root():
    default = cfg.get("default_frontend", "neon")
    if default == "sakura" and FRONTEND_SAKURA_DIST.exists():
        return FileResponse(str(FRONTEND_SAKURA_DIST / "index.html"))
    # Existing neon frontend serving...
```

**Step 4: Update Sakura `vite.config.ts`**

Set `base: '/sakura/'` so built assets use the correct path prefix:
```typescript
export default defineConfig({
  base: '/sakura/',
  // ... rest unchanged
});
```

**Step 5: Build and verify**

```bash
cd frontends/sakura && npm run build
cd ../.. && python backend/server.py
# Open http://localhost:8080/sakura — should load Sakura
# Open http://localhost:8080/ — still loads Neon
```

**Step 6: Commit**

```bash
git commit -m "feat: serve Sakura frontend at /sakura with configurable default"
```

---

## Task 13: Polish & Integration

Final polish pass — animations, ambient behavior, and end-to-end verification.

**Files:**
- Modify: various Sakura components for animation polish
- Create: `frontends/sakura/src/hooks/useProactive.ts` (stub)

**Step 1: Add Framer Motion page transitions**

In `App.tsx`, wrap `ViewRouter` with `AnimatePresence` for smooth tab switches.

**Step 2: Add ambient idle behavior**

In `StatusBar.tsx`, implement a cycling timer that rotates through idle phrases every 10 seconds. Cosmetic only — no LLM calls.

**Step 3: Create proactive message stub**

`src/hooks/useProactive.ts` — create the hook with idle timer logic that fires after configurable minutes. The actual LLM call integration can be wired later.

**Step 4: Add keyboard shortcut hints**

Add Ctrl+1..5 hints to tab bar tooltips.

**Step 5: End-to-end verification checklist**

Run through manually:
1. `npm run dev` → Sakura loads at :5175
2. Chats tab shows characters from backend
3. Click character → chat thread opens, send message, get reply
4. Click eye icon → model panel slides in with 3D viewer
5. Click back → returns to character list
6. Create tab → wizard works, creates character
7. Settings → theme switch works, advanced toggle works, compact mode works
8. Memory tab → panel slides in
9. `npm run build` → production build works
10. Server serves at `/sakura` path

**Step 6: Commit**

```bash
git commit -m "feat(sakura): polish animations, ambient idle behavior, and integration"
```

---

## Files Summary

| File | Action | Task |
|------|--------|------|
| `frontends/shared/viewer/*` | Move from neon | 1 |
| `frontends/shared/lib/*` | Move from neon | 1 |
| `frontends/neon/viewer` | Symlink → shared | 1 |
| `frontends/neon/lib` | Symlink → shared | 1 |
| `frontends/sakura/package.json` | Create | 2 |
| `frontends/sakura/vite.config.ts` | Create | 2 |
| `frontends/sakura/tsconfig*.json` | Create | 2 |
| `frontends/sakura/index.html` | Create | 2 |
| `frontends/sakura/src/main.tsx` | Create | 2 |
| `frontends/sakura/src/App.tsx` | Create | 2, 5, 7, 11 |
| `frontends/sakura/src/index.css` | Create | 2, 3 |
| `frontends/sakura/src/styles/themes.css` | Create | 3 |
| `frontends/sakura/src/styles/base.css` | Create | 3 |
| `frontends/sakura/src/styles/dialogue.css` | Create | 7 |
| `frontends/sakura/src/hooks/useTheme.ts` | Create | 3 |
| `frontends/sakura/src/hooks/useViewer.ts` | Create | 8 |
| `frontends/sakura/src/hooks/useProactive.ts` | Create | 13 |
| `frontends/sakura/src/lib/api.ts` | Create | 4 |
| `frontends/sakura/src/lib/types.ts` | Create | 4 |
| `frontends/sakura/src/lib/events.ts` | Create | 4 |
| `frontends/sakura/src/stores/appStore.ts` | Create | 4 |
| `frontends/sakura/src/stores/chatStore.ts` | Create | 4 |
| `frontends/sakura/src/components/TabBar.tsx` | Create | 5 |
| `frontends/sakura/src/components/CharacterCard.tsx` | Create | 6 |
| `frontends/sakura/src/components/DialogueBubble.tsx` | Create | 7 |
| `frontends/sakura/src/components/MessageMeta.tsx` | Create | 7 |
| `frontends/sakura/src/components/StatusBar.tsx` | Create | 7 |
| `frontends/sakura/src/components/ModelPanel.tsx` | Create | 8 |
| `frontends/sakura/src/components/MemoryPanel.tsx` | Create | 11 |
| `frontends/sakura/src/components/SettingField.tsx` | Create | 9 |
| `frontends/sakura/src/components/WizardStep.tsx` | Create | 10 |
| `frontends/sakura/src/components/VoicePicker.tsx` | Create | 10 |
| `frontends/sakura/src/views/ChatsView.tsx` | Create | 5, 6 |
| `frontends/sakura/src/views/ChatThread.tsx` | Create | 7, 8 |
| `frontends/sakura/src/views/DiscoverView.tsx` | Create | 5 |
| `frontends/sakura/src/views/CreateView.tsx` | Create | 5, 10 |
| `frontends/sakura/src/views/SettingsView.tsx` | Create | 5, 9 |
| `frontends/sakura/src/test/setup.ts` | Create | 2 |
| `backend/server.py` | Modify | 1, 12 |
| `backend/config/app.json` | Modify | 12 |
| `.gitignore` | Modify | 2 |

## Key Reuse Points

- **v2 frontend patterns** — dep versions, api.ts structure, Zustand persist, Vitest setup
- **postMessage protocol** — exact same viewer.html message types
- **Backend API** — all 80 endpoints unchanged, same REST interface
- **Shared viewer** — `frontends/shared/viewer/viewer.html` serves both frontends
- **Voice catalog** — same `/api/tts/voices` endpoint powers VoicePicker
