/**
 * MemorialScene — Full-screen cinematic overlay for bond memorial scenes.
 *
 * Walks through a sequence of "beats" one at a time (click or Space to
 * advance), ending on a culmination moment and keepsake reveal. On finish
 * it POSTs the completion to the backend and calls onClose.
 *
 * Expression hints are dispatched to the VRM viewer via
 * viewerStore.dispatchExpression for each beat to add life to the scene.
 *
 * @example
 *   <MemorialScene
 *     charId={42}
 *     scene={pendingScene}
 *     onClose={() => closeOverlay()}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Gift, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useViewerStore } from '../stores/viewerStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A memorial scene payload returned by the backend. */
export interface MemorialSceneData {
  /** Unique scene identifier used when POSTing completion. */
  id: string;
  /** Short prose description of the scene setting (displayed as italic narration). */
  setting: string;
  /** Ordered list of beat lines the user advances through. */
  beats: string[];
  /** Final line shown after all beats — the emotional peak. */
  culmination: string;
  /** Name / description of the keepsake unlocked by this scene. */
  keepsake: string;
}

interface MemorialSceneProps {
  /** ID of the character — used for the POST completion call. */
  charId: number;
  /** Scene data to display. */
  scene: MemorialSceneData;
  /** Called when the scene finishes (after POST completes) or is dismissed. */
  onClose: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Beat-to-expression mapping
   Simple heuristic: scan beat text for sentiment keywords and pick an
   appropriate VRM expression. Falls back to 'neutral'.
   ═══════════════════════════════════════════════════════════════════════ */

const EXPRESSION_KEYWORDS: Array<[RegExp, string]> = [
  [/laugh|smile|grin|joy|happy|giggl/i, 'happy'],
  [/sad|cry|tear|weep|sorry|miss/i, 'sad'],
  [/surpris|shock|gasp|sudden|unexpect/i, 'surprised'],
  [/anger|angry|frust|furious/i, 'angry'],
  [/blush|embarra|shy|soft|tender/i, 'relaxed'],
  [/fear|scared|nervous|tremble/i, 'surprised'],
];

/**
 * Infer a VRM expression name from a beat's text content.
 *
 * @param text - The beat line text
 * @returns A VRM expression name string
 */
function inferExpression(text: string): string {
  for (const [pattern, expr] of EXPRESSION_KEYWORDS) {
    if (pattern.test(text)) return expr;
  }
  return 'neutral';
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Stages the scene walks through in sequence.
 * - 'setting'    : italic narration of the scene location
 * - 'beats'      : story beats advanced by click/space
 * - 'culmination': the emotional peak
 * - 'keepsake'   : reveal of the unlocked keepsake item
 * - 'done'       : POST complete + call onClose
 */
type Stage = 'setting' | 'beats' | 'culmination' | 'keepsake' | 'done';

/**
 * Full-screen cinematic memorial scene overlay.
 *
 * @param charId  - Character ID for the completion POST.
 * @param scene   - Scene data (setting, beats, culmination, keepsake).
 * @param onClose - Callback invoked after completion is posted.
 */
export function MemorialScene({ charId, scene, onClose }: MemorialSceneProps) {
  const [stage, setStage] = useState<Stage>('setting');
  const [beatIndex, setBeatIndex] = useState(0);
  const [keepsakeVisible, setKeepsakeVisible] = useState(false);
  const [posting, setPosting] = useState(false);
  const dispatchExpression = useViewerStore(s => s.dispatchExpression);
  const closedRef = useRef(false);

  /** Advance to the next stage or beat in the sequence. */
  const advance = useCallback(() => {
    if (posting || closedRef.current) return;

    if (stage === 'setting') {
      setStage('beats');
      setBeatIndex(0);
      // Fire expression for first beat
      if (scene.beats.length > 0) {
        dispatchExpression(inferExpression(scene.beats[0]), 0.7);
      }
      return;
    }

    if (stage === 'beats') {
      const next = beatIndex + 1;
      if (next < scene.beats.length) {
        setBeatIndex(next);
        dispatchExpression(inferExpression(scene.beats[next]), 0.7);
      } else {
        // All beats done — move to culmination
        setStage('culmination');
        dispatchExpression('happy', 0.85);
      }
      return;
    }

    if (stage === 'culmination') {
      setStage('keepsake');
      // Brief delay then reveal keepsake with animation
      setTimeout(() => setKeepsakeVisible(true), 300);
      return;
    }

    if (stage === 'keepsake') {
      // POST completion then close
      setPosting(true);
      closedRef.current = true;
      api.completeMemorialScene(charId, scene.id)
        .catch(() => { /* non-critical — scene still closes */ })
        .finally(() => {
          dispatchExpression('neutral', 0.5);
          onClose();
        });
      return;
    }
  }, [stage, beatIndex, scene, charId, posting, dispatchExpression, onClose]);

  // Space key advances
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [advance]);

  // Determine displayed text for current stage
  const displayText = (() => {
    if (stage === 'setting') return scene.setting;
    if (stage === 'beats') return scene.beats[beatIndex] ?? '';
    if (stage === 'culmination') return scene.culmination;
    return '';
  })();

  const isLast =
    stage === 'keepsake' ||
    (stage === 'beats' && beatIndex === scene.beats.length - 1) ||
    stage === 'culmination';

  const progress = (() => {
    const total = 2 + scene.beats.length; // setting + beats + culmination
    if (stage === 'setting') return 1 / total;
    if (stage === 'beats') return (2 + beatIndex) / total;
    return 1;
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      onClick={advance}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Progress bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <motion.div
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            height: '100%',
            backgroundColor: 'var(--color-accent)',
          }}
        />
      </div>

      {/* Scene content area */}
      <div
        style={{
          maxWidth: 640,
          width: '100%',
          padding: '0 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${stage}-${beatIndex}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            {/* Setting label */}
            {stage === 'setting' && (
              <span
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  color: 'var(--color-accent)',
                  opacity: 0.8,
                  fontWeight: 600,
                }}
              >
                Scene
              </span>
            )}

            {/* Main text */}
            <p
              style={{
                color: 'var(--color-text-primary)',
                fontSize: stage === 'setting' ? '1rem' : '1.2rem',
                fontStyle: stage === 'setting' ? 'italic' : 'normal',
                lineHeight: 1.7,
                margin: 0,
                opacity: stage === 'setting' ? 0.75 : 1,
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                maxWidth: 560,
              }}
            >
              {displayText}
            </p>

            {/* Culmination sparkle decoration */}
            {stage === 'culmination' && (
              <Sparkles
                size={22}
                style={{ color: 'var(--color-accent)', opacity: 0.8, marginTop: 4 }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Keepsake reveal panel */}
        <AnimatePresence>
          {stage === 'keepsake' && keepsakeVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, ease: 'backOut' }}
              style={{
                border: '1px solid var(--color-accent)',
                borderRadius: 12,
                padding: '20px 28px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                maxWidth: 380,
                width: '100%',
              }}
            >
              <Gift size={22} style={{ color: 'var(--color-accent)' }} />
              <span
                style={{
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--color-accent)',
                  fontWeight: 600,
                }}
              >
                Keepsake Unlocked
              </span>
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-primary)',
                  fontSize: '1rem',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                {scene.keepsake}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Advance hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--color-text-tertiary)',
          fontSize: '0.75rem',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      >
        <span>{isLast && stage !== 'keepsake' ? 'Continue' : stage === 'keepsake' ? 'Finish' : 'Click to continue'}</span>
        <ChevronRight size={13} />
        <span style={{ opacity: 0.55 }}>Space</span>
      </div>
    </motion.div>
  );
}
