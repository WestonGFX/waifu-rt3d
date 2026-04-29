import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, MessageSquare, Search, Download, X, Music, Settings, Box, MoreHorizontal } from 'lucide-react';
import type { Character } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import { RELEASE_NOTES } from '../data/changelog';
import { StreakBadge } from './StreakBadge';
import { BondProgressBar } from './BondProgressBar';
import { ContextBudgetPill } from './ContextBudgetPill';

/** Map bond tier keys to badge colors. */
const TIER_BADGE_COLORS: Record<string, string> = {
  stranger: 'var(--color-text-tertiary)',
  acquaintance: '#60a5fa',
  friend: '#34d399',
  close_friend: '#a78bfa',
  soulmate: '#fbbf24',
};

/** Map bond tier keys to display labels. */
const TIER_BADGE_LABELS: Record<string, string> = {
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close_friend: 'Close Friend',
  soulmate: 'Soulmate',
};

/** Current app version, sourced from the latest changelog entry. */
const APP_VERSION = RELEASE_NOTES[0]?.version ?? '0.0.0';

/** Number of rapid clicks required to unlock Developer Mode. */
const DEV_MODE_CLICK_THRESHOLD = 5;
/** Time window (ms) in which all clicks must occur. Resets after this. */
const DEV_MODE_CLICK_TIMEOUT = 3000;

const IMG_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
function resolveCharAvatarUrl(name?: string, avatarUrl?: string): string | null {
  if (avatarUrl && IMG_EXTS.test(new URL(avatarUrl, window.location.origin).pathname)) return avatarUrl;
  const clean = (name?.match(/\(([^)]+)\)/)?.[1] ?? name?.split(/\s/)[0] ?? '').toLowerCase().trim();
  return clean ? `/files/images/${clean}_pixel_portrait.png` : null;
}

/**
 * Compute the current time-of-day slot from the browser's local clock.
 * Mirrors the backend MoodEngine's `_get_time_slot()` so the badge
 * matches what the LLM actually receives.
 *
 * @returns One of 'morning', 'afternoon', 'evening', 'night', or 'late night'.
 */
function getCurrentTimeSlot(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  if (h >= 21) return 'night';
  return 'late night';
}

const IDLE_PHRASES = [
  'daydreaming...',
  'humming a song~',
  'reading something...',
  'thinking about you...',
  'gazing out the window...'
];

/** Maps 0-1 score to a warm→cool hue via CSS color-mix. */
function scoreColor(v: number): string {
  if (v >= 0.7) return 'var(--color-success)';
  if (v >= 0.4) return 'var(--color-accent)';
  return 'var(--color-text-tertiary)';
}

/** Affinity tiers — map 0–1 affinity value to a label and accent color. */
const AFFINITY_TIERS = [
  { min: 0.90, label: 'Soulmate', color: 'var(--color-accent)' },
  { min: 0.70, label: 'Devoted',  color: 'var(--color-success)' },
  { min: 0.50, label: 'Close',    color: 'var(--color-accent)' },
  { min: 0.30, label: 'Friendly', color: 'var(--color-text-secondary)' },
  { min: 0.00, label: 'Neutral',  color: 'var(--color-text-tertiary)' },
] as const;

function getAffinityTier(affinity: number) {
  return AFFINITY_TIERS.find(t => affinity >= t.min) ?? AFFINITY_TIERS[AFFINITY_TIERS.length - 1];
}

interface RelationshipData {
  affinity: number;
  mood: number;
  trust: number;
  interactions: number;
}

/**
 * Three tiny colored progress bars (affinity, mood, trust) showing the
 * current character's relationship health. Re-fetches whenever messageCount
 * changes (i.e. after each assistant reply).
 */
