import { useState } from 'react';
import { ChevronRight, ChevronLeft, Tv, Gamepad2, Brain, BookOpen, Palette, BookText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FEATURE_TOUR_ITEMS } from '../../../data/presets';
import type { WizardStepProps } from '../../wizard/WizardShell';

/* ── Icon mapping ─────────────────────────────────────────────────────── */

const ICONS: Record<string, React.ReactNode> = {
  Tv: <Tv size={24} />,
  Gamepad2: <Gamepad2 size={24} />,
  Brain: <Brain size={24} />,
  BookOpen: <BookOpen size={24} />,
  Palette: <Palette size={24} />,
  BookText: <BookText size={24} />,
};

/**
 * Onboarding Step 5: Feature Tour.
 *
 * Horizontal swipe carousel showing 6 feature highlight cards.
 * Each card shows an icon, title, description, and keyboard shortcut badge.
 */
export function StepFeatureTour({ onNext }: WizardStepProps) {
  const [currentCard, setCurrentCard] = useState(0);
  const [direction, setDirection] = useState(1);
  const item = FEATURE_TOUR_ITEMS[currentCard];

  const nextCard = () => {
    if (currentCard < FEATURE_TOUR_ITEMS.length - 1) {
      setDirection(1);
      setCurrentCard(c => c + 1);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setDirection(-1);
      setCurrentCard(c => c - 1);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <h2 className="char-name-display mb-1" style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}>
        Explore Features
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Here's a taste of what you can do. Discover more as you chat.
      </p>

      {/* Feature card carousel */}
      <div
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          minHeight: 180,
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={item.id}
            custom={direction}
            initial={{ x: direction > 0 ? 30 : -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -30 : 30, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center text-center p-6"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
            >
              {ICONS[item.icon] || <Palette size={24} />}
            </div>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              {item.title}
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              {item.description}
            </p>
            {item.shortcut && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-mono"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {item.shortcut}
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Carousel navigation arrows */}
        {currentCard > 0 && (
          <button
            onClick={prevCard}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all"
            style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-tertiary)' }}
          >
            <ChevronLeft size={14} />
          </button>
        )}
        {currentCard < FEATURE_TOUR_ITEMS.length - 1 && (
          <button
            onClick={nextCard}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all"
            style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-tertiary)' }}
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mb-6">
        {FEATURE_TOUR_ITEMS.map((_, i) => (
          <button
            key={i}
            onClick={() => { setDirection(i > currentCard ? 1 : -1); setCurrentCard(i); }}
            className="rounded-full transition-all"
            style={{
              width: i === currentCard ? 16 : 6,
              height: 6,
              backgroundColor: i === currentCard ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Continue <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
