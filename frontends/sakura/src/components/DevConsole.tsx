import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Terminal, X, Trash2, Network, Radio, Gauge, Search, FileJson } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
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

type Tab = 'requests' | 'events' | 'performance' | 'prompt' | 'config';

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
