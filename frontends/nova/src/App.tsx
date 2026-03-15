import { useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AmbientLayer } from './components/AmbientLayer';
import { ViewerFrame } from './components/ViewerFrame';
import { CompanionView } from './components/CompanionView';
import { FocusedView } from './components/FocusedView';
import { CommandPalette } from './components/CommandPalette';
import type { CommandAction } from './components/CommandPalette';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useNovaStore } from './stores/novaStore';
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
import { useViewerStore } from './stores/viewerStore';
import { applyCharacterTint } from './lib/characterTints';
import { api } from './lib/api';

/**
 * Nova application shell.
 *
 * Orchestrates the dual-mode experience:
 * - Companion mode: immersive glass-over-3D with floating panels
 * - Focused mode: chat-centric layout with icon rail + data panels
 *
 * The mode transition uses Framer Motion's AnimatePresence for
 * cross-fade between views. The 3D viewer stays mounted in both
 * modes — in Companion it fills the viewport, in Focused it's
 * a side panel (handled by FocusedView's own iframe).
 *
 * Initialization flow:
 * 1. Fetch characters + config on mount
 * 2. Auto-select first character
 * 3. Create chat session
 * 4. Load character's VRM model into viewer
 */
export function App() {
  // ── Stores ──────────────────────────────────────────────────────────────
  const mode = useNovaStore((s) => s.mode);
  const toggleMode = useNovaStore((s) => s.toggleMode);
  const toggleCommandPalette = useNovaStore((s) => s.toggleCommandPalette);
  const activePanel = useNovaStore((s) => s.activePanel);
  const setActivePanel = useNovaStore((s) => s.setActivePanel);

  const characters = useAppStore((s) => s.characters);
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const fetchCharacters = useAppStore((s) => s.fetchCharacters);
  const setActiveCharacter = useAppStore((s) => s.setActiveCharacter);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const configLoaded = useAppStore((s) => s.configLoaded);
  const charactersLoaded = useAppStore((s) => s.charactersLoaded);

  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const createSession = useChatStore((s) => s.createSession);
  const setActiveCharId = useChatStore((s) => s.setActiveCharId);
  const currentEmotion = useChatStore((s) => s.currentEmotion);

  const dispatchExpression = useViewerStore((s) => s.dispatchExpression);
  const dispatchLoadModel = useViewerStore((s) => s.dispatchLoadModel);

  // ── Initialization ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchCharacters();
    fetchConfig();
  }, [fetchCharacters, fetchConfig]);

  // Auto-select first character
  useEffect(() => {
    if (characters.length > 0 && !activeCharacter) {
      const first = characters[0];
      setActiveCharacter(first);
      setActiveCharId(first.id);
      createSession(first.id);
      if (first.model_vrm) {
        dispatchLoadModel(first.model_vrm);
      }
    }
  }, [characters, activeCharacter, setActiveCharacter, setActiveCharId, createSession, dispatchLoadModel]);

  // Sync emotion → 3D viewer
  useEffect(() => {
    if (currentEmotion) {
      dispatchExpression(currentEmotion.emotion, currentEmotion.intensity);
    }
  }, [currentEmotion, dispatchExpression]);

  // Apply character tint when active character changes
  useEffect(() => {
    applyCharacterTint(activeCharacter?.name ?? null);
  }, [activeCharacter]);

  // Fetch contextual greeting on character load
  const greetingFetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!activeCharacter || !activeCharacter.greeting_enabled) return;
    if (greetingFetchedFor.current === activeCharacter.id) return;
    greetingFetchedFor.current = activeCharacter.id;

    api.getGreeting(activeCharacter.id)
      .then((res) => {
        if (res.ok && res.greeting) {
          const greetingMsg = {
            id: `greeting-${activeCharacter.id}`,
            role: 'assistant' as const,
            text: res.greeting,
            createdAt: Date.now(),
            status: 'sent' as const,
            emotion: res.emotion ?? undefined,
          };
          // Prepend greeting as the first message if chat is empty
          const current = useChatStore.getState().messages;
          if (current.length === 0) {
            useChatStore.setState({ messages: [greetingMsg] });
            if (res.emotion) {
              useChatStore.getState().setCurrentEmotion(res.emotion, 1.0);
            }
          }
        }
      })
      .catch(() => {}); // Greeting is non-critical
  }, [activeCharacter]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, toggleMode]);

  // ── Conversation forking ────────────────────────────────────────────────
  const sessionId = useChatStore((s) => s.sessionId);
  const loadSession = useChatStore((s) => s.loadSession);
  const addToast = useNovaStore((s) => s.addToast);

  /**
   * Fork the current conversation at the given message.
   * Creates a new session with messages up to messageId, then loads it.
   */
  const handleFork = useCallback(async (messageId: number) => {
    if (sessionId == null) return;
    try {
      const result = await api.forkSession(sessionId, messageId);
      addToast(`Conversation forked (${result.session.message_count} messages)`, 'success');
      await loadSession(result.session.id);
    } catch {
      addToast('Failed to fork conversation', 'error');
    }
  }, [sessionId, addToast, loadSession]);

  // ── Command palette state + actions ─────────────────────────────────────
  const commandPaletteOpen = useNovaStore((s) => s.commandPaletteOpen);

  /** Command palette actions available to the user. */
  const paletteActions: CommandAction[] = useMemo(() => [
    {
      id: 'new-chat',
      label: 'New Chat',
      description: 'Start a new conversation with the current character',
      shortcut: '\u2318N',
      onExecute: () => {
        const char = useAppStore.getState().activeCharacter;
        if (char) createSession(char.id);
      },
    },
    {
      id: 'switch-mode',
      label: mode === 'companion' ? 'Switch to Focused Mode' : 'Switch to Companion Mode',
      description: 'Toggle between immersive and productivity layouts',
      shortcut: '\u2318\\',
      onExecute: toggleMode,
    },
    {
      id: 'switch-character',
      label: 'Next Character',
      description: 'Cycle to the next character in the roster',
      onExecute: () => handleCharacterSwitch(),
    },
    {
      id: 'open-settings',
      label: 'Settings',
      description: 'Open the settings panel',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('settings');
        if (mode === 'companion') toggleMode();
      },
    },
    {
      id: 'open-memory',
      label: 'Memory Manager',
      description: 'View and manage conversation memories',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('memory');
        if (mode === 'companion') toggleMode();
      },
    },
    {
      id: 'open-history',
      label: 'Chat History',
      description: 'Browse past conversation sessions',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('history');
        if (mode === 'companion') toggleMode();
      },
    },
    {
      id: 'open-characters',
      label: 'Characters',
      description: 'View and switch between characters',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('characters');
        if (mode === 'companion') toggleMode();
      },
    },
    {
      id: 'open-games',
      label: 'Games',
      description: 'Play mini-games with your character',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('games');
        if (mode === 'companion') toggleMode();
      },
    },
    {
      id: 'open-lorebook',
      label: 'Lorebook',
      description: 'Manage world info and lore entries',
      onExecute: () => {
        useNovaStore.getState().setActivePanel('lorebook');
        if (mode === 'companion') toggleMode();
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [mode, toggleMode, createSession]);

  // ── Character switching ─────────────────────────────────────────────────
  const handleCharacterSwitch = useCallback(() => {
    if (characters.length < 2 || !activeCharacter) return;
    const idx = characters.findIndex((c) => c.id === activeCharacter.id);
    const next = characters[(idx + 1) % characters.length];
    setActiveCharacter(next);
    setActiveCharId(next.id);
    createSession(next.id);
    if (next.model_vrm) dispatchLoadModel(next.model_vrm);
  }, [characters, activeCharacter, setActiveCharacter, setActiveCharId, createSession, dispatchLoadModel]);

  // ── Message format adapter ──────────────────────────────────────────────
  const chatMessages = messages.map((m) => ({
    id: typeof m.id === 'string' ? parseInt(m.id, 10) || Math.random() : m.id as number,
    role: m.role as 'user' | 'assistant',
    text: m.text || '',
    serverMessageId: m.serverMessageId,
  }));

  // ── Loading gate ──────────────────────────────────────────────────────
  if (!configLoaded || !charactersLoaded) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--nova-bg-deep)',
        }}
      >
        <div
          style={{
            color: 'var(--nova-text-secondary)',
            fontSize: 14,
            letterSpacing: '0.05em',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          Loading...
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
      </div>
    );
  }

  // ── Mode transition config ──────────────────────────────────────────────
  const modeTransition = {
    type: 'spring' as const,
    stiffness: 150,
    damping: 20,
  };

  return (
    <ErrorBoundary>
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Layer 0-2: Background atmosphere (always visible) */}
      <AmbientLayer />

      {/* Layer 3: Full-viewport 3D viewer (Companion mode only) */}
      {mode === 'companion' && <ViewerFrame />}

      {/* Layer 10+: Glass UI — animated mode switch */}
      <AnimatePresence mode="wait">
        {mode === 'companion' ? (
          <motion.div
            key="companion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={modeTransition}
            style={{ position: 'fixed', inset: 0 }}
          >
            <CompanionView
              mode={mode}
              onToggleMode={toggleMode}
              character={activeCharacter}
              messages={chatMessages}
              isStreaming={loading}
              onSend={sendMessage}
              currentEmotion={currentEmotion}
              onCharacterSwitch={handleCharacterSwitch}
              onCommandPalette={toggleCommandPalette}
              onForkMessage={handleFork}
              sessionId={sessionId}
            />
          </motion.div>
        ) : (
          <motion.div
            key="focused"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={modeTransition}
            style={{ position: 'fixed', inset: 0 }}
          >
            <FocusedView
              mode={mode}
              onToggleMode={toggleMode}
              character={activeCharacter}
              messages={chatMessages}
              isStreaming={loading}
              onSend={sendMessage}
              activePanel={activePanel}
              onPanelChange={setActivePanel}
              currentEmotion={currentEmotion}
              onForkMessage={handleFork}
              sessionId={sessionId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command palette + message search — Cmd+K */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={toggleCommandPalette}
        actions={paletteActions}
      />

      {/* Toast notifications — always on top */}
      <ToastContainer />
    </div>
    </ErrorBoundary>
  );
}
