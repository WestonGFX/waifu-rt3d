import { useMemo } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';

import { microcopy } from '../lib/microcopy';
import { useChatStore } from '../stores/chatStore';

interface ChatPanelProps {
  onToggleMic: () => void;
  micEnabled: boolean;
  speakingEnabled: boolean;
  setSpeakingEnabled: (value: boolean) => void;
}

export function ChatPanel({
  onToggleMic,
  micEnabled,
  speakingEnabled,
  setSpeakingEnabled
}: ChatPanelProps) {
  const {
    messages,
    draft,
    isTyping,
    loading,
    setDraft,
    sendMessage,
    retryMessage
  } = useChatStore();

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await sendMessage(draft, speakingEnabled);
  };

  return (
    <section className="v2-chat-wrap">
      <div className="v2-chat-messages" role="log" aria-live="polite">
        {sortedMessages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <motion.article
              layout
              key={message.id}
              className={isUser ? 'v2-bubble-row user' : 'v2-bubble-row ai'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {!isUser ? <div className="v2-avatar-orb" /> : null}
              <div className={`v2-bubble ${isUser ? 'user' : 'ai'} ${message.status}`}>
                <p>{message.text}</p>
                <div className="v2-bubble-meta">
                  <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {message.status === 'failed' ? (
                    <button onClick={() => retryMessage(message.id, speakingEnabled)} type="button">
                      {microcopy.actions.retry}
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.article>
          );
        })}

        {isTyping ? <div className="v2-typing">{microcopy.status.typing}</div> : null}
      </div>

      <form className="v2-chat-input" onSubmit={onSubmit}>
        <button type="button" onClick={onToggleMic} className={micEnabled ? 'active' : ''}>
          {micEnabled ? microcopy.input.micOn : microcopy.input.micOff}
        </button>

        <label className="v2-tts-toggle">
          <input
            type="checkbox"
            checked={speakingEnabled}
            onChange={(event) => setSpeakingEnabled(event.target.checked)}
          />
          <span>TTS</span>
        </label>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={1}
          placeholder={microcopy.input.placeholder}
        />

        <button type="submit" disabled={loading || !draft.trim()}>
          {microcopy.input.send}
        </button>
      </form>
    </section>
  );
}
