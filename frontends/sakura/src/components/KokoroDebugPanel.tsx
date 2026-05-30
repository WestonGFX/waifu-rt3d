/**
 * Kokoro Debug Panel — dev-only HUD for inspecting the character's psychology.
 *
 * Renders a tabbed inspector with four tabs:
 *   - Mood: Tier A/B/F mind dials from the last chat payload + absolute
 *     dial values, embodiment fields, and parse-quality badge.
 *   - Memory: Top retrieved memories for a user-supplied query via
 *     GET /api/kokoro/debug/state, showing dist/tier/salience/status.
 *   - Relationship: Natural-language relationship block + shared-rituals
 *     block injected into the LLM system prompt.
 *   - Safety: Rolling parse-ok rate and boundary-event count.
 *
 * The panel fetches its own debug state (mind dials, relationship text,
 * memory hits) by subscribing to `charId` / `sessionId` from `chatStore`
 * and calling `api.getKokoroDebugState`.  The three props from App.tsx
 * (`payload`, `dialValues`, `qa`) are preserved unchanged so the existing
 * render site compiles without modification.
 *
 * Shown when `?debug=kokoro` is in the URL or `dev_mode` is enabled.
 * Does NOT poll — re-fetches once after each new Kokoro payload arrives.
 *
 * Theme-aware: all colors use CSS variables only (no hardcoded hex).
 */
import { useState, useEffect, useRef } from 'react';
import type { KokoroPayload, KokoroStateDelta } from '../lib/kokoro';
import type { KokoroDebugState, KokoroMemoryHit } from '../lib/api';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';

// ---------------------------------------------------------------------------
// Re-export: KokoroQaResponse (consumed by App.tsx + existing tests)
// ---------------------------------------------------------------------------

/**
 * Shape of the `/api/kokoro/qa/{charId}` response.
 * Only the fields consumed by this panel are declared here; callers may pass
 * the full API response without narrowing.
 */
export interface KokoroQaResponse {
  ok: boolean;
  boundary_count: number;
  parse_ok_total: number;
  parse_ok_count: number;
  parse_ok_rate: number;
  window_hours: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Compact inline badge showing rolling parse-OK rate from the QA endpoint.
 *
 * Colour semantics:
 *   - No data (total === 0)  → muted "n/a"
 *   - Rate ≥ 0.8             → green  "Parse ✓ NN%"
 *   - 0.5 ≤ rate < 0.8       → yellow "Parse ⚠ NN%"
 *   - Rate < 0.5             → red    "Parse ✗ NN%"
 */
function ParseOkBadge({ qa }: { qa: KokoroQaResponse | null | undefined }) {
  if (!qa) return null;

  const { parse_ok_total, parse_ok_rate } = qa;

  let color: string;
  let label: string;

  if (parse_ok_total === 0) {
    color = 'var(--color-text-tertiary, rgba(180,180,180,0.6))';
    label = 'Parse n/a';
  } else {
    const pct = Math.round(parse_ok_rate * 100);
    if (parse_ok_rate >= 0.8) {
      color = 'var(--color-success, #4ade80)';
      label = `Parse ✓ ${pct}%`;
    } else if (parse_ok_rate >= 0.5) {
      color = 'var(--color-warning, #facc15)';
      label = `Parse ⚠ ${pct}%`;
    } else {
      color = 'var(--color-error, #f87171)';
      label = `Parse ✗ ${pct}%`;
    }
  }

  return (
    <span style={{ color, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
      {label}
    </span>
  );
}

/** Render a single dial row with current value + this-turn delta arrow. */
function DialRow({
  name,
  value,
  delta,
}: {
  name: string;
  value: number | null | undefined;
  delta?: number;
}) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const arrow =
    typeof delta === 'number' && Math.abs(delta) > 0.001
      ? delta > 0
        ? '▲'
        : '▼'
      : '·';
  const deltaText =
    typeof delta === 'number' && Math.abs(delta) > 0.001
      ? ` ${delta > 0 ? '+' : ''}${delta.toFixed(3)}`
      : '';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '8em 4em 1.5em 5em',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.5,
      }}
    >
      <span>{name}</span>
      <span style={{ textAlign: 'right' }}>{v.toFixed(2)}</span>
      <span style={{ textAlign: 'center', opacity: 0.7 }}>{arrow}</span>
      <span style={{ textAlign: 'left', opacity: 0.6 }}>{deltaText}</span>
    </div>
  );
}

