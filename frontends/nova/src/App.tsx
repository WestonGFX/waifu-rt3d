import { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AmbientLayer } from './components/AmbientLayer';
import { ViewerFrame } from './components/ViewerFrame';
import { CompanionView } from './components/CompanionView';
import { FocusedView } from './components/FocusedView';
import { useNovaStore } from './stores/novaStore';
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
import { useViewerStore } from './stores/viewerStore';

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
  }));

  // ── Mode transition config ──────────────────────────────────────────────
  const modeTransition = {
    type: 'spring' as const,
    stiffness: 150,
    damping: 20,
  };

  return (
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
              onCharacterSwitch={handleCharacterSwitch}
              onCommandPalette={toggleCommandPalette}
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
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
