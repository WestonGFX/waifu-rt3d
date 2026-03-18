import { type GrowthEventName } from '../types/index.ts';

const GROWTH_METRICS_KEY = 'animegirly_growth_metrics';

interface GrowthMetricEntry {
  count: number;
  lastTrackedAt: number;
  lastPayload?: Record<string, string | number | boolean>;
}

type GrowthMetricsSnapshot = Partial<Record<GrowthEventName, GrowthMetricEntry>>;

function loadGrowthMetrics(): GrowthMetricsSnapshot {
  try {
    const raw = localStorage.getItem(GROWTH_METRICS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GrowthMetricsSnapshot;
  } catch {
    return {};
  }
}

function saveGrowthMetrics(snapshot: GrowthMetricsSnapshot): void {
  try {
    localStorage.setItem(GROWTH_METRICS_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures so tracking never blocks the chat flow.
  }
}

export function trackGrowthEvent(
  name: GrowthEventName,
  payload: Record<string, string | number | boolean> = {},
): void {
  const current = loadGrowthMetrics();
  const previous = current[name];

  current[name] = {
    count: (previous?.count ?? 0) + 1,
    lastTrackedAt: Date.now(),
    lastPayload: payload,
  };

  saveGrowthMetrics(current);

  window.dispatchEvent(new CustomEvent('animegirly:growth-event', {
    detail: { name, payload, trackedAt: current[name]?.lastTrackedAt ?? Date.now() },
  }));
}

export function getGrowthMetricCount(name: GrowthEventName): number {
  return loadGrowthMetrics()[name]?.count ?? 0;
}