/** Tab button with active-state indicator. */
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '2px 8px',
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
        background: active
          ? 'var(--color-accent, rgba(150,100,255,0.4))'
          : 'transparent',
        color: active
          ? 'var(--color-text-primary, #e6e6e6)'
          : 'var(--color-text-secondary, rgba(200,200,200,0.7))',
        border: '1px solid var(--panel-border, rgba(255,255,255,0.15))',
        borderRadius: 4,
        cursor: 'pointer',
        marginRight: 4,
      }}
    >
      {label}
    </button>
  );
}

/** Single memory hit row showing dist, tier, salience, privacy. */
function MemoryRow({ hit }: { hit: KokoroMemoryHit }) {
  const tierLabel = hit.tier === 1 ? 'T1' : hit.tier === 2 ? 'T2' : 'T3';
  const privacyAbbr =
    hit.privacy_level === 'normal'
      ? ''
      : hit.privacy_level === 'private'
      ? ' [priv]'
      : hit.privacy_level === 'local_only'
      ? ' [local]'
      : ' [no-store]';
  return (
    <div
      style={{
        marginBottom: 6,
        padding: '4px 6px',
        background: 'var(--color-surface-raised, rgba(255,255,255,0.04))',
        borderRadius: 4,
        fontSize: 11,
      }}
    >
      <div style={{ fontFamily: 'ui-monospace, monospace', opacity: 0.5, marginBottom: 2 }}>
        {tierLabel} · dist={hit.dist.toFixed(3)} · sal={hit.salience.toFixed(2)} · {hit.status}{privacyAbbr}
      </div>
      <div style={{ lineHeight: 1.4 }}>{hit.text}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type TabId = 'mood' | 'memory' | 'relationship' | 'safety';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KokoroDebugPanelProps {
  payload: KokoroPayload | null;
  /**
   * Snapshot of dial values fetched alongside the chat response.  Optional —
   * when omitted the panel renders deltas only.  Server-side we plan to
   * include this via a separate `/api/kokoro/state` endpoint; until then
   * the panel reads deltas only.
   */
  dialValues?: Record<string, number>;
  /**
   * Rolling parse-quality data from `GET /api/kokoro/qa/{charId}`.
   * When provided, a colour-coded "Parse ✓/⚠/✗" badge is displayed below
   * the per-turn diagnostics line.  Omit until the orchestrator wires the
   * fetch — the badge simply does not render when this prop is absent.
   */
  qa?: KokoroQaResponse | null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Tabbed psychology inspector for the Kokoro engine.
 *
 * Tabs:
 *   - Mood        — dial vector, embodiment, parse-ok badge
 *   - Memory      — vector-store memory search with "why retrieved" metadata
 *   - Relationship — relationship block + shared-rituals injection text
 *   - Safety      — parse-ok rate, boundary count from qa prop
 *
 * Fetches debug state internally via `api.getKokoroDebugState` whenever
 * the active character changes or a new Kokoro payload arrives.
 *
 * @param payload - Last Kokoro response payload from the chat store
 * @param dialValues - Current absolute dial values (keyed by dial name)
 * @param qa - Rolling parse-quality metrics
 */
export function KokoroDebugPanel({ payload, dialValues, qa }: KokoroDebugPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('mood');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [debugState, setDebugState] = useState<KokoroDebugState | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);

  const charId = useChatStore(s => s.charId);
  const sessionId = useChatStore(s => s.sessionId);

  // Ref to track the last payload identity so we can re-fetch on new turn.
  const lastPayloadRef = useRef<KokoroPayload | null>(null);

  // Fetch debug state whenever charId changes or a new payload arrives.
  useEffect(() => {
    if (!charId) return;
    const payloadChanged = payload !== lastPayloadRef.current;
    lastPayloadRef.current = payload;

    // Only fetch if charId is set and (payload is new or this is first load).
    if (!payloadChanged && debugState !== null) return;

    setLoadingDebug(true);
    api
      .getKokoroDebugState(charId, sessionId ?? undefined, memoryQuery || undefined)
      .then(state => {
        setDebugState(state);
      })
      .catch(() => {
        // HUD only — silent failure; keep whatever state we had.
      })
      .finally(() => setLoadingDebug(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId, payload]);

  // Re-fetch memory results when the query changes (submit via Enter).
  const handleMemorySearch = () => {
    if (!charId) return;
    setLoadingDebug(true);
    api
      .getKokoroDebugState(charId, sessionId ?? undefined, memoryQuery || undefined)
      .then(state => setDebugState(state))
      .catch(() => {})
      .finally(() => setLoadingDebug(false));
  };

  if (!payload) {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>
        Kokoro: waiting for first turn…
      </div>
    );
  }

  const delta: KokoroStateDelta = payload.stateDelta ?? {};
  const v = (k: string) => dialValues?.[k] ?? debugState?.mind_dials?.[k];

  const TIER_A = [
    'mood', 'arousal', 'energy', 'curiosity', 'playfulness',
    'confidence', 'vulnerability', 'agency', 'coherence',
    'focus', 'tenderness', 'humor_charge', 'awe',
  ];
  const TIER_B = ['loneliness', 'restedness', 'boredom_with_topic', 'anticipation', 'nostalgia'];
  const TIER_F = ['desire_for_user', 'inhibition', 'boldness', 'modesty', 'tension_buildup', 'afterglow'];

  const panelStyle: React.CSSProperties = {
    padding: 12,
    background: 'var(--panel-bg, rgba(0,0,0,0.6))',
    color: 'var(--text-primary, #e6e6e6)',
    border: '1px solid var(--panel-border, rgba(255,255,255,0.1))',
    borderRadius: 8,
    maxWidth: 340,
  };

  // ── Tab: Mood ─────────────────────────────────────────────────────────────

  const moodTab = (
    <>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        parse={payload.diagnostics.parseOk ? 'ok' : 'fallback'} · bond={payload.diagnostics.bondLevel} · enabled={String(payload.diagnostics.kokoroEnabled)}
      </div>
      {qa && (
        <div style={{ marginBottom: 8 }}>
          <ParseOkBadge qa={qa} />
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Tier A — fast</div>
        {TIER_A.map((k) => (
          <DialRow key={k} name={k} value={v(k)} delta={delta[k]} />
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Tier B — slow drift</div>
        {TIER_B.map((k) => (
          <DialRow key={k} name={k} value={v(k)} delta={delta[k]} />
        ))}
      </div>

      {payload.nsfw.active && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
            Tier F — intimate (gate open)
          </div>
          {TIER_F.map((k) => (
            <DialRow key={k} name={k} value={v(k)} delta={delta[k]} />
          ))}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            inner Δ: {payload.nsfw.innerArousalShift?.toFixed(3) ?? '—'} ·
            consent-check: {String(payload.nsfw.selfConsentCheck)} ·
            boundary push-back: {String(payload.nsfw.boundaryReinforcement)}
          </div>
        </div>
      )}

      {debugState?.traits && Object.keys(debugState.traits).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Tier C — identity traits</div>
          {Object.entries(debugState.traits).map(([k, val]) => (
            <DialRow key={k} name={k} value={val} />
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        face={payload.facialExpression} · gesture={payload.gesture} · gaze={payload.gaze}
        <br />
        voice={payload.voiceStyle} · emotion={payload.emotion}
      </div>

      {payload.memoryWrite.shouldSave && payload.memoryWrite.summary && (
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 6, fontStyle: 'italic' }}>
          memory ← "{payload.memoryWrite.summary}" (imp={payload.memoryWrite.importance.toFixed(2)})
        </div>
      )}
    </>
  );

  // ── Tab: Memory ───────────────────────────────────────────────────────────

  const memoryTab = (
    <>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
          Enter a query to see which memories would be retrieved
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={memoryQuery}
            onChange={e => setMemoryQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleMemorySearch(); }}
            placeholder="what does she remember about…"
            style={{
              flex: 1,
              fontSize: 11,
              padding: '3px 6px',
              background: 'var(--color-surface, rgba(255,255,255,0.06))',
              color: 'var(--color-text-primary, #e6e6e6)',
              border: '1px solid var(--panel-border, rgba(255,255,255,0.15))',
              borderRadius: 4,
              fontFamily: 'ui-monospace, monospace',
            }}
          />
          <button
            type="button"
            onClick={handleMemorySearch}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'var(--color-accent, rgba(150,100,255,0.35))',
              color: 'var(--color-text-primary, #e6e6e6)',
              border: '1px solid var(--panel-border, rgba(255,255,255,0.15))',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {loadingDebug ? '…' : 'Search'}
          </button>
        </div>
      </div>

      {debugState?.retrieved_memories?.length ? (
        <div>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
            {debugState.retrieved_memories.length} result(s) — sorted by relevance
          </div>
          {debugState.retrieved_memories.map((hit, i) => (
            <MemoryRow key={`${hit.id}-${i}`} hit={hit} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5 }}>
          {memoryQuery ? 'No memories retrieved for this query.' : 'Type a query above to search memories.'}
        </div>
      )}
    </>
  );

  // ── Tab: Relationship ─────────────────────────────────────────────────────

  const textAreaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 90,
    padding: 6,
    fontSize: 10,
    fontFamily: 'ui-monospace, monospace',
    background: 'var(--color-surface, rgba(255,255,255,0.04))',
    color: 'var(--color-text-primary, #e6e6e6)',
    border: '1px solid var(--panel-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    resize: 'vertical',
    lineHeight: 1.4,
    boxSizing: 'border-box',
    wordBreak: 'break-word',
  };

  const relationshipTab = (
    <>
      {debugState?.relationship_block ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            Relationship block injected into prompts
          </div>
          <pre style={textAreaStyle}>{debugState.relationship_block}</pre>
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
          {loadingDebug ? 'Loading…' : 'No bond data for this character yet.'}
        </div>
      )}

      {debugState?.rituals_block ? (
        <div>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            Shared rituals block
          </div>
          <pre style={textAreaStyle}>{debugState.rituals_block}</pre>
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5 }}>
          {loadingDebug ? 'Loading…' : 'No established rituals yet.'}
        </div>
      )}
    </>
  );

  // ── Tab: Safety ───────────────────────────────────────────────────────────

  const safetyTab = (
    <>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
          Parse-ok rate (48 h window from debug state)
        </div>
        {debugState?.parse_ok_rate !== null && debugState?.parse_ok_rate !== undefined ? (
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
            {Math.round(debugState.parse_ok_rate * 100)}% ({debugState.parse_ok_total} turns)
          </div>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            {loadingDebug ? 'Loading…' : 'Parse log unavailable.'}
          </div>
        )}
      </div>

      {qa && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            QA endpoint ({qa.window_hours} h window)
          </div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.6 }}>
            <div>parse_ok_total: {qa.parse_ok_total}</div>
            <div>parse_ok_count: {qa.parse_ok_count}</div>
            <div style={{ marginBottom: 4 }}>
              <ParseOkBadge qa={qa} />
            </div>
            <div>boundary events: {qa.boundary_count}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
          Last-turn parse diagnostics
        </div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.6 }}>
          <div>parse={payload.diagnostics.parseOk ? 'ok' : 'fallback'}</div>
          <div>bond_level={payload.diagnostics.bondLevel}</div>
          <div>kokoro_enabled={String(payload.diagnostics.kokoroEnabled)}</div>
          {payload.nsfw.active && (
            <>
              <div>nsfw_gate=open</div>
              <div>consent_check={String(payload.nsfw.selfConsentCheck)}</div>
              <div>boundary_reinforcement={String(payload.nsfw.boundaryReinforcement)}</div>
            </>
          )}
        </div>
      </div>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Kokoro · debug</div>

      {/* Tab bar */}
      <div style={{ marginBottom: 8 }}>
        {(['mood', 'memory', 'relationship', 'safety'] as TabId[]).map(tab => (
          <TabButton
            key={tab}
            label={tab}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'mood' && moodTab}
      {activeTab === 'memory' && memoryTab}
      {activeTab === 'relationship' && relationshipTab}
      {activeTab === 'safety' && safetyTab}
    </div>
  );
}
