import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Wifi, WifiOff, Monitor, Cpu } from 'lucide-react';
import type { LinkDevice, LinkRoutingDecision } from '../lib/types';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   LinkStatusPanel — LM Studio Link device status & routing dashboard
   ═══════════════════════════════════════════════════════════════════════ */

/** Shared card background style matching SettingsView's cardStyle. */
const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg, 12px)',
  border: '1px solid var(--color-border-subtle)',
  padding: '12px 16px',
};

/**
 * Latency color coding for device ping times.
 *
 * @param ms - Round-trip latency in milliseconds.
 * @returns CSS color string: green (<50ms), yellow (<150ms), orange (<500ms), red (>500ms).
 */
function latencyColor(ms: number): string {
  if (ms < 0) return 'var(--color-text-tertiary)';
  if (ms < 50) return '#39c96e';
  if (ms < 150) return '#f59e0b';
  if (ms < 500) return '#f97316';
  return '#ef4444';
}

/**
 * Online/offline status indicator dot.
 *
 * @param online - Whether the device is reachable.
 * @returns Colored circle: green (online), gray (offline).
 */
function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: online ? '#39c96e' : '#6b7280',
        flexShrink: 0,
      }}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

interface LinkStatusPanelProps {
  /** Whether Link auto-routing is enabled in config. */
  linkEnabled: boolean;
  /** Whether auto-routing is enabled. */
  autoRoute: boolean;
  /** Callback to toggle Link enabled. */
  onToggleLink: (enabled: boolean) => void;
  /** Callback to toggle auto-routing. */
  onToggleAutoRoute: (enabled: boolean) => void;
}

/**
 * Collapsible panel showing LM Studio Link device mesh status.
 *
 * Renders in the BrainTab between Connection and Model Intelligence sections.
 * Shows discovered devices, their online status, loaded models, and latency.
 * Includes a routing preview showing where chat/vision/tts requests would go.
 *
 * @example
 * <LinkStatusPanel
 *   linkEnabled={cfg('llm.link.enabled', false)}
 *   autoRoute={cfg('llm.link.auto_route', true)}
 *   onToggleLink={(v) => save('llm.link.enabled', v)}
 *   onToggleAutoRoute={(v) => save('llm.link.auto_route', v)}
 * />
 */
export function LinkStatusPanel({
  linkEnabled,
  autoRoute,
  onToggleLink,
  onToggleAutoRoute,
}: LinkStatusPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [devices, setDevices] = useState<LinkDevice[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [routePreview, setRoutePreview] = useState<LinkRoutingDecision | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  /**
   * Fetch device list from the backend.
   * Updates device state, online count, and last-refresh timestamp.
   */
  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getLinkDevices();
      setDevices(result.devices ?? []);
      setOnlineCount(result.online_count ?? 0);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      /* Link not available — silently degrade */
    } finally {
      setLoading(false);
    }
  }, []);

  /** Force health check on all devices (re-pings endpoints). */
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.refreshLinkDevices();
      setDevices(result.devices ?? []);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  /** Fetch routing preview for the "chat" capability. */
  const fetchRoute = useCallback(async () => {
    try {
      const result = await api.getLinkRoute('chat');
      setRoutePreview(result.decision ?? null);
    } catch { /* ignore */ }
  }, []);

  // Auto-fetch on expand
  useEffect(() => {
    if (expanded && linkEnabled) {
      fetchDevices();
      fetchRoute();
    }
  }, [expanded, linkEnabled, fetchDevices, fetchRoute]);

  const headerLabel = linkEnabled
    ? `Link Devices (${onlineCount} online)`
    : 'Link Devices (disabled)';

  return (
    <section className="mb-6">
      {/* ── Collapsible header ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
        style={{ color: 'var(--color-text)' }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wifi size={14} style={{ color: linkEnabled ? '#39c96e' : 'var(--color-text-tertiary)' }} />
        <span className="text-sm font-semibold">{headerLabel}</span>
      </button>

      {expanded && (
        <div style={cardStyle}>
          {/* ── Enable / Auto-route toggles ── */}
          <div className="flex items-center gap-4 mb-3 pb-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={linkEnabled}
                onChange={(e) => onToggleLink(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Enable Link
            </label>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={autoRoute}
                onChange={(e) => onToggleAutoRoute(e.target.checked)}
                className="accent-[var(--color-accent)]"
                disabled={!linkEnabled}
              />
              Auto-Route
            </label>
            <div className="flex-1" />
            <button
              onClick={refreshAll}
              disabled={loading || !linkEnabled}
              className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-secondary)',
                opacity: loading ? 0.5 : 1,
              }}
              title="Refresh all devices"
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {!linkEnabled ? (
            <p className="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Enable Link to discover LM Studio instances on your network.
            </p>
          ) : devices.length === 0 ? (
            <p className="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {loading ? 'Scanning network...' : 'No devices found. Make sure LM Studio Link is enabled on your machines.'}
            </p>
          ) : (
            <>
              {/* ── Device list ── */}
              <div className="space-y-2 mb-3">
                {devices.map((d) => (
                  <div
                    key={d.device_id}
                    className="flex items-center gap-2 text-xs py-1.5 px-2 rounded"
                    style={{
                      background: d.online ? 'rgba(57,201,110,0.06)' : 'rgba(107,114,128,0.06)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <StatusDot online={d.online} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {d.is_local ? <Monitor size={10} /> : <Cpu size={10} />}
                        <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {d.display_name || d.device_id}
                        </span>
                        {d.is_local && (
                          <span className="text-[9px] px-1 py-0.5 rounded"
                            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)', lineHeight: 1 }}>
                            LOCAL
                          </span>
                        )}
                      </div>
                      {d.models_loaded.length > 0 && (
                        <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          {d.models_loaded.join(', ')}
                        </div>
                      )}
                    </div>
                    {/* Latency badge */}
                    {d.online && d.latency_ms >= 0 && (
                      <span className="text-[10px] font-mono tabular-nums" style={{ color: latencyColor(d.latency_ms) }}>
                        {d.latency_ms}ms
                      </span>
                    )}
                    {!d.online && (
                      <WifiOff size={10} style={{ color: '#6b7280' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* ── Routing preview ── */}
              {routePreview && (
                <div className="text-xs pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                  <span className="font-medium">Chat routes to: </span>
                  <span style={{ color: 'var(--color-text)' }}>
                    {routePreview.display_name ?? 'local fallback'}
                  </span>
                  {routePreview.model && (
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({routePreview.model})
                    </span>
                  )}
                </div>
              )}

              {lastRefresh && (
                <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Last updated: {lastRefresh}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
