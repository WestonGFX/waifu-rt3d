import { type ProviderOptionsBag } from '../types/index.ts';
import { type HelperCapabilities, type ModelCatalogEntry, type RuntimeModelInfo } from '../types/companion.ts';

export interface ModelRecommendationPreset {
  id: 'balanced' | 'extended' | 'max';
  label: string;
  contextWindow: number;
  summary: string;
}

export interface ModelRecommendation {
  hardwareLabel: string;
  totalMemoryGb?: number;
  recommendedWorkingSetGb?: number;
  recommendedContextWindow: number;
  presets: ModelRecommendationPreset[];
  recommendedKeepWarm: boolean;
  recommendedKeepAlive: string;
  recommendedTools: boolean;
  recommendedReasoning: boolean;
  recommendedVision: boolean;
  rationale: string[];
  caution?: string;
}

function toGb(bytes?: number | null): number | undefined {
  if (!bytes || bytes <= 0) return undefined;
  return bytes / (1024 ** 3);
}

function parseParameterSize(parameterSize?: string | null): number | undefined {
  if (!parameterSize) return undefined;
  const normalized = parameterSize.trim().toUpperCase();
  const match = normalized.match(/^([\d.]+)\s*([BM])$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return undefined;
  return match[2] === 'M' ? value / 1000 : value;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((left, right) => left - right);
}

function clampContext(value: number, maxContextWindow: number): number {
  return Math.max(4096, Math.min(maxContextWindow, value));
}

function buildPresets(maxContextWindow: number, preferredContextWindow: number): ModelRecommendationPreset[] {
  const options = uniqueSorted([
    preferredContextWindow,
    clampContext(preferredContextWindow * 2, maxContextWindow),
    maxContextWindow,
  ]);

  const labels: Record<ModelRecommendationPreset['id'], string> = {
    balanced: 'Balanced',
    extended: 'Extended',
    max: 'Maximum',
  };

  const ids: ModelRecommendationPreset['id'][] = ['balanced', 'extended', 'max'];

  return options.map((contextWindow, index) => {
    const id = ids[Math.min(index, ids.length - 1)];
    const summary = id === 'balanced'
      ? 'Best everyday latency and memory headroom.'
      : id === 'extended'
        ? 'Longer memory continuity with a moderate latency hit.'
        : 'Only use when the conversation genuinely needs the full window.';

    return {
      id,
      label: labels[id],
      contextWindow,
      summary,
    };
  });
}

export function buildModelRecommendation(
  runtimeModel: RuntimeModelInfo | undefined,
  helperCapabilities: HelperCapabilities | null,
): ModelRecommendation | null {
  if (!runtimeModel?.contextWindow) return null;

  const maxContextWindow = runtimeModel.contextWindow;
  const totalMemoryGb = toGb(helperCapabilities?.system.totalMemoryBytes);
  const recommendedWorkingSetGb = toGb(helperCapabilities?.system.recommendedMaxWorkingSetBytes);
  const parameterSize = parseParameterSize(runtimeModel.parameterSize);
  const machineLabel = [
    helperCapabilities?.system.chip,
    helperCapabilities?.system.machineModel,
  ].filter(Boolean).join(' · ') || 'Current machine';

  let preferredContextWindow = maxContextWindow;

  if (recommendedWorkingSetGb !== undefined) {
    if (recommendedWorkingSetGb < 12) preferredContextWindow = Math.min(maxContextWindow, 16_384);
    else if (recommendedWorkingSetGb < 18) preferredContextWindow = Math.min(maxContextWindow, 32_768);
    else if (recommendedWorkingSetGb < 24) preferredContextWindow = Math.min(maxContextWindow, 65_536);
    else preferredContextWindow = Math.min(maxContextWindow, 131_072);
  } else if (totalMemoryGb !== undefined) {
    if (totalMemoryGb < 16) preferredContextWindow = Math.min(maxContextWindow, 16_384);
    else if (totalMemoryGb < 24) preferredContextWindow = Math.min(maxContextWindow, 32_768);
    else if (totalMemoryGb < 40) preferredContextWindow = Math.min(maxContextWindow, 65_536);
    else preferredContextWindow = Math.min(maxContextWindow, 131_072);
  }

  if (parameterSize !== undefined) {
    if (parameterSize >= 10) preferredContextWindow = Math.min(preferredContextWindow, 32_768);
    else if (parameterSize >= 7) preferredContextWindow = Math.min(preferredContextWindow, 65_536);
  }

  if (runtimeModel.supportsVision) {
    preferredContextWindow = Math.min(preferredContextWindow, 65_536);
  }

  preferredContextWindow = clampContext(preferredContextWindow, maxContextWindow);

  const rationale = [
    `${runtimeModel.id} reports a hard maximum of ${maxContextWindow.toLocaleString()} tokens.`,
  ];

  if (totalMemoryGb !== undefined) {
    rationale.push(`${machineLabel} has about ${totalMemoryGb.toFixed(1)} GB of unified memory.`);
  }
  if (recommendedWorkingSetGb !== undefined) {
    rationale.push(`Metal recommends keeping active GPU working sets around ${recommendedWorkingSetGb.toFixed(2)} GB or lower.`);
  }
  if (parameterSize !== undefined) {
    rationale.push(`${runtimeModel.parameterSize} at ${runtimeModel.quantizationLevel ?? 'unknown quant'} is light enough for long chat, but larger contexts still inflate KV cache and first-token latency.`);
  }
  if (runtimeModel.supportsVision) {
    rationale.push('Vision-capable models are more comfortable when the default context is not pushed to the absolute maximum.');
  }

  let caution: string | undefined;
  if (maxContextWindow >= 262_144) {
    caution = '256k-class contexts are possible here, but they should stay an intentional power-user mode rather than the everyday default.';
  } else if (maxContextWindow >= 131_072) {
    caution = '128k is usable on this machine, but 64k remains the better default for responsiveness while AnimeGirly, the browser, and the viewer are all running together.';
  }

  return {
    hardwareLabel: machineLabel,
    totalMemoryGb,
    recommendedWorkingSetGb,
    recommendedContextWindow: preferredContextWindow,
    presets: buildPresets(maxContextWindow, preferredContextWindow),
    recommendedKeepWarm: true,
    recommendedKeepAlive: recommendedWorkingSetGb !== undefined && recommendedWorkingSetGb < 20 ? '15m' : '30m',
    recommendedTools: runtimeModel.supportsTools,
    recommendedReasoning: runtimeModel.supportsReasoning,
    recommendedVision: runtimeModel.supportsVision,
    rationale,
    caution,
  };
}

export function buildRecommendedProviderPatch(
  runtimeModel: RuntimeModelInfo | undefined,
  helperCapabilities: HelperCapabilities | null,
): Partial<ProviderOptionsBag> | null {
  const recommendation = buildModelRecommendation(runtimeModel, helperCapabilities);
  if (!recommendation) return null;

  return {
    autoTune: true,
    contextWindow: recommendation.recommendedContextWindow,
    keepModelWarm: recommendation.recommendedKeepWarm,
    keepAlive: recommendation.recommendedKeepAlive,
    enableTools: recommendation.recommendedTools,
    enableReasoning: recommendation.recommendedReasoning,
    enableVision: recommendation.recommendedVision,
  };
}

export function needsProviderPatch(
  options: ProviderOptionsBag,
  patch: Partial<ProviderOptionsBag> | null,
): boolean {
  if (!patch) return false;
  return Object.entries(patch).some(([key, value]) => options[key as keyof ProviderOptionsBag] !== value);
}

export function formatHardwareMemoryLabel(helperCapabilities: HelperCapabilities | null): string {
  const system = helperCapabilities?.system;
  if (!system) return 'Hardware data unavailable';
  const parts = [
    system.chip,
    system.machineModel,
  ].filter(Boolean);
  const memoryGb = toGb(system.totalMemoryBytes);
  if (memoryGb !== undefined) parts.push(`${memoryGb.toFixed(0)} GB unified memory`);
  return parts.join(' · ') || 'Hardware data unavailable';
}

/* ── Hardware compatibility for catalog models ────────────────── */

export type HardwareCompatibility = 'compatible' | 'tight' | 'incompatible' | 'unknown';

/**
 * Check hardware compatibility for a catalog model entry.
 *
 * Compares the model's stated min RAM and VRAM requirements against the
 * detected hardware from the helper capabilities probe.
 *
 * @param entry - Model catalog entry with hardware requirements.
 * @param capabilities - Helper capabilities containing system hardware info.
 * @returns Compatibility level: compatible (green), tight (yellow), incompatible (red), or unknown.
 */
export function checkModelHardwareCompatibility(
  entry: ModelCatalogEntry,
  capabilities: HelperCapabilities | null,
): HardwareCompatibility {
  if (!capabilities?.system) return 'unknown';

  const system = capabilities.system;
  const ramGb = toGb(system.totalMemoryBytes);
  const vramGb = toGb(system.vramBytes);

  if (!ramGb) return 'unknown';

  // Check RAM requirement
  if (entry.minRamGb && ramGb < entry.minRamGb * 0.8) return 'incompatible';
  if (entry.minRamGb && ramGb < entry.minRamGb * 1.2) return 'tight';

  // Check VRAM requirement (only for models that need dedicated GPU)
  if (entry.minVramGb && vramGb !== undefined) {
    if (vramGb < entry.minVramGb * 0.8) return 'incompatible';
    if (vramGb < entry.minVramGb * 1.2) return 'tight';
  }

  return 'compatible';
}

/**
 * Recommend the best models of a given type for the user's hardware.
 *
 * Sorts by compatibility (compatible first), then by recommendation flag,
 * then by quality tier (premium > balanced > starter > experimental).
 *
 * @param catalog - Full model catalog.
 * @param modelType - Filter to this model type.
 * @param capabilities - Helper capabilities for hardware checking.
 * @returns Sorted catalog entries with the best recommendations first.
 */
export function getRecommendedModels(
  catalog: ModelCatalogEntry[],
  modelType: ModelCatalogEntry['type'],
  capabilities: HelperCapabilities | null,
): ModelCatalogEntry[] {
  const filtered = catalog.filter((entry) => entry.type === modelType);

  const tierOrder: Record<string, number> = { premium: 0, balanced: 1, starter: 2, experimental: 3 };
  const compatOrder: Record<HardwareCompatibility, number> = { compatible: 0, tight: 1, unknown: 2, incompatible: 3 };

  return [...filtered].sort((a, b) => {
    const aCompat = checkModelHardwareCompatibility(a, capabilities);
    const bCompat = checkModelHardwareCompatibility(b, capabilities);

    // Compatible models first
    const compatDiff = compatOrder[aCompat] - compatOrder[bCompat];
    if (compatDiff !== 0) return compatDiff;

    // Recommended models first
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;

    // Higher quality tier first
    return (tierOrder[a.qualityTier] ?? 9) - (tierOrder[b.qualityTier] ?? 9);
  });
}

/**
 * Format disk free space as a human-readable string.
 *
 * @param capabilities - Helper capabilities containing disk info.
 * @returns Formatted string like "128.5 GB free" or "Unknown".
 */
export function formatDiskFree(capabilities: HelperCapabilities | null): string {
  const diskFreeBytes = capabilities?.system?.diskFreeBytes;
  if (!diskFreeBytes) return 'Unknown';
  const gb = diskFreeBytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB free` : `${(diskFreeBytes / (1024 ** 2)).toFixed(0)} MB free`;
}

/**
 * Format a byte count as a human-readable size string.
 *
 * @param bytes - Size in bytes.
 * @returns Formatted string like "1.5 GB" or "320 MB".
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
