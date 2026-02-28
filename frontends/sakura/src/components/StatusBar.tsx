import { useState, useEffect, useRef } from 'react';
import { Eye, MessageSquare, Search, Download, X, BarChart2, Globe } from 'lucide-react';
import type { Character } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

const IMG_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
function resolveCharAvatarUrl(name?: string, avatarUrl?: string): string | null {
  if (avatarUrl && IMG_EXTS.test(new URL(avatarUrl, window.location.origin).pathname)) return avatarUrl;
  const clean = (name?.match(/\(([^)]+)\)/)?.[1] ?? name?.split(/\s/)[0] ?? '').toLowerCase().trim();
  return clean ? `/files/images/${clean}_pixel_portrait.png` : null;
}

// ── Context budget bar ────────────────────────────────────────────────────────

interface ContextBudget {
  used: number;
  max: number;
  percent: number;
}

/**
 * Resolves the traffic-light color for the context budget bar.
 *
 * @param pct - Usage percentage 0–100.
 * @returns CSS color string.
 */
function budgetColor(pct: number): string {
  if (pct > 80) return 'var(--color-error, #f44)';
  if (pct > 50) return '#f59e0b'; // amber
  return 'var(--color-success)';
}

/**
 * Thin 3 px bar that visualises how full the context window is.
 * Fetches `/api/context-budget/{sessionId}` on mount and whenever
 * `sessionId` or `messageCount` changes.
 *
 * @param sessionId   - Active chat session ID. Bar is hidden when null.
 * @param messageCount - Increments after each reply, triggering a re-fetch.
 */
function ContextBudgetBar({
  sessionId,
  messageCount,
}: {
  sessionId: number | null | undefined;
  messageCount: number;
}) {
  const [budget, setBudget] = useState<ContextBudget | null>(null);

  useEffect(() => {
    if (sessionId == null) return;
    fetch(`/api/context-budget/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        // Endpoint returns total_tokens / context_limit / usage_pct
        const used = data.total_tokens ?? 0;
        const max  = data.context_limit ?? 0;
        const pct  = data.usage_pct != null
          ? Math.round(data.usage_pct)
          : (max > 0 ? Math.round((used / max) * 100) : 0);
        setBudget({ used, max, percent: pct });
      })
      .catch(() => {});
  // messageCount is intentionally included so we re-fetch after each reply.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messageCount]);

  if (!budget || budget.max === 0) return null;

  return (
    <div
      style={{ width: '100%', height: 3, backgroundColor: 'var(--color-border)', overflow: 'hidden' }}
      title={`Context: ${budget.percent}% full — ${budget.used}/${budget.max} tokens`}
    >
      <div
        style={{
          width: `${Math.min(budget.percent, 100)}%`,
          height: '100%',
          backgroundColor: budgetColor(budget.percent),
          transition: 'width 0.6s ease, background-color 0.4s ease',
        }}
      />
    </div>
  );
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
 * bars, context budget bar, and toolbar buttons (sessions, search, export,
 * analytics, 3D viewer toggle).
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
export function StatusBar({
  character,
  onOpenSessions,
  onSearchChange,
  onExport,
  onExportMarkdown,
  messageCount = 0,
  sessionId,
}: {
  character: Character;
  onOpenSessions?: () => void;
  onSearchChange?: (query: string) => void;
  onExport?: () => void;
  onExportMarkdown?: () => void;
  messageCount?: number;
  sessionId?: number | null;
}) {
  const { toggleModelPanel, modelPanelOpen, openOverlay } = useAppStore();
  const [idlePhrase, setIdlePhrase] = useState(IDLE_PHRASES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Feature 5: Export format dropdown ────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const exportDropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        exportDropRef.current?.contains(e.target as Node) ||
        exportBtnRef.current?.contains(e.target as Node)
      ) return;
      setExportOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [exportOpen]);

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
            <span className="char-name-display truncate" style={{ color: 'var(--color-text-primary)', fontSize: '1rem' }}>
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
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {idlePhrase}
          </p>
          <RelationshipBar charId={character.id} messageCount={messageCount} />
        </div>

        {onOpenSessions && (
          <button onClick={onOpenSessions} className="p-2 rounded-lg transition-all duration-200"
            style={btnStyle()} title="Chat threads">
            <MessageSquare size={18} />
          </button>
        )}
        <button onClick={toggleSearch} className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle(searchOpen)} title="Search messages in this thread">
          <Search size={18} />
        </button>
        <button
          onClick={() => openOverlay('search')}
          className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle()}
          title="Global search — all characters &amp; sessions (Alt+F)"
          aria-label="Open global message search"
        >
          <Globe size={18} />
        </button>

        {/* Feature 5: Export button with format dropdown */}
        {(onExport || onExportMarkdown) && (
          <div style={{ position: 'relative' }}>
            <button
              ref={exportBtnRef}
              onClick={() => setExportOpen(o => !o)}
              className="p-2 rounded-lg transition-all duration-200"
              style={btnStyle(exportOpen)}
              title="Export conversation"
              aria-label="Export conversation"
              aria-haspopup="true"
              aria-expanded={exportOpen}
            >
              <Download size={18} />
            </button>

            {exportOpen && (
              <div
                ref={exportDropRef}
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 190,
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                {onExport && (
                  <button
                    role="menuitem"
                    onClick={() => { setExportOpen(false); onExport(); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                  >
                    Export as Text (.txt)
                  </button>
                )}
                {onExportMarkdown && (
                  <button
                    role="menuitem"
                    onClick={() => { setExportOpen(false); onExportMarkdown(); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                  >
                    Export as Markdown (.md)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => openOverlay('analytics')}
          className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle()}
          title="Conversation analytics (Alt+A)"
          aria-label="Open conversation analytics"
        >
          <BarChart2 size={18} />
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
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-accent)', lineHeight: 1 }}>3D</span>
        </button>
      </div>

      {/* Feature 2: Context budget bar — 3 px traffic-light strip */}
      <ContextBudgetBar sessionId={sessionId} messageCount={messageCount} />

      {/* Search bar — slides down when open */}
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
              placeholder="Search messages..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => handleSearchChange('')} style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
