import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Tv, Gamepad2, Brain, BookOpen, Palette, BookText, Sparkles, Layers, Monitor } from 'lucide-react';
import { useWizardStore, type FeatureTip, type FeatureTipAction } from '../../stores/wizardStore';
import { useAppStore } from '../../stores/appStore';

/* ── Icon mapping ─────────────────────────────────────────────────────── */

const ICONS: Record<string, React.ReactNode> = {
  Tv: <Tv size={18} />,
  Gamepad2: <Gamepad2 size={18} />,
  Brain: <Brain size={18} />,
  BookOpen: <BookOpen size={18} />,
  Palette: <Palette size={18} />,
  BookText: <BookText size={18} />,
  Sparkles: <Sparkles size={18} />,
  Layers: <Layers size={18} />,
  Monitor: <Monitor size={18} />,
};

interface FeatureSpotlightProps {
  tip: FeatureTip;
  onDismiss: () => void;
  onTryIt: () => void;
  onDontShow: () => void;
}

/**
 * Floating feature discovery card.
 *
 * Appears in the bottom-right corner (desktop) or bottom center above
 * TabBar (mobile). Auto-dismisses after 15 seconds if not interacted with.
 *
 * Actions:
 * - "Try It" → marks discovered, closes tip, executes action
 * - "Later" → dismisses without marking discovered (re-triggers next session)
 * - "Don't show" → marks discovered + snoozes all tips for 24h
 */
export function FeatureSpotlight({ tip, onDismiss, onTryIt, onDontShow }: FeatureSpotlightProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 15_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-xl overflow-hidden"
      style={{
        width: 320,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3 pb-0">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          {ICONS[tip.icon] || <Sparkles size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {tip.title}
          </h4>
          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {tip.description}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded flex-shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 p-3 pt-2.5">
        <button
          onClick={onTryIt}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Try It
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Later
        </button>
        <button
          onClick={onDontShow}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ml-auto"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Don't show
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Execute a feature tip action.
 *
 * Maps tip action types to actual app operations (opening overlays,
 * triggering shortcuts, opening wizards, etc.).
 */
export function executeFeatureTipAction(action: FeatureTipAction) {
  const { openOverlay, toggleCinematicMode, toggleVnMode, toggleModelPanel } = useAppStore.getState();
  const { openWizard } = useWizardStore.getState();

  switch (action.type) {
    case 'overlay':
      openOverlay(action.overlay as Parameters<typeof openOverlay>[0]);
      break;
    case 'shortcut':
      // Simulate keyboard shortcut — dispatch the associated action
      if (action.key === 'ctrl+i') toggleCinematicMode();
      break;
    case 'wizard':
      openWizard(action.wizardId);
      break;
    case 'toggle':
      if (action.target === 'vn_mode') toggleVnMode();
      if (action.target === 'cinematic_mode') toggleCinematicMode();
      break;
    case 'expand-panel':
      if (action.panel === 'model') toggleModelPanel();
      break;
  }
}
