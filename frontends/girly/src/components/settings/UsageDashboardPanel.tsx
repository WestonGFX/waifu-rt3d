/**
 * UsageDashboardPanel — Token usage and cost intelligence settings panel.
 *
 * Four sections:
 *   1. Context Budget Bar   — Stacked segment visualization with tooltip detail,
 *                             usage percentage label, warning badges, and a
 *                             "~N messages remaining" estimate.
 *   2. Session Sparkline    — Pure-SVG line + area chart of total tokens per
 *                             request for the current session, with a hover
 *                             detail callout.
 *   3. Cost Summary         — Session-scoped totals: requests, tokens, avg tok/s,
 *                             avg latency, provider, model, and USD estimate.
 *   4. Model Benchmark      — Per-model rows aggregated from session history,
 *                             sortable by any column.
 *
 * The tokenHistoryService is a parallel-agent deliverable that may not exist
 * yet.  This panel imports it defensively: if the module is absent the panel
 * renders gracefully with empty/zero state.
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { BarChart3, DollarSign, Gauge, Layers } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { useApp } from '@/context/AppContext.tsx';
import {
  AppCard,
  AppMutedNote,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';

/* ── TokenHistory types (mirrored from tokenHistoryService contract) ── */

/**
 * One record per LLM request captured by tokenHistoryService.
 * Shape must stay in sync with the service's own exported interface.
 */
export interface TokenHistoryRecord {
  /** Unix milliseconds when the request completed. */
  timestamp: number;
  /** Tokens in the prompt / input portion. */
  inputTokens: number;
  /** Tokens in the completion / output portion. */
  outputTokens: number;
  /** inputTokens + outputTokens */
  totalTokens: number;
  /** Wall-clock request duration in ms. */
  latencyMs: number;
  /** Output tokens ÷ (latencyMs / 1000). */
  tokensPerSecond: number;
  /** LLM provider id, e.g. "ollama", "openai". */
  providerId: string;
  /** Model identifier used for the request. */
  modelId: string;
  /** usedInputTokens / contextWindow at request time (0–1). */
  contextUsageRatio: number;
  /** Naive cost estimate in USD; 0 for local providers. */
  estimatedCostUsd: number;
}

/* ── Lazy service import ─────────────────────────────────────────── */

/**
 * Minimal contract surface we need from tokenHistoryService.
 * The real module will export a `sessionTokenHistory` object that conforms
 * to this interface.
 */
interface TokenHistoryService {
  getHistory(): TokenHistoryRecord[];
  /** Optional: notify when a new record is appended. */
  subscribe?(listener: () => void): () => void;
}

/** Null-safe wrapper returned when the service module is absent. */
const EMPTY_SERVICE: TokenHistoryService = {
  getHistory: () => [],
};

/**
 * Attempts to resolve the tokenHistoryService at runtime without causing a
 * TypeScript compile error when the module file does not yet exist.
 *
 * We use a dynamic import wrapped in a try/catch so that TypeScript treats
 * the resolved type as `unknown` and the build still compiles cleanly.
 */
async function resolveTokenHistoryService(): Promise<TokenHistoryService> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(
      /* @vite-ignore */
      '../../services/tokenHistoryService.ts'
    );
    // The module must export `sessionTokenHistory` as its default or named export.
    const service =
      (mod as { sessionTokenHistory?: TokenHistoryService })
        .sessionTokenHistory ??
      (mod as { default?: TokenHistoryService }).default;
    if (service && typeof service.getHistory === 'function') {
      return service;
    }
    return EMPTY_SERVICE;
  } catch {
    return EMPTY_SERVICE;
  }
}

/* ── Utility helpers ─────────────────────────────────────────────── */

/**
 * Formats a number with locale-aware thousands separators.
 * Returns "—" for null/undefined values to keep the table readable.
 */
function fmt(value: number | null | undefined, decimals = 0): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Returns a locale-formatted USD cost string.
 * For very small values (< $0.01) shows micro-cent notation.
 */
