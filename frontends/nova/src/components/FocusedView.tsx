import { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconRail } from './IconRail';
import { ModeToggle } from './ModeToggle';
import { GlassBubble, TypingIndicator } from './GlassBubble';
import { InputBar } from './InputBar';
import { EmotionOrb } from './EmotionOrb';
import { SettingsPanel } from './SettingsPanel';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { CharactersPanel } from './CharactersPanel';
import { MemoryPanel } from './MemoryPanel';
import { GamesPanel } from './GamesPanel';
import { LorebookPanel } from './LorebookPanel';
import { ExpressionPortraitsPanel } from './ExpressionPortraitsPanel';
import { SpectatorPanel } from './SpectatorPanel';
import type { Character } from '../lib/types';
import glass from '../styles/glass.module.css';
import styles from './FocusedView.module.css';

/**
 * Focused mode — chat-centric productivity layout.
 *
 * The "power mode" where all system data is accessible. Layout:
 *
 * ┌──────┬──────────┬──────────────────────────────┬────────┐
 * │ Rail │ Panel    │  Chat thread (full-width)     │ Viewer │
 * │ 48px │ 0-280px  │  messages + input             │ panel  │
 * │      │          │                               │ 300px  │
 * └──────┴──────────┴──────────────────────────────┴────────┘
 *
 * The icon rail is always visible. The panel expands on click.
 * The 3D viewer shrinks to a side panel (300px). Chat gets the
 * remaining space for comfortable reading of long responses.
 */
interface FocusedMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface FocusedViewProps {
  mode: 'companion' | 'focused';
  onToggleMode: () => void;
  character: Character | null;
  messages: FocusedMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  activePanel: string | null;
  onPanelChange: (panel: string | null) => void;
  /** Current emotion from the LLM for the emotion indicator. */
  currentEmotion: { emotion: string; intensity: number } | null;
}

export function FocusedView({
  mode,
  onToggleMode,
  character,
  messages,
  isStreaming,
  onSend,
  activePanel,
  onPanelChange,
  currentEmotion,
}: FocusedViewProps) {
  const handleSend = useCallback((text: string) => {
    onSend(text);
  }, [onSend]);

  /** Panel content keyed by rail item ID. */
  const panelContent = useMemo(() => ({
    'chat-history': <ChatHistoryPanel />,
    characters: <CharactersPanel />,
    memory: <MemoryPanel />,
    games: <GamesPanel />,
    spectator: <SpectatorPanel />,
    lorebook: <LorebookPanel />,
    portraits: <ExpressionPortraitsPanel />,
    settings: <SettingsPanel />,
  }), []);

  return (
    <div className={styles.layout}>
      {/* Left: Icon rail + expandable panel */}
      <IconRail activePanel={activePanel} onPanelChange={onPanelChange} panelContent={panelContent} />

      {/* Center: Chat thread */}
      <div className={styles.chatArea}>
        {/* Header */}
        <div className={styles.chatHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {character && (
              <>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: character.avatar_url
                    ? `url(${character.avatar_url}) center/cover`
                    : 'linear-gradient(135deg, var(--nova-accent-pink), var(--nova-accent-primary))',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--nova-text-primary)',
                }}>
                  {character.name}
                </span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EmotionOrb
              emotion={currentEmotion?.emotion ?? null}
              intensity={currentEmotion?.intensity ?? 0}
              variant="focused"
            />
            <ModeToggle mode={mode} onToggle={onToggleMode} />
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messagesArea}>
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => (
              <GlassBubble
                key={msg.id}
                role={msg.role}
                index={0}
                characterName={msg.role === 'assistant' && character ? character.name : undefined}
                noAnimation={i < messages.length - 3}
              >
                {msg.text}
              </GlassBubble>
            ))}
            {isStreaming && <TypingIndicator key="typing" />}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className={styles.inputArea}>
          <InputBar
            onSend={handleSend}
            disabled={isStreaming}
            placeholder={character ? `Message ${character.name}...` : 'Say something...'}
          />
        </div>
      </div>

      {/* Right: Small 3D viewer panel */}
      <motion.div
        className={styles.viewerPanel}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24, delay: 0.3 }}
      >
        <iframe
          src="/shared/viewer/viewer.html"
          title="3D Viewer (Focused)"
          className={styles.viewerIframe}
          allow="autoplay"
        />
        <div className={glass.pill} style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'var(--nova-text-muted)',
        }}>
          {character?.name ?? 'No character'}
        </div>
      </motion.div>
    </div>
  );
}
