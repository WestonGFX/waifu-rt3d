/**
 * PsychologyDevPanel — Dev-mode visualization for the psychology engine.
 *
 * Shows relationship phase, bond/threat vectors as bar charts,
 * state history timeline, active rules, and dere weight distribution.
 * Only visible when dev mode is enabled.
 */

import { useCompanion } from '@/context/CompanionContext.tsx';
import { useApp } from '@/context/AppContext.tsx';
import { type PsychologyState } from '@/types/psychology.ts';
import { AppCard, SettingsSectionHeader } from './SettingsPrimitives.tsx';

/** Simple horizontal bar for a numeric value (0-100). */
function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-xs text-text-muted">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--control-bg-soft)]">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] font-mono text-text-muted">
        {Math.round(value)}
      </span>
    </div>
  );
}

/** Renders the dere weight distribution as small bars. */
function DereWeightsViz({ weights }: { weights: Record<string, number> }) {
  const sorted = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return <span className="text-xs text-text-muted">No dere weights configured</span>;

  return (
    <div className="space-y-1">
      {sorted.map(([type, weight]) => (
        <Bar key={type} label={type} value={weight} color="bg-fuchsia-400" />
      ))}
    </div>
  );
}

/** Renders a single state — bonds, threats, etc. */
function PsychologyStateView({ psychState }: { psychState: PsychologyState }) {
  const phaseColors: Record<string, string> = {
    honeymoon: 'text-pink-500',
    stable: 'text-emerald-500',
    strained: 'text-amber-500',
    detaching: 'text-orange-500',
    post_breakup: 'text-red-500',
  };

  return (
    <div className="space-y-4">
      {/* Phase */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Phase:</span>
        <span className={`text-sm font-semibold ${phaseColors[psychState.phase] ?? 'text-text-primary'}`}>
          {psychState.phase.replace('_', ' ')}
        </span>
        <span className="text-xs text-text-muted">
          (mask: {psychState.activeMask}, turns since shift: {psychState.turnsSinceLastShift})
        </span>
      </div>

      {/* Bonds */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Bonds</div>
        <div className="space-y-1">
          <Bar label="Attachment" value={psychState.bonds.attachment} color="bg-pink-400" />
          <Bar label="Respect" value={psychState.bonds.respect} color="bg-sky-400" />
          <Bar label="Admiration" value={psychState.bonds.admiration} color="bg-violet-400" />
          <Bar label="Trust" value={psychState.bonds.trust} color="bg-emerald-400" />
        </div>
      </div>

      {/* Threats */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Threats</div>
        <div className="space-y-1">
          <Bar label="Status" value={psychState.threats.status} color="bg-amber-400" />
          <Bar label="Abandonment" value={psychState.threats.abandonment} color="bg-orange-400" />
          <Bar label="Control Loss" value={psychState.threats.controlLoss} color="bg-red-400" />
          <Bar label="Rival" value={psychState.threats.rival} color="bg-rose-400" />
        </div>
      </div>

      {/* Fatigue */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Fatigue</div>
        <Bar label="Emotional" value={psychState.fatigue.emotionalLabor} color="bg-slate-400" />
      </div>

      {/* Dere Weights */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dere Blend</div>
        <DereWeightsViz weights={psychState.dereWeights} />
      </div>

      {/* Active Modes */}
      {psychState.activeTriggeredModes.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Active Modes</div>
          <div className="flex flex-wrap gap-1">
            {psychState.activeTriggeredModes.map((mode) => (
              <span key={mode} className="rounded-full bg-anime-100 px-2 py-0.5 text-[10px] font-medium text-anime-700">
                {mode}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Flags */}
      {Object.keys(psychState.flags).length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Flags</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(psychState.flags)
              .filter(([, v]) => v)
              .map(([flag]) => (
                <span key={flag} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  {flag}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* State History (last 10) */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          History ({psychState.stateHistory.length} entries)
        </div>
        <div className="max-h-32 space-y-0.5 overflow-y-auto">
          {psychState.stateHistory.slice(-10).reverse().map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-text-muted">
              <span className="font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className={phaseColors[entry.phase] ?? ''}>{entry.phase}</span>
              {entry.triggerLabel && <span className="italic">— {entry.triggerLabel}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the full Psychology dev panel.
 * Only shows content when dev mode is enabled and a psychology state exists.
 */
export default function PsychologyDevPanel() {
  const { state: appState } = useApp();
  const { currentPsychologyState, currentIntimacyState } = useCompanion();

  if (!appState.devModeEnabled) return null;

  return (
    <div className="space-y-4">
      <SettingsSectionHeader
        title="Psychology Engine (Dev)"
        subtitle="Live internal state visualization — only visible in dev mode."
      />

      {currentPsychologyState ? (
        <AppCard>
          <PsychologyStateView psychState={currentPsychologyState} />
        </AppCard>
      ) : (
        <AppCard>
          <p className="text-sm text-text-muted">
            No psychology state for this thread yet. Send a message to initialize it.
          </p>
        </AppCard>
      )}

      {currentIntimacyState && (
        <>
          <SettingsSectionHeader
            title="Intimacy Tracker (Dev)"
            subtitle="Current thread intimacy and physical state."
          />
          <AppCard>
            <div className="space-y-2">
              <Bar label="Intimacy" value={currentIntimacyState.intimacy.level} color="bg-pink-400" />
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>Trend: {currentIntimacyState.intimacy.trend}</span>
                <span>Turn: {currentIntimacyState.intimacy.lastUpdateTurn}</span>
              </div>
              <div className="mt-2 text-xs text-text-muted">
                <div>Position: {currentIntimacyState.physical.physicalContext}</div>
                <div>User clothing: {currentIntimacyState.physical.userClothing}</div>
                <div>Companion clothing: {currentIntimacyState.physical.companionClothing}</div>
                {currentIntimacyState.physical.recentActions.length > 0 && (
                  <div>Recent actions: {currentIntimacyState.physical.recentActions.join('; ')}</div>
                )}
              </div>
            </div>
          </AppCard>
        </>
      )}
    </div>
  );
}