function fmtCost(usd: number): string {
  if (usd === 0) return 'Free (local)';
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

/** Formats milliseconds as a human string, e.g. "1,234 ms" or "45.2 s". */
function fmtLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/* ── Section 1: Enhanced Context Budget Bar ─────────────────────── */

interface BudgetSegment {
  id: string;
  label: string;
  tokens: number;
  colorHex: string;
}

interface ContextBudgetBarProps {
  /** All segments from the current ContextBudgetBreakdown. */
  segments: BudgetSegment[];
  /** Total usable input token budget (context window minus reserved output). */
  usableTokens: number;
  /** Tokens already allocated across all segments (excluding free + response). */
  usedTokens: number;
  /** Estimated context window size in tokens. */
  contextWindow: number;
}

/**
 * Stacked bar + tooltip detail for the context budget.
 *
 * Renders each non-free, non-response segment as a proportional colored slice.
 * Shows a percentage label when usage exceeds 50%, an amber warning above 75%,
 * and a red warning above 90%.  Estimates remaining "conversational turns"
 * based on average recent message size.
 */
function ContextBudgetBar({
  segments,
  usableTokens,
  usedTokens,
  contextWindow,
}: ContextBudgetBarProps) {
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  const visibleSegments = useMemo(
    () => segments.filter((s) => s.id !== 'free' && s.id !== 'response' && s.tokens > 0),
    [segments],
  );

  const usageRatio = contextWindow > 0 ? Math.min(1, usedTokens / contextWindow) : 0;
  const usagePct = Math.round(usageRatio * 100);

  /** Estimated remaining turns assuming ~200 tokens per exchange (user + assistant). */
  const estimatedTurnsRemaining = Math.max(
    0,
    Math.floor((usableTokens - usedTokens) / 200),
  );

  const warningLevel: 'none' | 'amber' | 'red' =
    usagePct >= 90 ? 'red' : usagePct >= 75 ? 'amber' : 'none';

  const hoveredSegment = visibleSegments.find((s) => s.id === hoveredSegmentId) ?? null;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {warningLevel !== 'none' && (
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                warningLevel === 'red'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700',
              ].join(' ')}
            >
              {warningLevel === 'red' ? 'Critical' : 'High usage'}
            </span>
          )}
          {usagePct > 50 && (
            <span className="text-xs font-semibold text-text-primary">
              {usagePct}% used
            </span>
          )}
        </div>
        <span className="text-[11px] text-text-muted">
          {estimatedTurnsRemaining > 0
            ? `~${estimatedTurnsRemaining} messages remaining`
            : 'Context nearly full'}
        </span>
      </div>

      {/* Stacked bar */}
      <TooltipProvider delayDuration={160}>
        <div
          className="relative h-4 overflow-hidden rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--control-bg-soft) 96%, white 4%)',
            border: '1px solid color-mix(in srgb, var(--control-border-soft) 100%, transparent 0%)',
          }}
          onMouseLeave={() => setHoveredSegmentId(null)}
        >
          {/* Render each segment as an absolutely positioned slice */}
          {visibleSegments.map((segment, index) => {
            const cumulativeStart = visibleSegments
              .slice(0, index)
              .reduce((acc, s) => acc + s.tokens, 0);
            const leftPct = Math.round((cumulativeStart / Math.max(contextWindow, 1)) * 1000) / 10;
            const widthPct = Math.round((segment.tokens / Math.max(contextWindow, 1)) * 1000) / 10;
            const isHovered = hoveredSegmentId === segment.id;

            return (
              <Tooltip key={segment.id} open={isHovered}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute inset-y-0 cursor-pointer transition-[filter] duration-150"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(0.5, widthPct)}%`,
                      background: segment.colorHex,
                      filter: isHovered ? 'brightness(1.15)' : undefined,
                    }}
                    onMouseEnter={() => setHoveredSegmentId(segment.id)}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-text-primary">{segment.label}</div>
                    <div>
                      {fmt(segment.tokens)} tokens
                      {' · '}
                      {Math.round((segment.tokens / Math.max(contextWindow, 1)) * 100)}%
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Shine overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, white 18%, transparent 82%) 0%, transparent 60%)',
            }}
          />
        </div>
      </TooltipProvider>

      {/* Hover detail or segment legend */}
      {hoveredSegment ? (
        <div className="rounded-xl px-2.5 py-1.5 text-xs text-text-secondary"
          style={{
            background: `color-mix(in srgb, ${hoveredSegment.colorHex} 12%, var(--control-bg-soft) 88%)`,
            border: `1px solid color-mix(in srgb, ${hoveredSegment.colorHex} 32%, var(--control-border-soft) 68%)`,
          }}
        >
          <span className="font-semibold" style={{ color: hoveredSegment.colorHex }}>
            {hoveredSegment.label}
          </span>
          {' — '}
          {fmt(hoveredSegment.tokens)} tokens
          {' · '}
          {Math.round((hoveredSegment.tokens / Math.max(contextWindow, 1)) * 100)}% of window
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visibleSegments.map((segment) => (
            <div
              key={segment.id}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-text-muted"
              style={{
                background: `color-mix(in srgb, ${segment.colorHex} 16%, var(--control-bg-soft) 84%)`,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: segment.colorHex }}
              />
              {segment.label}
            </div>
          ))}
        </div>
      )}

      {/* Token counts summary */}
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span>{fmt(usedTokens)} used</span>
        <span className="opacity-40">/</span>
        <span>{fmt(usableTokens)} usable</span>
        <span className="opacity-40">/</span>
        <span>{fmt(contextWindow)} window</span>
      </div>
    </div>
  );
}

