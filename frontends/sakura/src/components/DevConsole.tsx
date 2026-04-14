import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Terminal, X, Trash2, Network, Radio, Gauge, Search, FileJson, Heart } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import { PromptInspector } from './PromptInspector';
import { RawConfigEditor } from './RawConfigEditor';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A captured HTTP request entry. */
interface RequestEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  duration: number;
  size: number;
  error?: string;
}

/** A custom event log entry. */
interface EventEntry {
  id: string;
  timestamp: number;
  type: 'sse' | 'postMessage' | 'websocket' | 'emotion' | 'animation' | 'info';
  detail: string;
}

interface DevLogState {
  requests: RequestEntry[];
  events: EventEntry[];
  /** Whether the fetch interceptor has been installed. */
  interceptorInstalled: boolean;

  addRequest: (entry: Omit<RequestEntry, 'id'>) => void;
  addEvent: (type: EventEntry['type'], detail: string) => void;
  clearRequests: () => void;
  clearEvents: () => void;
  setInterceptorInstalled: () => void;
}

// ─── Zustand Store ──────────────────────────────────────────────────────────

/**
 * Dev log store — holds request and event log entries for the DevConsole.
 * Not persisted; resets on page reload.
 */
export const useDevLogStore = create<DevLogState>((set) => ({
  requests: [],
  events: [],
  interceptorInstalled: false,

  addRequest: (entry) =>
    set((s) => ({
      requests: [...s.requests.slice(-499), { ...entry, id: crypto.randomUUID() }],
    })),

  addEvent: (type, detail) =>
    set((s) => ({
      events: [
        ...s.events.slice(-499),
        { id: crypto.randomUUID(), timestamp: Date.now(), type, detail },
      ],
    })),

  clearRequests: () => set({ requests: [] }),
  clearEvents: () => set({ events: [] }),
  setInterceptorInstalled: () => set({ interceptorInstalled: true }),
}));

// ─── Fetch Interceptor ─────────────────────────────────────────────────────

/**
 * Monkey-patches window.fetch to capture request/response metadata
 * into the dev log store. Only installs once (guarded by store flag).
 */
function installFetchInterceptor(): void {
  if (useDevLogStore.getState().interceptorInstalled) return;
  useDevLogStore.getState().setInterceptorInstalled();

  const originalFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const start = performance.now();
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const method = (args[1]?.method ?? 'GET').toUpperCase();

    try {
      const response = await originalFetch(...args);
      const duration = Math.round(performance.now() - start);
      useDevLogStore.getState().addRequest({
        timestamp: Date.now(),
        method,
        url,
        status: response.status,
        duration,
        size: parseInt(response.headers.get('content-length') ?? '0', 10),
      });
      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      useDevLogStore.getState().addRequest({
        timestamp: Date.now(),
        method,
        url,
        status: 0,
        duration,
        size: 0,
        error: String(err),
      });
      throw err;
    }
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a timestamp as HH:MM:SS.mmm for log display.
 *
 * @param ts - Unix timestamp in milliseconds
 * @returns Formatted time string
 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/**
 * Return a CSS color for the HTTP status code.
 *
 * @param status - HTTP status code (0 for network errors)
 * @returns CSS color string
 */
function statusColor(status: number): string {
  if (status === 0) return '#ef4444';
  if (status >= 500) return '#ef4444';
  if (status >= 400) return '#f59e0b';
  return '#22c55e';
}

/** Badge colors by event type. */
const EVENT_BADGE_COLORS: Record<EventEntry['type'], string> = {
  sse: '#8b5cf6',
  postMessage: '#3b82f6',
  websocket: '#06b6d4',
  emotion: '#ec4899',
  animation: '#f97316',
  info: '#6b7280',
};

type Tab = 'requests' | 'events' | 'performance' | 'prompt' | 'config' | 'bond';

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Collapsible bottom panel (like browser DevTools) with 3 tabs:
 * Request Log, Event Log, and Performance. Only mounts when devMode is enabled.
 *
 * @example
 * // In App.tsx:
 * const { devMode } = useAppStore();
 * {devMode && <DevConsole />}
 */
export function DevConsole() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const requestListRef = useRef<HTMLDivElement>(null);
  const eventListRef = useRef<HTMLDivElement>(null);

  const requests = useDevLogStore((s) => s.requests);
  const events = useDevLogStore((s) => s.events);
  const clearRequests = useDevLogStore((s) => s.clearRequests);
  const clearEvents = useDevLogStore((s) => s.clearEvents);

  // Install the fetch interceptor once on mount
  useEffect(() => {
    installFetchInterceptor();
  }, []);

  // Auto-scroll request and event lists to bottom
  useEffect(() => {
    if (open && activeTab === 'requests' && requestListRef.current) {
      requestListRef.current.scrollTop = requestListRef.current.scrollHeight;
    }
  }, [requests.length, open, activeTab]);

  useEffect(() => {
    if (open && activeTab === 'events' && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [events.length, open, activeTab]);

  // Toggle button when closed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Open DevConsole"
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          zIndex: 9999,
          width: 32,
          height: 32,
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Terminal size={16} />
      </button>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'requests', label: 'Requests', icon: <Network size={13} /> },
    { key: 'events', label: 'Events', icon: <Radio size={13} /> },
    { key: 'performance', label: 'Performance', icon: <Gauge size={13} /> },
    { key: 'prompt', label: 'Prompt', icon: <Search size={13} /> },
    { key: 'config', label: 'Config', icon: <FileJson size={13} /> },
    { key: 'bond', label: 'Bond', icon: <Heart size={13} /> },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 250,
        zIndex: 9998,
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 12,
        color: 'var(--color-text)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border)',
          padding: '0 4px',
          height: 32,
          flexShrink: 0,
          gap: 2,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: '4px 4px 0 0',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-text-secondary)',
              backgroundColor: activeTab === tab.key ? 'var(--color-background)' : 'transparent',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'requests' && requests.length > 0 && (
              <span style={{ opacity: 0.5 }}>({requests.length})</span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Clear button */}
        {(activeTab === 'requests' || activeTab === 'events') && (
          <button
            onClick={activeTab === 'requests' ? clearRequests : clearEvents}
            title="Clear log"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 8px',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              backgroundColor: 'transparent',
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}

        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          title="Close DevConsole"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '3px 6px',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            backgroundColor: 'transparent',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'requests' && <RequestsTab listRef={requestListRef} />}
        {activeTab === 'events' && <EventsTab listRef={eventListRef} />}
        {activeTab === 'performance' && <PerformanceTab />}
        {activeTab === 'prompt' && <PromptInspector sessionId={useChatStore.getState().sessionId} />}
        {activeTab === 'config' && <RawConfigEditor />}
        {activeTab === 'bond' && <BondTab />}
      </div>
    </div>
  );
}

