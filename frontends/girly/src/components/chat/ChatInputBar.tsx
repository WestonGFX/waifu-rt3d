/**
 * ChatInputBar – multiline composer, send button, microphone toggle,
 * and Director Mode toggle.
 *
 * Responsibilities:
 *   - Controlled multiline composer that clears after send.
 *   - Send on button click OR Enter key.
 *   - Mic button that starts/stops WebSpeechSTT and fills the input
 *     with the recognised text.
 *   - Mic button is hidden entirely when STT is not supported by the
 *     browser (i.e. non-Chrome/Edge).
 *   - Input and send button are disabled while ChatContext.isLoading
 *     is true (waiting for LLM response).
 *   - Director Mode toggle: when active, the next message is sent as
 *     a 'director' role stage direction instead of a 'user' message.
 *     Director messages are injected as system context and do NOT
 *     trigger an LLM response.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useChat } from '../../context/ChatContext.tsx';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.ts';
import { Textarea } from '@/components/ui/textarea.tsx';

interface ChatInputBarProps {
  autofocusEnabled?: boolean;
}

export default function ChatInputBar({ autofocusEnabled = true }: ChatInputBarProps) {
  const { state, sendMessage, addDirectorNote } = useChat();
  const [inputValue, setInputValue] = useState('');
  const [isDirectorMode, setIsDirectorMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const hasAutofocusedRef = useRef(false);

  const {
    isRecording,
    isSupported: sttSupported,
    error: sttError,
    start: startSTT,
    stop: stopSTT,
  } = useSpeechRecognition((transcript) => {
    // When STT fires a result, populate the input field.
    setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
    textareaRef.current?.focus();
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 72), 224);
    textarea.style.height = `${nextHeight}px`;
  }, [inputValue]);

  useEffect(() => {
    if (state.isLoading || !shouldRestoreFocusRef.current || !autofocusEnabled) return;

    const activeElement = document.activeElement;
    const composer = textareaRef.current;
    if (
      activeElement
      && activeElement !== document.body
      && activeElement !== document.documentElement
      && activeElement !== composer
    ) {
      shouldRestoreFocusRef.current = false;
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      shouldRestoreFocusRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [autofocusEnabled, state.isLoading]);

  useEffect(() => {
    if (state.isLoading || hasAutofocusedRef.current || !autofocusEnabled) return;

    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      hasAutofocusedRef.current = true;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [autofocusEnabled, state.isLoading]);

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleSend = useCallback(() => {
    const nextMessage = inputValue.trim();
    if (!nextMessage || state.isLoading) return;
    shouldRestoreFocusRef.current = true;

    if (isDirectorMode) {
      // Director notes are added to chat history but don't trigger LLM.
      addDirectorNote(nextMessage);
    } else {
      void sendMessage(nextMessage);
    }

    setInputValue('');
  }, [inputValue, state.isLoading, isDirectorMode, sendMessage, addDirectorNote]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const toggleMic = useCallback(() => {
    if (isRecording) {
      stopSTT();
    } else {
      startSTT();
    }
  }, [isRecording, startSTT, stopSTT]);

  const toggleDirectorMode = useCallback(() => {
    setIsDirectorMode((prev) => !prev);
    textareaRef.current?.focus();
  }, []);

  /* ── Render ────────────────────────────────────────────────────── */

  const directorBorderClass = isDirectorMode
    ? 'border-amber-400/60 shadow-[0_0_16px_-4px_rgba(251,191,36,0.25)]'
    : 'border-[color:var(--control-border-soft)] shadow-[var(--shell-shadow-soft)]';

  return (
    <div className={`mx-auto w-full max-w-[52rem] rounded-[28px] border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,white_4%),color-mix(in_srgb,var(--card-bg-soft)_88%,transparent))] backdrop-blur-xl transition-all duration-200 ${directorBorderClass}`}>
      {/* Director Mode indicator banner */}
      {isDirectorMode && (
        <div className="flex items-center gap-2 px-5 pt-2.5 pb-0">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-400 uppercase">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Director Mode
          </span>
          <span className="text-[11px] text-text-muted italic">
            Stage directions — won't trigger a response
          </span>
        </div>
      )}

      <div data-testid="chat-input-shell" className="flex items-center gap-3 px-4 py-3 md:px-4.5">
        <div className="min-w-0 flex-1">
          <Textarea
            ref={textareaRef}
            aria-label={isDirectorMode ? 'Write a director note…' : 'Type a message…'}
            name="message"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state.isLoading}
            placeholder={isDirectorMode ? 'e.g. "She should be more shy now…"' : 'Type a message…'}
            rows={2}
            className={[
              'min-h-[68px] max-h-[224px] resize-none rounded-[22px] border align-top',
              isDirectorMode
                ? 'border-amber-400/40 bg-amber-500/5 px-4 py-3 text-[15px] leading-6 text-amber-200 placeholder:text-amber-400/50 italic'
                : 'border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-4 py-3 text-[15px] leading-6 text-text-primary placeholder:text-text-muted',
              'shadow-none focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--control-ring-offset)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          />
          {sttError ? (
            <p className="mt-2 px-1 text-[11px] text-rose-pastel-400">{sttError}</p>
          ) : null}
        </div>

        {/* Action buttons – director toggle, mic, send */}
        <div data-testid="chat-input-actions" className="flex shrink-0 self-center flex-col justify-center gap-2">
          {/* Director Mode toggle */}
          <button
            type="button"
            onClick={toggleDirectorMode}
            aria-label={isDirectorMode ? 'Exit director mode' : 'Enter director mode'}
            title={isDirectorMode ? 'Exit director mode' : 'Director mode — add stage directions'}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-pill border transition-all duration-200',
              isDirectorMode
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-400 shadow-[0_0_12px_-3px_rgba(251,191,36,0.35)]'
                : 'border-[color:var(--control-border)] bg-[color:var(--control-bg)] text-text-muted hover:bg-[color:var(--control-bg-hover)] hover:text-amber-400',
            ].join(' ')}
          >
            {/* Film clapperboard icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4z" />
              <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
              <path d="m7 6 3-3 4 3" />
              <path d="m14 6 3-3" />
              <line x1="4" y1="11" x2="20" y2="11" />
            </svg>
          </button>

          {/* Mic button – only rendered when the browser supports STT */}
          {sttSupported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={state.isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-pill border transition-colors',
                isRecording
                  ? 'border-rose-pastel-300 bg-rose-pastel-300 text-white animate-pulse'
                  : 'border-[color:var(--control-border)] bg-[color:var(--control-bg)] text-anime-600 hover:bg-[color:var(--control-bg-hover)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="9" y="1" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={state.isLoading || !inputValue.trim()}
            aria-label={isDirectorMode ? 'Add director note' : 'Send message'}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-pill transition-colors',
              isDirectorMode
                ? 'bg-amber-500 text-white shadow-[0_18px_28px_-22px_rgba(251,191,36,0.4)] hover:bg-amber-600'
                : 'bg-anime-500 text-white shadow-[0_18px_28px_-22px_var(--color-glow-primary)] hover:bg-anime-600',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {isDirectorMode ? (
              /* Megaphone / director icon for director send */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 11 18-5v12L3 13v-2z" />
                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
