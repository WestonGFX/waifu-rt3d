/**
 * PetMiniChat – Slide-up mini chat input for the desktop pet window.
 *
 * Renders a compact text input at the bottom of the pet overlay.
 * Messages are sent through the existing ChatContext so the companion
 * responds exactly as it would in the full app.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useChat } from '../../context/ChatContext.tsx';

interface PetMiniChatProps {
  /** Whether the chat input is visible. */
  open: boolean;
  /** Callback to close the chat input. */
  onClose: () => void;
}

/**
 * Compact chat input that slides up from the bottom of the pet window.
 *
 * @param props.open - Controls visibility of the input.
 * @param props.onClose - Called when the user explicitly closes the input.
 */
export default function PetMiniChat({ open, onClose }: PetMiniChatProps) {
  const { state, sendMessage } = useChat();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /** Focus the input when the panel opens. */
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  /** Send the message and clear the input. */
  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || state.isLoading) return;

    void sendMessage(trimmed);
    setInputValue('');
  }, [inputValue, sendMessage, state.isLoading]);

  /** Handle keyboard events in the input. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  /** Show the latest assistant reply if available. */
  const lastAssistantMessage = state.messages
    .filter((m) => m.role === 'assistant')
    .at(-1);

  return (
    <div className={`pet-mini-chat ${open ? 'pet-mini-chat--open' : ''}`}>
      {/* Latest reply preview */}
      {lastAssistantMessage ? (
        <div className="pet-mini-chat__reply">
          <p className="pet-mini-chat__reply-text">
            {lastAssistantMessage.content.length > 120
              ? `${lastAssistantMessage.content.slice(0, 120)}...`
              : lastAssistantMessage.content}
          </p>
        </div>
      ) : null}

      {/* Input row */}
      <div className="pet-mini-chat__input-row">
        <input
          ref={inputRef}
          type="text"
          className="pet-mini-chat__input"
          placeholder={state.isLoading ? 'Thinking...' : 'Say something...'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={state.isLoading}
        />
        <button
          type="button"
          className="pet-mini-chat__send"
          onClick={handleSubmit}
          disabled={state.isLoading || !inputValue.trim()}
          aria-label="Send message"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
