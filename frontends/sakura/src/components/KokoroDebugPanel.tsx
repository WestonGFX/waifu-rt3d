/**
 * Kokoro Debug Panel — dev-only HUD for inspecting the character's dial state.
 *
 * Shows the 9-axis Tier A vector, Tier B slow drift, Tier C identity traits,
 * and Tier E scene state.  Tier F (NSFW) dials appear only when the backend
 * indicates the gate is open (`payload.nsfw.active === true`).
 *
 * The panel is rendered when `?debug=kokoro` is present in the URL or when
 * the user has dev_mode enabled in settings.  It does NOT poll — it
 * displays the last payload from chat.
 */
import type { KokoroPayload, KokoroStateDelta } from '../lib/kokoro';

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

interface KokoroDebugPanelProps {
  payload: KokoroPayload | null;
  /**
   * Snapshot of dial values fetched alongside the chat response.  Optional —
   * when omitted the panel renders deltas only.  Server-side we plan to
   * include this via a separate `/api/kokoro/state` endpoint; until then
   * the panel reads deltas only.
   */
  dialValues?: Record<string, number>;
}

export function KokoroDebugPanel({ payload, dialValues }: KokoroDebugPanelProps) {
  if (!payload) {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>
        Kokoro: waiting for first turn…
      </div>
    );
  }

  const delta: KokoroStateDelta = payload.stateDelta ?? {};
  const v = (k: string) => dialValues?.[k];

  const TIER_A = [
    'mood', 'arousal', 'energy', 'curiosity', 'playfulness',
    'confidence', 'vulnerability', 'agency', 'coherence',
    'focus', 'tenderness', 'humor_charge', 'awe',
  ];
  const TIER_B = ['loneliness', 'restedness', 'boredom_with_topic', 'anticipation', 'nostalgia'];
  const TIER_F = ['desire_for_user', 'inhibition', 'boldness', 'modesty', 'tension_buildup', 'afterglow'];

  return (
    <div
      style={{
        padding: 12,
        background: 'var(--panel-bg, rgba(0,0,0,0.6))',
        color: 'var(--text-primary, #e6e6e6)',
        border: '1px solid var(--panel-border, rgba(255,255,255,0.1))',
        borderRadius: 8,
        maxWidth: 340,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Kokoro · debug</div>

      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
        parse={payload.diagnostics.parseOk ? 'ok' : 'fallback'} · bond={payload.diagnostics.bondLevel} · enabled={String(payload.diagnostics.kokoroEnabled)}
      </div>

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

      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        face={payload.facialExpression} · gesture={payload.gesture} · gaze={payload.gaze}
        <br />
        voice={payload.voiceStyle} · emotion={payload.emotion}
      </div>

      {payload.memoryWrite.shouldSave && payload.memoryWrite.summary && (
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 6, fontStyle: 'italic' }}>
          memory ← “{payload.memoryWrite.summary}” (imp={payload.memoryWrite.importance.toFixed(2)})
        </div>
      )}
    </div>
  );
}
