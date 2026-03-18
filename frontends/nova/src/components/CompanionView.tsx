import { useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FloatingNav } from './FloatingNav';
import { CharacterInfoPill } from './CharacterInfoPill';
import { ModeToggle } from './ModeToggle';
import { QuickActions } from './QuickActions';
import { GlassBubble, TypingIndicator } from './GlassBubble';
import { InputBar } from './InputBar';
import { EmotionOrb } from './EmotionOrb';
import { FrontendSwitcher } from './FrontendSwitcher';
import type { Character } from '../lib/types';

/**
 * Companion mode — immersive glass-over-3D layout.
 *
 * The 3D viewer fills the entire viewport (rendered by ViewerFrame in the
 * parent). CompanionView overlays floating glass UI elements on top:
 *
 * ┌──────────────────────────────────────────────┐
 * │ [Nav dots]    [Character pill]   [Mode toggle]│
 * │                                               │
 * │              3D CHARACTER                      │
 * │              (fills viewport)       [Chat]     │
 * │                                    [bubbles]   │
 * │                                               │
 * │ [Quick actions]  [Emotion]    [Input bar──]   │
 * └──────────────────────────────────────────────┘
 *
 * All panels are frosted glass with z-index 10+, floating over the
 * 3D scene at z-index 0.
 */
interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Server-side message ID for fork operations. */
  serverMessageId?: number;
}

interface CompanionViewProps {
  /** Current mode — CompanionView only renders when mode === 'companion'. */
  mode: 'companion' | 'focused';
  onToggleMode: () => void;

  /** Active character info */
  character: Character | null;

  /** Chat messages to display */
  messages: ChatMessage[];

  /** Whether the AI is currently generating a response */
  isStreaming: boolean;

  /** Send a new message */
  onSend: (text: string) => void;

  /** Current emotion from the LLM for the emotion orb. */
  currentEmotion: { emotion: string; intensity: number } | null;

  /** Callbacks for navigation actions */
  onCharacterSwitch?: () => void;
  onSettings?: () => void;
  onCommandPalette?: () => void;

  /** Fork the conversation at a specific message ID. */
  onForkMessage?: (messageId: number) => void;

  /** Active session ID — forwarded to GlassBubble for bookmark creation. */
  sessionId?: number | null;
}

export function CompanionView({
  mode,
  onToggleMode,
  character,
  messages,
  isStreaming,
  onSend,
  currentEmotion,
  onCharacterSwitch,
  onSettings,
  onCommandPalette,
  onForkMessage,
  sessionId,
}: CompanionViewProps) {
  const handleSend = useCallback((text: string) => {
    onSend(text);
  }, [onSend]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10,
      pointerEvents: 'none',
    }}>
      {/* === Top bar: Nav, Character Info, Mode Toggle === */}
      <FloatingNav
        onCharacterSwitch={onCharacterSwitch}
        onSettings={onSettings}
        onCommandPalette={onCommandPalette}
      />

      <FrontendSwitcher style={{ position: 'fixed', top: 68, left: 20, zIndex: 20 }} />

      {character && (
        <CharacterInfoPill
          name={character.name}
          avatarUrl={character.avatar_url || undefined}
        />
      )}

      <ModeToggle mode={mode} onToggle={onToggleMode} />

      {/* === Chat panel (right side) === */}
      <div style={{
        position: 'fixed',
        top: 75,
        right: 16,
        bottom: 16,
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'auto',
      }}>
        {/* Messages area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '16px 4px 12px 4px',
          overflowY: 'auto',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 100%)',
        }}>
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => (
              <GlassBubble
                key={msg.id}
                role={msg.role}
                index={i}
                characterName={msg.role === 'assistant' && character ? character.name : undefined}
                noAnimation={i < messages.length - 3}
                serverMessageId={msg.serverMessageId}
                onFork={onForkMessage}
                sessionId={sessionId}
                characterId={character?.id}
              >
                {msg.text}
              </GlassBubble>
            ))}
            {isStreaming && <TypingIndicator key="typing" />}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <InputBar
          onSend={handleSend}
          disabled={isStreaming}
          placeholder={character ? `Message ${character.name}...` : 'Say something...'}
        />
      </div>

      {/* === Emotion orb (bottom center) === */}
      <EmotionOrb
        emotion={currentEmotion?.emotion ?? null}
        intensity={currentEmotion?.intensity ?? 0}
        variant="companion"
      />

      {/* === Bottom bar: Quick Actions === */}
      <QuickActions />
    </div>
  );
}
