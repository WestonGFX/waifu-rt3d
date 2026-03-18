import { useCompanion } from '../../context/CompanionContext.tsx';

export default function HelperStatusStrip({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { state, refreshHelperData } = useCompanion();

  return (
    <div className={`rounded-anime border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] shadow-[var(--shell-shadow-soft)] ${compact ? 'px-2.5 py-2' : 'px-3 py-2'}`}>
      <div className={`flex gap-3 ${compact ? 'items-start justify-between' : 'items-center justify-between'}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Local Runtime
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={[
                'inline-flex h-2.5 w-2.5 rounded-full',
                state.helperHealth.ok ? 'bg-green-400' : 'bg-rose-pastel-400',
              ].join(' ')}
            />
            <span className="text-sm font-semibold text-text-primary">
              {state.helperHealth.ok ? 'Helper online' : 'Helper offline'}
            </span>
            <span className={`text-xs text-text-muted ${compact ? 'hidden sm:inline' : ''}`}>
              {state.helperHealth.version}
            </span>
          </div>
          <p className={`mt-1 text-xs text-text-muted ${compact ? 'line-clamp-2 max-w-[24rem]' : ''}`}>
            {state.helperHealth.message ?? 'Voice models, runtime discovery, and memory services are ready.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshHelperData()}
          disabled={state.isRefreshingHelper}
          className="rounded-pill border border-anime-200 bg-anime-50 px-3 py-1.5 text-xs font-medium text-anime-600 transition-colors hover:bg-anime-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.isRefreshingHelper ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className={`grid gap-2 ${compact ? 'mt-2 grid-cols-2 xl:grid-cols-4' : 'mt-3 grid-cols-2 md:grid-cols-4'}`}>
        {[
          { label: 'Providers', value: state.ttsProviders.length || 1 },
          { label: 'Voices', value: state.ttsVoices.length },
          { label: 'Models', value: state.modelCatalog.length },
          { label: 'Jobs', value: state.jobs.length },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] ${compact ? 'px-2.5 py-1.25' : 'px-3 py-2'}`}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-text-primary">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
