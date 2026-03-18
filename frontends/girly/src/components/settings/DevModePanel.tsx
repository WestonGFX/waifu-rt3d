/**
 * DevModePanel – live telemetry display, visible only when dev mode is on.
 *
 * Shows:
 *   - Current FPS (instantaneous) and average FPS (60-frame window)
 *   - Last LLM request latency in ms
 *   - Last LLM token count (if Ollama reported it)
 *   - Active provider names per capability
 *
 * Metrics are read from AppContext.state.metrics, which is updated by:
 *   - ThreeViewer's render loop (FPS)
 *   - ChatContext's sendMessage (LLM latency)
 *   - The Ollama provider (token counts, via registry)
 *
 * This panel re-renders on every AppContext dispatch – acceptable because
 * it's only mounted in dev mode and the metrics update at 30 Hz (FPS) at most.
 */

import { useApp } from '../../context/AppContext.tsx';
import { getLLMProvider } from '../../providers/registry.ts';

export default function DevModePanel() {
  const { state } = useApp();
  const { metrics } = state;

  // Pull the last LLM metrics (tokens/sec etc.) directly from the provider.
  let llmMetrics: { totalTokens?: number; tokensPerSecond?: number } | undefined;
  try {
    const ollama = getLLMProvider('ollama');
    llmMetrics = ollama.getLastMetrics();
  } catch {
    // Provider not available – ignore.
  }

  return (
    <div className="bg-anime-100 border border-anime-200 rounded-anime p-2 font-mono text-xs text-text-secondary space-y-1">
      <div className="font-semibold text-anime-600 mb-1">⚙ Dev Telemetry</div>

      <div className="flex justify-between">
        <span>FPS (current / avg)</span>
        <span className={metrics.currentFps < 15 ? 'text-rose-pastel-400' : 'text-green-600'}>
          {metrics.currentFps} / {metrics.averageFps}
        </span>
      </div>

      <div className="flex justify-between">
        <span>Last LLM latency</span>
        <span>{metrics.lastLlmLatencyMs > 0 ? `${metrics.lastLlmLatencyMs} ms` : '—'}</span>
      </div>

      {llmMetrics?.totalTokens != null && (
        <div className="flex justify-between">
          <span>Last LLM tokens</span>
          <span>{llmMetrics.totalTokens}</span>
        </div>
      )}

      {llmMetrics?.tokensPerSecond != null && (
        <div className="flex justify-between">
          <span>Tokens / sec</span>
          <span>{llmMetrics.tokensPerSecond}</span>
        </div>
      )}

      <div className="pt-1 border-t border-anime-200">
        <div className="text-text-muted">Active providers:</div>
        {Object.entries(metrics.activeProviders).map(([cap, name]) => (
          <div key={cap} className="flex justify-between pl-2">
            <span>{cap}</span>
            <span className="text-anime-500">{name}</span>
          </div>
        ))}
      </div>

      <div className="pt-1 border-t border-anime-200 space-y-1">
        <div className="text-text-muted">Avatar performance:</div>
        <div className="flex justify-between pl-2">
          <span>phase</span>
          <span className="text-anime-500">{state.avatar.phase}</span>
        </div>
        <div className="flex justify-between pl-2">
          <span>emotion</span>
          <span className="text-anime-500">
            {state.avatar.emotion} / {Math.round(state.avatar.energy * 100)}%
          </span>
        </div>
        <div className="flex justify-between pl-2">
          <span>gesture</span>
          <span className="text-anime-500">{state.avatar.gesture}</span>
        </div>
        <div className="flex justify-between pl-2">
          <span>gaze</span>
          <span className="text-anime-500">{state.avatar.gaze}</span>
        </div>
        <div className="flex justify-between pl-2">
          <span>tag source</span>
          <span className="text-anime-500">{state.avatar.metadataSource}</span>
        </div>
        <div className="flex justify-between pl-2">
          <span>scene beat</span>
          <span className="text-anime-500">{state.avatar.sceneBeat ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
