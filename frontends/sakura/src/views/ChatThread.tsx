import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import { DialogueBubble } from '../components/DialogueBubble';
import { StatusBar } from '../components/StatusBar';
import { ModelPanel } from '../components/ModelPanel';
import { SessionDrawer } from '../components/SessionDrawer';

/**
 * Full-screen chat thread view with SSE streaming dialogue.
 * Includes StatusBar header, scrollable message list, input composer
 * with send/cancel toggle, and an optional slide-out 3D ModelPanel.
 */
export function ChatThread() {
  const { activeCharacter } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, abortMessage, setContext, loadHistory } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  useEffect(() => {
    if (!activeCharacter) return;
    // Create (or resume) a chat session for this character.
    // The backend returns the most recent open session or creates a new one.
    api.createSession(activeCharacter.id)
      .then((session) => {
        setContext(session.id, activeCharacter.id);
        if (session.id) loadHistory(session.id);
      })
      .catch(console.error);
  }, [activeCharacter, setContext, loadHistory]);

  // Auto-scroll to bottom when new messages arrive or text streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 150px)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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
    const vol = useAppStore.getState().config?.tts_volume;
    audio.volume = typeof vol === 'number' ? vol : 1.0;
    setPlayingAudioId(msg.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  };

  if (!activeCharacter) return null;

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        <StatusBar character={activeCharacter} onOpenSessions={() => setSessionsOpen(true)} />
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

        {/* Composer bar */}
        <div
          className="sticky bottom-0 p-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
            backdropFilter: 'var(--blur-surface)',
            WebkitBackdropFilter: 'var(--blur-surface)',
            borderTop: '1px solid var(--color-border-subtle)'
          }}
        >
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Say something..."
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 text-sm outline-none transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-background)',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
            />
            {loading ? (
              <button
                onClick={abortMessage}
                className="p-2.5 transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-error, #f44)',
                  color: '#fff',
                  borderRadius: 'var(--radius-button)',
                }}
                title="Cancel generation"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!draft.trim()}
                className="p-2.5 transition-all duration-200 disabled:opacity-40"
                style={{
                  background: 'var(--color-accent-gradient)',
                  color: 'var(--color-accent-text)',
                  borderRadius: 'var(--radius-button)',
                  boxShadow: !draft.trim() ? 'none' : '0 2px 8px var(--color-accent-soft)'
                }}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Model panel */}
      <ModelPanel character={activeCharacter} />

      {/* Session management drawer */}
      <SessionDrawer
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        characterId={activeCharacter.id}
        characterName={activeCharacter.name}
      />
    </div>
  );
}
