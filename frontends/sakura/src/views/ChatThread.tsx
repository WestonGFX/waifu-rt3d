import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { DialogueBubble } from '../components/DialogueBubble';
import { StatusBar } from '../components/StatusBar';
import { ModelPanel } from '../components/ModelPanel';

/**
 * Full-screen chat thread view with visual novel style dialogue.
 * Includes StatusBar header, scrollable message list, input composer,
 * and an optional slide-out 3D ModelPanel on the right.
 */
export function ChatThread() {
  const { activeCharacter } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, setContext } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCharacter) return;
    setContext(0, activeCharacter.id);
  }, [activeCharacter, setContext]);

  // Auto-scroll to bottom when new messages arrive
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
    <div className="flex h-screen">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        <StatusBar character={activeCharacter} />
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

      {/* Model panel */}
      <ModelPanel character={activeCharacter} />
    </div>
  );
}