// ─── Request Log Tab ────────────────────────────────────────────────────────

/**
 * Scrollable list of captured fetch requests, newest at bottom.
 * Color-coded by HTTP status: green (2xx), amber (4xx), red (5xx/error).
 */
function RequestsTab({ listRef }: { listRef: React.RefObject<HTMLDivElement | null> }) {
  const requests = useDevLogStore((s) => s.requests);

  if (requests.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
        No requests captured yet. API calls will appear here.
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ height: '100%', overflowY: 'auto', padding: '4px 8px' }}>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '90px 50px 1fr 50px 60px 60px',
          gap: 8,
          padding: '2px 4px',
          color: 'var(--color-text-secondary)',
          fontWeight: 600,
          fontSize: 10,
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <span>Time</span>
        <span>Method</span>
        <span>URL</span>
        <span>Status</span>
        <span>Duration</span>
        <span>Size</span>
      </div>

      {requests.map((req) => {
        // Shorten URLs: strip origin if same-origin
        const shortUrl = req.url.startsWith('/') ? req.url : (() => {
          try { return new URL(req.url).pathname + new URL(req.url).search; } catch { return req.url; }
        })();

        return (
          <div
            key={req.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 50px 1fr 50px 60px 60px',
              gap: 8,
              padding: '2px 4px',
              borderBottom: '1px solid var(--color-border)',
              opacity: req.error ? 0.8 : 1,
            }}
          >
            <span style={{ color: 'var(--color-text-secondary)' }}>{formatTime(req.timestamp)}</span>
            <span style={{ fontWeight: 600 }}>{req.method}</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={req.url}
            >
              {shortUrl}
            </span>
            <span style={{ color: statusColor(req.status), fontWeight: 600 }}>
              {req.status === 0 ? 'ERR' : req.status}
            </span>
            <span style={{ color: req.duration > 1000 ? '#f59e0b' : 'var(--color-text-secondary)' }}>
              {req.duration}ms
            </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {req.size > 0 ? `${(req.size / 1024).toFixed(1)}K` : '--'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Log Tab ──────────────────────────────────────────────────────────

/**
 * Scrollable list of custom events (SSE, WebSocket, emotion, animation).
 * Events are logged by other components via useDevLogStore.getState().addEvent().
 */
function EventsTab({ listRef }: { listRef: React.RefObject<HTMLDivElement | null> }) {
  const events = useDevLogStore((s) => s.events);

  if (events.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
        No events logged yet. Events from SSE, WebSocket, emotions, and animations will appear here.
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ height: '100%', overflowY: 'auto', padding: '4px 8px' }}>
      {events.map((evt) => (
        <div
          key={evt.id}
          style={{
            display: 'flex',
            gap: 8,
            padding: '2px 4px',
            borderBottom: '1px solid var(--color-border)',
            alignItems: 'baseline',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0, width: 90 }}>
            {formatTime(evt.timestamp)}
          </span>
          <span
            style={{
              flexShrink: 0,
              padding: '0 6px',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#fff',
              backgroundColor: EVENT_BADGE_COLORS[evt.type] ?? '#6b7280',
            }}
          >
            {evt.type}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {evt.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Performance Tab ────────────────────────────────────────────────────────

/**
 * Displays real-time performance metrics:
 * - Viewport FPS (from useAppStore)
 * - Chat message count in current session
 * - Memory usage (Chrome only, via performance.memory)
 */
function PerformanceTab() {
  const viewportFps = useAppStore((s) => s.viewportFps);
  const messages = useChatStore((s) => s.messages);
  const [memoryInfo, setMemoryInfo] = useState<{ used: number; total: number } | null>(null);

  // Poll performance.memory (Chrome only)
  useEffect(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    };
    if (!perf.memory) return;

    const update = () => {
      if (perf.memory) {
        setMemoryInfo({
          used: perf.memory.usedJSHeapSize,
          total: perf.memory.jsHeapSizeLimit,
        });
      }
    };
    update();
    const iv = setInterval(update, 2000);
    return () => clearInterval(iv);
  }, []);

  const statStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: '1px solid var(--color-border)',
  };
  const labelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' };
  const valueStyle: React.CSSProperties = { fontWeight: 600 };

  /**
   * Color the FPS value: green >= 50, amber >= 30, red < 30.
   */
  const fpsColor = (fps: number | null): string => {
    if (fps === null) return 'var(--color-text-secondary)';
    if (fps >= 50) return '#22c55e';
    if (fps >= 30) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div style={{ padding: '4px 0', overflowY: 'auto', height: '100%' }}>
      <div style={statStyle}>
        <span style={labelStyle}>Viewport FPS</span>
        <span style={{ ...valueStyle, color: fpsColor(viewportFps) }}>
          {viewportFps !== null ? `${viewportFps} fps` : 'N/A'}
        </span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>Messages (session)</span>
        <span style={valueStyle}>{messages.length}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>Token counter</span>
        <span style={valueStyle}>heuristic (words * 1.3)</span>
      </div>
      {memoryInfo && (
        <div style={statStyle}>
          <span style={labelStyle}>JS Heap</span>
          <span style={valueStyle}>
            {(memoryInfo.used / 1024 / 1024).toFixed(1)} MB / {(memoryInfo.total / 1024 / 1024).toFixed(0)} MB
          </span>
        </div>
      )}
      {!memoryInfo && (
        <div style={statStyle}>
          <span style={labelStyle}>JS Heap</span>
          <span style={{ ...valueStyle, color: 'var(--color-text-secondary)' }}>
            Not available (Chrome only)
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Bond Analytics Tab ────────────────────────────────────────────────────

/** Analytics payload returned by GET /api/characters/:id/bond/analytics */
interface BondAnalytics {
  ok: boolean;
  total_xp_earned: number;
  days_active: number;
  avg_xp_per_day: number;
  est_days_to_soulmate: number | null;
  source_breakdown: Record<string, number>;
}

/** A single XP history event from GET /api/characters/:id/bond/xp-history */
interface XpEvent {
  ts: string;
  xp: number;
  source: string;
  meta: Record<string, unknown>;
}

/**
 * Renders a single horizontal bar representing a source-breakdown percentage.
 *
 * Uses block-character "▓" and "░" to create an ASCII progress bar, keeping
 * the display theme-safe and monospace-friendly.
 *
 * @param label   - Source label (e.g. "messages")
 * @param ratio   - 0–1 fraction of total XP from this source
 */
function SourceBar({ label, ratio }: { label: string; ratio: number }) {
  const BAR_WIDTH = 20;
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  const pct = `${Math.round(ratio * 100)}%`;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 36px',
        gap: 8,
        padding: '2px 4px',
        alignItems: 'center',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
        {label.replace(/_/g, ' ')}
      </span>
      <span style={{ color: 'var(--color-accent)', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>
        {bar}
      </span>
      <span style={{ color: 'var(--color-text)', fontWeight: 600, textAlign: 'right' }}>
        {pct}
      </span>
    </div>
  );
}

/**
 * Bond analytics tab for DevConsole.
 *
 * Displays:
 * - Character selector (uses app store character list)
 * - Summary row: level, total XP, days active, avg XP/day, est. days to soulmate
 * - Source breakdown as ASCII bars (▓░)
 * - Last 20 XP history events
 */
function BondTab() {
  const characters = useAppStore(s => s.characters);
  const activeCharacter = useAppStore(s => s.activeCharacter);
  const bondLevel = useAppStore(s => s.bondLevel);
  const bondXp = useAppStore(s => s.bondXp);
  const bondTier = useAppStore(s => s.bondTier);

  const [selectedCharId, setSelectedCharId] = useState<number>(activeCharacter?.id ?? 0);
  const [analytics, setAnalytics] = useState<BondAnalytics | null>(null);
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selector to active character when it changes
  useEffect(() => {
    if (activeCharacter?.id) setSelectedCharId(activeCharacter.id);
  }, [activeCharacter?.id]);

  // Fetch analytics + recent events on character change
  useEffect(() => {
    if (!selectedCharId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getBondAnalytics(selectedCharId),
      api.getBondXpHistoryPaged(selectedCharId, 20, 0),
    ])
      .then(([analyticsRes, historyRes]) => {
        setAnalytics(analyticsRes);
        setEvents(historyRes.events ?? []);
      })
      .catch((err: unknown) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [selectedCharId]);

  const statStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 12px',
    borderBottom: '1px solid var(--color-border)',
  };
  const labelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' };
  const valueStyle: React.CSSProperties = { fontWeight: 600 };

  // Compute sorted source entries for bar chart
  const sourceEntries = analytics
    ? Object.entries(analytics.source_breakdown).sort(([, a], [, b]) => b - a)
    : [];
  const totalSourceXp = sourceEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '4px 0' }}>
      {/* Character selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 6px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ ...labelStyle }}>Character</span>
        <select
          value={selectedCharId}
          onChange={e => setSelectedCharId(Number(e.target.value))}
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 11,
          }}
        >
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {loading && (
          <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Loading…</span>
        )}
        {error && (
          <span style={{ color: '#ef4444' }}>Error: {error}</span>
        )}
      </div>

      {/* Live bond state from store (selected char only when it's active) */}
      {selectedCharId === activeCharacter?.id && (
        <>
          <div style={statStyle}>
            <span style={labelStyle}>Level (live)</span>
            <span style={valueStyle}>{bondLevel} — {bondTier}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>XP (live)</span>
            <span style={valueStyle}>{bondXp}</span>
          </div>
        </>
      )}

      {/* Analytics summary */}
      {analytics && (
        <>
          <div style={statStyle}>
            <span style={labelStyle}>Total XP earned</span>
            <span style={valueStyle}>{analytics.total_xp_earned.toLocaleString()}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>Days active</span>
            <span style={valueStyle}>{analytics.days_active}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>Avg XP / day</span>
            <span style={valueStyle}>{analytics.avg_xp_per_day.toFixed(1)}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>Est. days to soulmate</span>
            <span style={valueStyle}>
              {analytics.est_days_to_soulmate !== null
                ? analytics.est_days_to_soulmate === 0
                  ? 'Reached!'
                  : `~${analytics.est_days_to_soulmate}d`
                : 'N/A'}
            </span>
          </div>

          {/* Source breakdown */}
          {sourceEntries.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ padding: '3px 12px 2px', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                XP Sources
              </div>
              {sourceEntries.map(([label, xp]) => (
                <SourceBar
                  key={label}
                  label={label}
                  ratio={totalSourceXp > 0 ? xp / totalSourceXp : 0}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Recent XP events */}
      {events.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ padding: '3px 12px 2px', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Recent Events (last 20)
          </div>
          {events.map((evt, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 40px 1fr',
                gap: 8,
                padding: '2px 4px 2px 12px',
                borderBottom: '1px solid var(--color-border)',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {new Date(evt.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                +{evt.xp}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {evt.source.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && !analytics && !error && (
        <div style={{ padding: 16, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          Select a character to view bond analytics.
        </div>
      )}
    </div>
  );
}