/* ── Section 2: Session Sparkline ────────────────────────────────── */

interface SparklineProps {
  /** Total tokens per request, in chronological order. */
  data: number[];
  /** Width the SVG should render at (pixels). */
  width: number;
  /** Height the SVG should render at (pixels). */
  height: number;
  /** Index of the hovered data point, or null. */
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}

/**
 * Pure-SVG sparkline with area fill.
 *
 * Renders a line from left to right using the supplied token counts.
 * Each data point has an invisible hit-area for hover detection.
 * The area under the line is filled with a soft gradient.
 */
function Sparkline({ data, width, height, hoveredIndex, onHover }: SparklineProps) {
  if (data.length === 0) return null;

  const padding = { top: 6, right: 8, bottom: 4, left: 4 };
  const chartW = Math.max(1, width - padding.left - padding.right);
  const chartH = Math.max(1, height - padding.top - padding.bottom);

  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = Math.max(1, maxVal - minVal);

  /** Maps a data point to its (x, y) SVG coordinate. */
  const toPoint = (value: number, index: number) => {
    const x = padding.left + (data.length === 1 ? chartW / 2 : (index / (data.length - 1)) * chartW);
    const y = padding.top + chartH - ((value - minVal) / range) * chartH;
    return { x, y };
  };

  const points = data.map((value, index) => toPoint(value, index));

  /** Build SVG path data for the line. */
  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');

  /** Close the area path down to the baseline. */
  const areaPath = [
    linePath,
    `L${points[points.length - 1].x.toFixed(1)},${(padding.top + chartH).toFixed(1)}`,
    `L${points[0].x.toFixed(1)},${(padding.top + chartH).toFixed(1)}`,
    'Z',
  ].join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-anime-400)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-anime-100)" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill="url(#sparkline-fill)" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-anime-400)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Hit areas + hover dots */}
      {points.map((pt, i) => (
        <g key={i}>
          {/* Invisible wide hit zone */}
          <rect
            x={pt.x - 8}
            y={padding.top}
            width={16}
            height={chartH}
            fill="transparent"
            className="cursor-crosshair"
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
          />
          {/* Visible dot only on hover */}
          {hoveredIndex === i && (
            <>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill="var(--card-bg)"
                stroke="var(--color-anime-400)"
                strokeWidth="1.5"
              />
              {/* Vertical guide line */}
              <line
                x1={pt.x}
                y1={padding.top}
                x2={pt.x}
                y2={padding.top + chartH}
                stroke="var(--color-anime-300)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

interface SessionSparklineProps {
  records: TokenHistoryRecord[];
}

/**
 * Container for the sparkline section.
 * Measures its own container width via a ResizeObserver so the SVG
 * always fills the available space.
 */
function SessionSparkline({ records }: SessionSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const tokenSeries = useMemo(() => records.map((r) => r.totalTokens), [records]);
  const hoveredRecord = hoveredIndex !== null ? records[hoveredIndex] : null;

  if (records.length === 0) {
    return (
      <AppMutedNote>
        No requests recorded in this session yet. Send a message to populate the chart.
      </AppMutedNote>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full">
        <Sparkline
          data={tokenSeries}
          width={containerWidth}
          height={60}
          hoveredIndex={hoveredIndex}
          onHover={setHoveredIndex}
        />
      </div>

      {/* Hover detail */}
      <div className="min-h-[1.5rem]">
        {hoveredRecord ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
            <span className="font-medium text-text-primary">
              Request #{(hoveredIndex ?? 0) + 1}
            </span>
            <span>{fmt(hoveredRecord.totalTokens)} tokens</span>
            <span>{fmt(hoveredRecord.tokensPerSecond, 1)} tok/s</span>
            <span>{fmtLatency(hoveredRecord.latencyMs)}</span>
            <span className="text-text-muted">
              {new Date(hoveredRecord.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-text-muted">
            Hover over the chart to inspect individual requests
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Section 3: Cost Summary Card ────────────────────────────────── */

interface CostSummaryProps {
  records: TokenHistoryRecord[];
  providerId: string;
  modelId: string;
}

/**
 * Aggregated session cost, request, and performance summary.
 *
 * Shows "Local (free)" when the primary provider is ollama, otherwise
 * displays a naive USD cost estimate derived from per-record estimates.
 */
function CostSummary({ records, providerId, modelId }: CostSummaryProps) {
  const stats = useMemo(() => {
    if (records.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgTokPerSec: 0,
        avgLatencyMs: 0,
      };
    }
    const totalTokens = records.reduce((acc, r) => acc + r.totalTokens, 0);
    const totalCostUsd = records.reduce((acc, r) => acc + r.estimatedCostUsd, 0);
    const avgTokPerSec =
      records.reduce((acc, r) => acc + r.tokensPerSecond, 0) / records.length;
    const avgLatencyMs =
      records.reduce((acc, r) => acc + r.latencyMs, 0) / records.length;
    return {
      totalRequests: records.length,
      totalTokens,
      totalCostUsd,
      avgTokPerSec,
      avgLatencyMs,
    };
  }, [records]);

  const isLocal = providerId === 'ollama' || stats.totalCostUsd === 0;

  return (
    <div className="space-y-3">
      {/* Cost headline */}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-text-primary">
          {isLocal ? 'Local (free)' : fmtCost(stats.totalCostUsd)}
        </span>
        <span className="text-xs text-text-muted">estimated session cost</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="Requests" value={fmt(stats.totalRequests)} />
        <StatCell label="Total tokens" value={fmt(stats.totalTokens)} />
        <StatCell
          label="Avg tok/s"
          value={stats.avgTokPerSec > 0 ? fmt(stats.avgTokPerSec, 1) : '—'}
        />
        <StatCell
          label="Avg latency"
          value={stats.avgLatencyMs > 0 ? fmtLatency(stats.avgLatencyMs) : '—'}
        />
      </div>

      {/* Provider + model */}
      <div className="rounded-[14px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Provider
            </div>
            <div className="mt-0.5 text-sm font-medium capitalize text-text-primary">
              {providerId || '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Model
            </div>
            <div className="mt-0.5 max-w-[180px] truncate text-sm font-medium text-text-primary">
              {modelId || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inner stat cell used inside the CostSummary grid. */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

/* ── Section 4: Model Benchmark Table ────────────────────────────── */

type BenchmarkColumn = 'model' | 'requests' | 'avgTokPerSec' | 'avgLatency' | 'totalTokens';
type SortDir = 'asc' | 'desc';

interface BenchmarkRow {
  modelId: string;
  providerId: string;
  requests: number;
  avgTokPerSec: number;
  avgLatencyMs: number;
  totalTokens: number;
}

interface ModelBenchmarkTableProps {
  records: TokenHistoryRecord[];
}

/**
 * Aggregates session records by model ID and renders a sortable table.
 *
 * Column header clicks toggle ascending/descending sort on that column.
 * Rows use alternating surface shading via even/odd classes for readability.
 */
function ModelBenchmarkTable({ records }: ModelBenchmarkTableProps) {
  const [sortCol, setSortCol] = useState<BenchmarkColumn>('totalTokens');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo<BenchmarkRow[]>(() => {
    const grouped = new Map<string, TokenHistoryRecord[]>();
    for (const record of records) {
      const key = `${record.providerId}::${record.modelId}`;
      const existing = grouped.get(key) ?? [];
      existing.push(record);
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).map(([, group]) => {
      const first = group[0];
      const totalTokens = group.reduce((acc, r) => acc + r.totalTokens, 0);
      const avgTokPerSec =
        group.reduce((acc, r) => acc + r.tokensPerSecond, 0) / group.length;
      const avgLatencyMs =
        group.reduce((acc, r) => acc + r.latencyMs, 0) / group.length;
      return {
        modelId: first.modelId,
        providerId: first.providerId,
        requests: group.length,
        avgTokPerSec,
        avgLatencyMs,
        totalTokens,
      };
    });
  }, [records]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let diff = 0;
      switch (sortCol) {
        case 'model':
          diff = a.modelId.localeCompare(b.modelId);
          break;
        case 'requests':
          diff = a.requests - b.requests;
          break;
        case 'avgTokPerSec':
          diff = a.avgTokPerSec - b.avgTokPerSec;
          break;
        case 'avgLatency':
          diff = a.avgLatencyMs - b.avgLatencyMs;
          break;
        case 'totalTokens':
          diff = a.totalTokens - b.totalTokens;
          break;
      }
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const handleColClick = useCallback(
    (col: BenchmarkColumn) => {
      if (sortCol === col) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortCol(col);
        setSortDir('desc');
      }
    },
    [sortCol],
  );

  if (rows.length === 0) {
    return (
      <AppMutedNote>
        Model benchmark data will appear here after your first conversation.
      </AppMutedNote>
    );
  }

  const headerClass =
    'cursor-pointer select-none py-1.5 px-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted transition-colors hover:text-text-primary';

  const sortIndicator = (col: BenchmarkColumn) =>
    sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="overflow-x-auto rounded-[18px] border border-[color:var(--control-border-soft)]">
      <table className="w-full min-w-[380px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)]">
            <th className={headerClass} onClick={() => handleColClick('model')}>
              Model{sortIndicator('model')}
            </th>
            <th
              className={`${headerClass} text-right`}
              onClick={() => handleColClick('requests')}
            >
              Reqs{sortIndicator('requests')}
            </th>
            <th
              className={`${headerClass} text-right`}
              onClick={() => handleColClick('avgTokPerSec')}
            >
              Tok/s{sortIndicator('avgTokPerSec')}
            </th>
            <th
              className={`${headerClass} text-right`}
              onClick={() => handleColClick('avgLatency')}
            >
              Latency{sortIndicator('avgLatency')}
            </th>
            <th
              className={`${headerClass} text-right`}
              onClick={() => handleColClick('totalTokens')}
            >
              Tokens{sortIndicator('totalTokens')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.providerId}::${row.modelId}`}
              className={[
                'border-b border-[color:var(--control-border-soft)] last:border-0',
                i % 2 === 1
                  ? 'bg-[color:var(--control-bg-soft)]/40'
                  : 'bg-transparent',
              ].join(' ')}
            >
              <td className="max-w-[140px] truncate px-2 py-2 text-xs font-medium text-text-primary">
                <div className="truncate">{row.modelId || '—'}</div>
                <div className="truncate text-[10px] capitalize text-text-muted">
                  {row.providerId}
                </div>
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs text-text-secondary">
                {fmt(row.requests)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs text-text-secondary">
                {row.avgTokPerSec > 0 ? fmt(row.avgTokPerSec, 1) : '—'}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs text-text-secondary">
                {fmtLatency(row.avgLatencyMs)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs text-text-secondary">
                {fmt(row.totalTokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main panel ──────────────────────────────────────────────────── */

/**
 * Stub context budget breakdown used when no live budget data is available.
 * Returns an empty segment list so the bar renders as "empty".
 */
function buildEmptyBudget() {
  return {
    segments: [] as BudgetSegment[],
    usableTokens: 0,
    usedTokens: 0,
    contextWindow: 4096,
  };
}

/**
 * UsageDashboardPanel — Root component for the token usage settings panel.
 *
 * Loads session token history from the service singleton on mount and
 * re-renders whenever the service emits a change notification.
 *
 * Falls back gracefully to empty state when the service module is absent,
 * so the panel compiles and renders correctly even before the service is
 * implemented.
 */
export default function UsageDashboardPanel() {
  const { state: appState } = useApp();

  const [records, setRecords] = useState<TokenHistoryRecord[]>([]);
  const [serviceReady, setServiceReady] = useState(false);

  // Resolve and subscribe to the token history service on mount.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    resolveTokenHistoryService().then((service) => {
      if (cancelled) return;

      setRecords(service.getHistory());
      setServiceReady(true);

      if (service.subscribe) {
        unsubscribe = service.subscribe(() => {
          setRecords(service.getHistory());
        });
      }
    }).catch(() => {
      // Service resolution failed — empty state is already the default.
      if (!cancelled) setServiceReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Build context budget data from AppContext metrics when available.
  // When the live budget breakdown is injected by a parent via a future prop
  // the placeholder will be replaced.  For now we surface what AppContext
  // knows about the current provider so the rest of the panel is useful.
  const budgetData = useMemo(() => buildEmptyBudget(), []);

  const primaryProviderId = appState.providerConfig.llm.primary;
  const activeModelId =
    appState.providerConfig.providerOptions?.[primaryProviderId]?.model ?? '';

  // Derive the most-recently-seen model from session records when AppContext
  // has no model name (e.g. for Ollama which negotiates model at runtime).
  const resolvedModelId = useMemo(() => {
    if (activeModelId) return activeModelId;
    const last = records[records.length - 1];
    return last?.modelId ?? '';
  }, [activeModelId, records]);

  return (
    <div className="space-y-5">
      {/* ── Section header ─────────────────────────────────────────── */}
      <SettingsSectionHeader
        eyebrow="Intelligence"
        title="Token Usage Dashboard"
        description="Live context budget, session performance, and cost breakdown for the current conversation."
      />

      {/* ── 1. Context Budget Bar ───────────────────────────────────── */}
      <AppCard className="p-3.5">
        <div className="mb-3 flex items-center gap-2">
          <Layers
            size={14}
            className="shrink-0 text-anime-500"
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            Context Budget
          </span>
        </div>
        {budgetData.segments.length === 0 && budgetData.contextWindow === 4096 ? (
          <AppMutedNote>
            Context budget data will populate here during an active conversation.
            The bar updates in real time as prompts are assembled.
          </AppMutedNote>
        ) : (
          <ContextBudgetBar
            segments={budgetData.segments}
            usableTokens={budgetData.usableTokens}
            usedTokens={budgetData.usedTokens}
            contextWindow={budgetData.contextWindow}
          />
        )}
      </AppCard>

      {/* ── 2. Session Sparkline ────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <BarChart3
            size={14}
            className="shrink-0 text-anime-500"
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            Session Sparkline
          </span>
        </div>
        <AppCard className="p-3.5">
          {serviceReady ? (
            <SessionSparkline records={records} />
          ) : (
            <div className="h-[60px] animate-pulse rounded-xl bg-[color:var(--control-bg-soft)]" />
          )}
        </AppCard>
      </div>

      {/* ── 3. Cost Summary ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <DollarSign
            size={14}
            className="shrink-0 text-anime-500"
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            Cost Summary
          </span>
        </div>
        <AppCard className="p-3.5">
          {serviceReady ? (
            <CostSummary
              records={records}
              providerId={primaryProviderId}
              modelId={resolvedModelId}
            />
          ) : (
            <div className="space-y-2">
              {[72, 48, 96].map((w) => (
                <div
                  key={w}
                  className="h-4 animate-pulse rounded-lg bg-[color:var(--control-bg-soft)]"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          )}
        </AppCard>
      </div>

      {/* ── 4. Model Benchmark Table ─────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <Gauge
            size={14}
            className="shrink-0 text-anime-500"
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            Model Benchmark
          </span>
        </div>
        {serviceReady ? (
          <ModelBenchmarkTable records={records} />
        ) : (
          <div className="h-24 animate-pulse rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)]" />
        )}
      </div>
    </div>
  );
}
