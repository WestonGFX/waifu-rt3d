/**
 * BondPanel — Container panel for bond progression info.
 *
 * Aggregates the BondProgressBar, BondTimeline, and BondStoryCard list
 * into a single scrollable overlay panel. Opened via the 'bondpanel'
 * overlay type in appStore.
 *
 * @example
 *   <BondPanel onClose={() => setOverlay(null)} />
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Heart, BookOpen, Trophy, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import { BondProgressBar } from './BondProgressBar';
import { BondTimeline } from './BondTimeline';
import { BondStoryCard } from './BondStoryCard';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface BondStory {
  id: number;
  title: string;
  bond_level_required: number;
  unlocked: boolean;
  viewed: boolean;
}

interface Achievement {
  key: string;
  label: string;
  description: string;
  icon: string;
  granted_at: number;
}

interface BondPanelProps {
  /** Called when the panel should close. */
  onClose: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Bond progression panel — displays progress bar, milestone timeline,
 * and story cards for the active character.
 *
 * @param onClose - Callback to close the panel.
 */
export function BondPanel({ onClose }: BondPanelProps) {
  const activeChar = useAppStore(s => s.activeCharacter);
  const bondLevel = useAppStore(s => s.bondLevel);
  const bondTier = useAppStore(s => s.bondTier);
  const bondXp = useAppStore(s => s.bondXp);
  const bondXpToNext = useAppStore(s => s.bondXpToNext);


  const [stories, setStories] = useState<BondStory[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [storiesExpanded, setStoriesExpanded] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  const [achievementsExpanded, setAchievementsExpanded] = useState(true);

  const activeCharId = activeChar?.id ?? null;

  // Fetch stories on mount
  useEffect(() => {
    if (!activeCharId) return;
    api.getBondStories(activeCharId)
      .then(res => { if (res.ok) setStories(res.stories); })
      .catch(() => { /* silent */ });
  }, [activeCharId]);

  // Fetch achievements on mount and when charId changes
  useEffect(() => {
    if (!activeCharId) return;
    api.listAchievements(activeCharId)
      .then(res => setAchievements(res.achievements as Achievement[]))
      .catch(() => { /* silent */ });
  }, [activeCharId]);

  // Escape key closes
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  /** Story viewer not yet wired — stub for future re-enable. */
  const handleStoryClick = useCallback((_storyId: number) => {
    // bondstory overlay removed; story viewer deferred
  }, []);

  if (!activeChar || !activeCharId) return null;

  const unlockedStories = stories.filter(s => s.unlocked);
  const lockedStories = stories.filter(s => !s.unlocked);

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        maxWidth: '100vw',
        zIndex: 80,
        backgroundColor: 'var(--color-background)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <Heart size={18} style={{ color: 'var(--color-accent)' }} />
        <span style={{ flex: 1, fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
          Bond with {activeChar.name}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            color: 'var(--color-text-tertiary)',
          }}
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Progress bar section */}
        <BondProgressBar
          bondLevel={bondLevel}
          bondXp={bondXp}
          xpToNext={bondXpToNext}
          tier={bondTier}
        />

        {/* Stories section */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setStoriesExpanded(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <BookOpen size={14} style={{ color: 'var(--color-accent)' }} />
            Bond Stories ({unlockedStories.length}/{stories.length})
            {storiesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {storiesExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {unlockedStories.map(story => (
                    <BondStoryCard
                      key={story.id}
                      title={story.title}
                      bondLevelRequired={story.bond_level_required}
                      unlocked
                      viewed={story.viewed}
                      onRead={() => handleStoryClick(story.id)}
                    />
                  ))}
                  {lockedStories.map(story => (
                    <BondStoryCard
                      key={story.id}
                      title={story.title}
                      bondLevelRequired={story.bond_level_required}
                      unlocked={false}
                      viewed={false}
                    />
                  ))}
                  {stories.length === 0 && (
                    <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>
                      No bond stories available yet.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Timeline section */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setTimelineExpanded(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Trophy size={14} style={{ color: 'var(--color-accent)' }} />
            Milestone Timeline
            {timelineExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {timelineExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <BondTimeline
                  charId={activeCharId}
                  currentLevel={bondLevel}
                  currentTier={bondTier}
                  onStoryClick={(storyId, _title) => handleStoryClick(storyId)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Achievements section */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setAchievementsExpanded(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Award size={14} style={{ color: 'var(--color-accent)' }} />
            Achievements ({achievements.length})
            {achievementsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {achievementsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                {achievements.length === 0 ? (
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic', margin: '8px 0 0' }}>
                    No achievements yet — keep chatting!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                    {achievements.map(ach => (
                      <div
                        key={ach.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--color-surface-raised)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{ach.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {ach.label}
                          </div>
                          {ach.description && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                              {ach.description}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