function RelationshipBar({ charId, messageCount }: { charId: number; messageCount: number }) {
  const [rel, setRel] = useState<RelationshipData | null>(null);
  /** Rolling window of the last 10 affinity readings (oldest → newest). */
  const affinityHistory = useRef<number[]>([]);

  useEffect(() => {
    api.getRelationship(charId)
      .then(data => {
        setRel(data);
        // Keep a rolling window of the last 10 readings
        affinityHistory.current = [...affinityHistory.current.slice(-9), data.affinity];
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId, messageCount]);

  if (!rel) return null;

  const tier = getAffinityTier(rel.affinity);
  const stats: Array<{ key: keyof RelationshipData; emoji: string; label: string }> = [
    { key: 'affinity', emoji: '♥', label: 'Affinity' },
    { key: 'mood',     emoji: '✦', label: 'Mood' },
    { key: 'trust',    emoji: '◈', label: 'Trust' },
  ];

  return (
    <div className="flex items-center gap-2 mt-0.5" style={{ flexWrap: 'nowrap' }}>
      {/* Tier badge */}
      <span
        title={`Affinity: ${Math.round(rel.affinity * 100)}%`}
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 99,
          border: `1px solid ${tier.color}`,
          color: tier.color,
          lineHeight: 1.6,
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}
      >
        {tier.label}
      </span>

      {stats.map(({ key, emoji, label }) => (
        <div key={key} className="flex items-center gap-1" title={`${label}: ${(rel[key] as number * 100).toFixed(0)}%`}>
          <span style={{ fontSize: '10px', color: scoreColor(rel[key] as number), lineHeight: 1 }}>
            {emoji}
          </span>
          <div style={{ width: 28, height: 4, borderRadius: 99, backgroundColor: 'var(--color-border)' }}>
            <div
              style={{
                width: `${Math.round((rel[key] as number) * 100)}%`,
                height: '100%',
                borderRadius: 99,
                backgroundColor: scoreColor(rel[key] as number),
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}

      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        {rel.interactions}×
      </span>

      {/* Affinity sparkline — inline at the right end of the bar row, shown once ≥ 3 readings */}
      {affinityHistory.current.length >= 3 && (() => {
        const h = affinityHistory.current;
        const W = 48, H = 14;
        const minV = Math.min(...h);
        const maxV = Math.max(...h);
        const range = maxV - minV || 0.01;
        const pts = h.map((v, i) => {
          const x = (i / (h.length - 1)) * W;
          const y = H - ((v - minV) / range) * (H - 2) - 1;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        const last = h[h.length - 1];
        const lastY = H - ((last - minV) / range) * (H - 2) - 1;
        return (
          <svg
            width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            style={{ flexShrink: 0, opacity: 0.75 }}
            aria-label="Affinity trend" role="img"
          >
            <polyline
              points={pts} fill="none"
              stroke="var(--color-accent)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
            <circle cx={W} cy={lastY} r="2" fill="var(--color-accent)" />
          </svg>
        );
      })()}
    </div>
  );
}

/**
 * Chat header with character name, online indicator, idle status, relationship
 * bars, and toolbar buttons (sessions, search, export, analytics, 3D viewer
 * toggle).
 *
 * Cycles through ambient idle phrases every 10 seconds to give the character
 * a sense of life even when no messages are being exchanged.
 *
 * Relationship stats (affinity, mood, trust) are fetched on mount and after
 * each assistant reply via the messageCount prop.
 *
 * @param character        - Active character object.
 * @param onOpenSessions   - Opens the session history drawer.
 * @param onSearchChange   - Propagates search query to parent.
 * @param onExport         - Exports conversation as plain text.
 * @param onExportMarkdown - Exports conversation as Markdown.
 * @param messageCount     - Total message count; triggers relationship/budget re-fetch.
 * @param sessionId        - Active session ID for the context budget bar.
 */

/**
 * Tiny badge shown in the StatusBar when an author's note is active for the
 * current session.  Polls GET /api/sessions/{id}/author-note on mount and
 * whenever sessionId changes.
 *
 * @param sessionId - Active session ID, or null/undefined when no session.
 */
function AuthorNoteBadge({ sessionId }: { sessionId?: number | null }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!sessionId) { setActive(false); return; }
    api.getAuthorNote(sessionId)
      .then(d => setActive(d.enabled && d.note.trim().length > 0))
      .catch(() => setActive(false));
  }, [sessionId]);
  if (!active) return null;
  return (
    <span
      className="flex-shrink-0"
      title="Author's Note is active for this session"
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 6,
        color: 'var(--color-accent)',
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
        letterSpacing: '0.04em',
        lineHeight: 1.5,
      }}
    >
      AN
    </span>
  );
}

export function StatusBar({
  character,
  onOpenSessions,
  onSearchChange,
  onExport,
  onExportMarkdown,
  onExportJson,
  messageCount = 0,
  sessionId,
}: {
  character: Character;
  onOpenSessions?: () => void;
  onSearchChange?: (query: string) => void;
  onExport?: () => void;
  onExportMarkdown?: () => void;
  onExportJson?: () => void;
  messageCount?: number;
  sessionId?: number | null;
}) {
  const { toggleModelPanel, modelPanelOpen, openOverlay, settingsTier, setSettingsTier, soundscapeOpen, toggleSoundscape, bondLevel, bondXp, bondXpToNext, bondTier, bondNextUnlock } = useAppStore();
  const [idlePhrase, setIdlePhrase] = useState(IDLE_PHRASES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Tier 2 HUD: ⋯ overflow popover ──────────────────────────────────────
  // Holds chat-threads, export, soundscape, model-browser, and the version
  // pill (dev-mode unlock). Cuts top toolbar from 9 icons → 4 visible (+ ⋯).
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const overflowDropRef = useRef<HTMLDivElement>(null);

  // ── Tier 2 HUD: search scope toggle (replaces separate Globe button) ────
  const [searchScope, setSearchScope] = useState<'thread' | 'global'>('thread');

  // ── Version click easter egg — 5 taps in 3 s → Developer Mode ──────────
  const versionClickCount = useRef(0);
  const versionClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Handles clicks on the version number string.
   * After 5 clicks within {@link DEV_MODE_CLICK_TIMEOUT} ms, promotes
   * settingsTier to 2 (Developer Mode). Resets the counter when the
   * timeout elapses without reaching the threshold.
   */
  const handleVersionClick = useCallback(() => {
    versionClickCount.current += 1;

    // Clear any existing timeout and start a fresh window
    if (versionClickTimer.current) clearTimeout(versionClickTimer.current);
    versionClickTimer.current = setTimeout(() => {
      versionClickCount.current = 0;
    }, DEV_MODE_CLICK_TIMEOUT);

    if (versionClickCount.current >= DEV_MODE_CLICK_THRESHOLD && settingsTier < 2) {
      setSettingsTier(2);
      versionClickCount.current = 0;
      if (versionClickTimer.current) clearTimeout(versionClickTimer.current);
    }
  }, [settingsTier, setSettingsTier]);

  // Close ⋯ overflow popover on outside click.
  useEffect(() => {
    if (!overflowOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        overflowDropRef.current?.contains(e.target as Node) ||
        overflowBtnRef.current?.contains(e.target as Node)
      ) return;
      setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [overflowOpen]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdlePhrase(prev => {
        const idx = IDLE_PHRASES.indexOf(prev);
        return IDLE_PHRASES[(idx + 1) % IDLE_PHRASES.length];
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
      onSearchChange?.('');
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    onSearchChange?.(q);
  };

  const btnStyle = (active = false) => ({
    color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
    backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
    boxShadow: active ? 'var(--shadow-glow)' : 'none',
  });

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
        backdropFilter: 'var(--blur-surface)',
        WebkitBackdropFilter: 'var(--blur-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        // Prevent content from touching the browser chrome or device notch.
        // env() gives safe-area-inset-top on PWA/mobile; 6px is the fallback
        // on regular desktop browsers where we still want a small gap.
        paddingTop: 'env(safe-area-inset-top, 6px)',
      }}
    >
      {/* Main row — min-h-14 so content can expand for relationship bars */}
      <div className="flex items-center gap-3 px-5 min-h-14 py-2">
        {/* Character avatar */}
        {(() => {
          const url = resolveCharAvatarUrl(character.name, character.avatar_url);
          return url ? (
            <img
              src={url}
              alt=""
              className="flex-shrink-0 rounded-full object-cover"
              style={{ width: 32, height: 32, boxShadow: '0 0 0 2px var(--color-accent-soft)' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="flex-shrink-0 rounded-full flex items-center justify-center"
              style={{
                width: 32, height: 32,
                background: 'var(--color-accent-gradient)',
                color: 'var(--color-accent-text)',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              {character.name?.[0] ?? '?'}
            </div>
          );
        })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="char-name-display truncate" title={character.name} style={{ color: 'var(--color-text-primary)', fontSize: '1rem' }}>
              {character.name}
            </span>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: 'var(--color-success)',
                boxShadow: '0 0 6px var(--color-success)'
              }}
            />
            {/* Feature A4: subtle time-of-day mood badge */}
            <span
              className="flex-shrink-0"
              title="Current time-of-day mood slot"
              style={{
                fontSize: 9,
                fontWeight: 500,
                padding: '1px 5px',
                borderRadius: 6,
                color: 'var(--color-text-tertiary)',
                backgroundColor: 'var(--color-border-subtle)',
                letterSpacing: '0.03em',
                lineHeight: 1.5,
              }}
            >
              {getCurrentTimeSlot()}
            </span>
            {/* Feature B4: Author's Note active badge */}
            <AuthorNoteBadge sessionId={sessionId} />
            {/* Feature T1-8: Daily interaction streak badge */}
            <StreakBadge charId={character.id} messageCount={messageCount} />
            {/* Bond tier badge */}
            {bondLevel > 0 && (
              <span
                className="flex-shrink-0"
                title={`Bond Level ${bondLevel} — ${TIER_BADGE_LABELS[bondTier] ?? bondTier}`}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 6,
                  color: TIER_BADGE_COLORS[bondTier] ?? 'var(--color-text-tertiary)',
                  backgroundColor: `color-mix(in srgb, ${TIER_BADGE_COLORS[bondTier] ?? 'var(--color-text-tertiary)'} 12%, transparent)`,
                  letterSpacing: '0.04em',
                  lineHeight: 1.5,
                }}
              >
                Lv{bondLevel}
              </span>
            )}
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {idlePhrase}
          </p>
          <RelationshipBar charId={character.id} messageCount={messageCount} />
          {/* Bond XP progress bar — compact inline version */}
          <BondProgressBar
            bondLevel={bondLevel}
            bondXp={bondXp}
            xpToNext={bondXpToNext}
            tier={bondTier}
            nextUnlock={bondNextUnlock}
          />
        </div>

        {/* Tier 2 HUD — visible right cluster: Search · ContextBudget · Settings · 3D · ⋯ */}
        <button onClick={toggleSearch} className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle(searchOpen)} title="Search messages (Thread / Global toggle inside)">
          <Search size={18} />
        </button>
        <ContextBudgetPill
          sessionId={sessionId}
          messageCount={messageCount}
          autoCompactThreshold={85}
        />
        <button
          onClick={() => openOverlay('settings')}
          title="Settings"
          aria-label="Open settings"
          className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle()}
        >
          <Settings size={18} />
        </button>
        <button
          onClick={toggleModelPanel}
          title="Open 3D character viewer"
          aria-label="Open 3D character viewer"
          className="rounded-lg transition-all duration-200"
          style={{
            ...btnStyle(modelPanelOpen),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            padding: '4px 8px',
            border: modelPanelOpen ? undefined : '1px solid var(--color-accent-soft)',
          }}
        >
          <Eye size={16} />
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-accent)', lineHeight: 1 }}>{modelPanelOpen ? 'Close' : '3D'}</span>
        </button>

        {/* ⋯ overflow: chat-threads · export · soundscape · model-browser · version */}
        <div style={{ position: 'relative' }}>
          <button
            ref={overflowBtnRef}
            onClick={() => setOverflowOpen(o => !o)}
            className="p-2 rounded-lg transition-all duration-200"
            style={btnStyle(overflowOpen)}
            title="More tools"
            aria-label="More tools menu"
            aria-haspopup="true"
            aria-expanded={overflowOpen}
          >
            <MoreHorizontal size={18} />
          </button>

          {overflowOpen && (
            <div
              ref={overflowDropRef}
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                minWidth: 220,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              {onOpenSessions && (
                <button
                  role="menuitem"
                  onClick={() => { setOverflowOpen(false); onOpenSessions(); }}
                  className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <MessageSquare size={14} /> Chat threads
                </button>
              )}
              {onExport && (
                <button
                  role="menuitem"
                  onClick={() => { setOverflowOpen(false); onExport(); }}
                  className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <Download size={14} /> Export as Text (.txt)
                </button>
              )}
              {onExportMarkdown && (
                <button
                  role="menuitem"
                  onClick={() => { setOverflowOpen(false); onExportMarkdown(); }}
                  className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <Download size={14} /> Export as Markdown (.md)
                </button>
              )}
              {onExportJson && (
                <button
                  role="menuitem"
                  onClick={() => { setOverflowOpen(false); onExportJson(); }}
                  className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <Download size={14} /> Export as JSON (.json)
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => { setOverflowOpen(false); toggleSoundscape(); }}
                className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                style={{ color: soundscapeOpen ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <Music size={14} /> Ambient sounds {soundscapeOpen ? '(on)' : ''}
              </button>
              <button
                role="menuitem"
                onClick={() => { setOverflowOpen(false); openOverlay('modelbrowser'); }}
                className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <Box size={14} /> Models
              </button>
              {/* Version footer — 5 rapid clicks still unlock Developer Mode */}
              <div
                style={{
                  borderTop: '1px solid var(--color-border-subtle)',
                  padding: '6px 16px',
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                  letterSpacing: '0.02em',
                  cursor: 'default',
                  userSelect: 'none',
                }}
                onClick={handleVersionClick}
                title={settingsTier >= 2 ? 'Developer Mode active' : 'v' + APP_VERSION}
              >
                v{APP_VERSION}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search bar — slides down when open. Scope toggle replaces the
          old standalone Globe icon: switching to "Global" hands the query
          off to the existing global-search overlay (Alt+F equivalent). */}
      {searchOpen && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
            <Search size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder={searchScope === 'thread' ? 'Search messages in this thread...' : 'Search all chats...'}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => handleSearchChange('')} style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={13} />
              </button>
            )}
            {/* Scope segmented toggle */}
            <div
              role="tablist"
              aria-label="Search scope"
              style={{
                display: 'flex',
                gap: 0,
                marginLeft: 8,
                padding: 2,
                borderRadius: 6,
                backgroundColor: 'var(--color-border-subtle)',
                flexShrink: 0,
              }}
            >
              <button
                role="tab"
                aria-selected={searchScope === 'thread'}
                onClick={() => setSearchScope('thread')}
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: searchScope === 'thread' ? 'var(--color-surface)' : 'transparent',
                  color: searchScope === 'thread' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
                title="Search only messages in this conversation"
              >
                Thread
              </button>
              <button
                role="tab"
                aria-selected={searchScope === 'global'}
                onClick={() => {
                  setSearchScope('global');
                  setSearchOpen(false);
                  onSearchChange?.('');
                  openOverlay('search');
                  // Reset back to thread for the next time the bar opens.
                  setTimeout(() => setSearchScope('thread'), 0);
                }}
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: searchScope === 'global' ? 'var(--color-surface)' : 'transparent',
                  color: searchScope === 'global' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
                title="Search across all characters and sessions (Alt+F)"
              >
                Global
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
