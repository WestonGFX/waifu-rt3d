import { useEffect, useCallback } from 'react';
import { AmbientLayer } from './components/AmbientLayer';
import { ViewerFrame } from './components/ViewerFrame';
import { CompanionView } from './components/CompanionView';
import { useNovaStore } from './stores/novaStore';
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
import { useViewerStore } from './stores/viewerStore';

/**
 * Nova application shell.
 *
 * Orchestrates the three rendering layers:
 * 1. AmbientLayer — gradient orbs + film grain (z-index 0-2)
 * 2. ViewerFrame — 3D character iframe (z-index 3)
 * 3. CompanionView / FocusedView — glass UI panels (z-index 10+)
 *
 * Manages initialization: loads characters and config on mount,
 * auto-selects the first character, creates a chat session.
 *
 * Phase 2 implements Companion mode only. Focused mode is Phase 3.
 */
export function App() {
  // Stores
  const mode = useNovaStore((s) => s.mode);
  const toggleMode = useNovaStore((s) => s.toggleMode);
  const toggleCommandPalette = useNovaStore((s) => s.toggleCommandPalette);

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

  // Initialize on mount
  useEffect(() => {
    fetchCharacters();
    fetchConfig();
  }, [fetchCharacters, fetchConfig]);

  // Auto-select first character when list loads
  useEffect(() => {
    if (characters.length > 0 && !activeCharacter) {
      const first = characters[0];
      setActiveCharacter(first);
      setActiveCharId(first.id);
      createSession(first.id);

      // Load character's 3D model if available
      if (first.model_vrm) {
        dispatchLoadModel(first.model_vrm);
      }
    }
  }, [characters, activeCharacter, setActiveCharacter, setActiveCharId, createSession, dispatchLoadModel]);

  // Sync emotion from chat to 3D viewer
  useEffect(() => {
    if (currentEmotion) {
      dispatchExpression(currentEmotion.emotion, currentEmotion.intensity);
    }
  }, [currentEmotion, dispatchExpression]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      // ⌘\ or Ctrl+\ → toggle mode
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, toggleMode]);

  // Handle character switching
  const handleCharacterSwitch = useCallback(() => {
    // Cycle to next character for now (full switcher UI in Phase 3)
    if (characters.length < 2 || !activeCharacter) return;
    const currentIndex = characters.findIndex((c) => c.id === activeCharacter.id);
    const next = characters[(currentIndex + 1) % characters.length];
    setActiveCharacter(next);
    setActiveCharId(next.id);
    createSession(next.id);
    if (next.model_vrm) {
      dispatchLoadModel(next.model_vrm);
    }
  }, [characters, activeCharacter, setActiveCharacter, setActiveCharId, createSession, dispatchLoadModel]);

  // Map chat messages to CompanionView format
  const chatMessages = messages.map((m) => ({
    id: typeof m.id === 'string' ? parseInt(m.id, 10) || Math.random() : m.id as number,
    role: m.role as 'user' | 'assistant',
    text: m.text || '',
  }));

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Layer 0-2: Background atmosphere */}
      <AmbientLayer />

      {/* Layer 3: 3D character viewer */}
      <ViewerFrame />

      {/* Layer 10+: Glass UI */}
      {mode === 'companion' && (
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
      )}

      {mode === 'focused' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--nova-text-secondary)',
          fontSize: 14,
        }}>
          Focused mode — Phase 3
        </div>
      )}
    </div>
  );
}
