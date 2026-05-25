import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLLMProbe } from '../hooks/useLLMProbe';

/**
 * LLMProbeAside — quiet italic aside surfacing LLM probe warnings in the
 * character's voice.
 *
 * Why an aside instead of a toast/banner:
 *   Session 46's declutter mandate was explicit — no popups, no
 *   gamification chrome, no surprise modals.  A warning like "your model
 *   is a reasoning model" is real signal the user needs, but it should
 *   feel like the character speaking, not an error dialog.  We render it
 *   inline above the chat surface as italic text matching the
 *   asterisk-action baseline ("*tilts head*…").
 *
 * Visibility rules:
 *   - Hidden while the probe is in flight (no flicker on boot).
 *   - Hidden when ``warning`` is ``null`` (most users — model is healthy).
 *   - Hidden when the user has dismissed this warning code+model pair.
 *
 * Dismissal persists in ``localStorage`` via the hook, keyed by warning
 * code + model name.  Switching models re-arms the aside since the new
 * model may have different traits worth warning about.
 */
export function LLMProbeAside() {
  const probe = useLLMProbe();

  const visible =
    !probe.loading && probe.warning !== null && !probe.dismissed && probe.copy !== null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`llm-probe-${probe.warning}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 14px',
            margin: '8px 16px 0',
            borderRadius: 10,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            fontSize: 13,
            fontStyle: 'italic',
            lineHeight: 1.5,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
          data-testid="llm-probe-aside"
        >
          <span style={{ flex: 1, minWidth: 0 }}>{probe.copy}</span>
          <button
            type="button"
            onClick={probe.dismiss}
            aria-label="Dismiss model warning"
            data-testid="llm-probe-dismiss"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer',
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
