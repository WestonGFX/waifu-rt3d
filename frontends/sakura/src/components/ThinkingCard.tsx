import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, Check, ChevronDown, Copy, TriangleAlert } from 'lucide-react';
import type { ThoughtsMode } from '../stores/appStore';
import { soundsLikeAssistant, thinkingPreview } from '../lib/thinkingSignals';

interface ThinkingCardProps {
  /** The model's hidden reasoning. */
  thinking?: string;
  /** The reply exactly as the model typed it, before the app parsed/stripped it. */
  rawOutput?: string;
  /** Global visibility setting (Settings → Chat). */
  mode: ThoughtsMode;
  /** True while this reply is still streaming — the one-line peek follows the live text. */
  streaming?: boolean;
}

type Tab = 'thinking' | 'raw';

/** Splits raw output so a leaked internal ``[Memory]`` line is shown struck-through. */
function RawText({ text }: { text: string }) {
  const parts = text.split(/(^[ \t]*\[Memory\][^\n]*)/gim);
  return (
    <>
      {parts.map((part, i) =>
        /^[ \t]*\[Memory\]/i.test(part) ? (
          <span key={i} className="think-leak" title="Internal label the app removed before showing the reply">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Quiet card above a reply showing what the model reasoned (and, on a second tab,
 * what it actually typed before cleanup). Visibility follows the Settings choice:
 * off = not rendered, peek = one line that expands, open = expanded.
 * Never sent back to the model and never stored as memory.
 * Styling: styles/thinking.css.
 */
export function ThinkingCard({ thinking, rawOutput, mode, streaming = false }: ThinkingCardProps) {
  const [open, setOpen] = useState(mode === 'open');
  const [tab, setTab] = useState<Tab>('thinking');
  const [copied, setCopied] = useState(false);

  // Follow the global setting when it changes.
  useEffect(() => setOpen(mode === 'open'), [mode]);

  if (mode === 'off' || (!thinking && !rawOutput)) return null;

  const showTab: Tab = tab === 'raw' && rawOutput ? 'raw' : 'thinking';
  const body = showTab === 'raw' ? rawOutput ?? '' : thinking ?? '';
  const assistantish = soundsLikeAssistant(thinking);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <div className="think-card" data-open={open} data-streaming={streaming}>
      <div className="think-head">
        <button
          type="button"
          className="think-toggle"
          aria-expanded={open}
          aria-label={open ? 'Hide the model’s thinking' : 'Show the model’s thinking'}
          onClick={() => setOpen((v) => !v)}
        >
          <Brain size={14} strokeWidth={1.5} aria-hidden />
          <span className="think-label">Thinking</span>
          {!open && <span className="think-peek">{thinkingPreview(thinking) || 'Model output'}</span>}
          <ChevronDown size={14} strokeWidth={1.5} className="think-chevron" aria-hidden />
        </button>
        {assistantish && (
          <span
            className="think-notice"
            title="This reasoning reads like a generic assistant, not the character. The prompt or the model may not be holding the role-play."
          >
            <TriangleAlert size={12} strokeWidth={1.75} aria-hidden />
            Reads like an assistant
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="think-bar">
              <div className="think-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={showTab === 'thinking'} className="think-tab" onClick={() => setTab('thinking')}>
                  Thinking
                </button>
                {rawOutput && (
                  <button type="button" role="tab" aria-selected={showTab === 'raw'} className="think-tab" onClick={() => setTab('raw')}>
                    Raw output
                  </button>
                )}
              </div>
              <button type="button" className="think-copy" onClick={copy} aria-label="Copy" title={copied ? 'Copied' : 'Copy'}>
                {copied ? <Check size={13} strokeWidth={1.75} aria-hidden /> : <Copy size={13} strokeWidth={1.5} aria-hidden />}
              </button>
            </div>
            <pre className="think-body">{showTab === 'raw' ? <RawText text={body} /> : body}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
