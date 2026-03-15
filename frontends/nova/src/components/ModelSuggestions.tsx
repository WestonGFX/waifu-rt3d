import { useState, useEffect, useCallback } from 'react';
import { Cpu, ChevronDown, Copy, Check, Zap, HardDrive, Gauge } from 'lucide-react';
import { api } from '../lib/api';
import type { ExtendedHardwareInfo } from '../lib/types';
import styles from './ModelSuggestions.module.css';

// ── Capability pill color mapping ────────────────────────────────────────────

/** Maps capability strings to CSS module class names for color-coded pills. */
const PILL_CLASS_MAP: Record<string, string> = {
  roleplay: styles.pillRoleplay,
  emotional: styles.pillRoleplay,
  uncensored: styles.pillUncensored,
  vision: styles.pillVision,
  reasoning: styles.pillReasoning,
  tools: styles.pillTools,
};

/**
 * Returns a human-readable label for a capability string.
 * Transforms known keys into display-friendly names; passes
 * through unknown capabilities as title-cased.
 *
 * @param cap - Raw capability string from the model data (e.g. "roleplay", "tools").
 * @returns Display label (e.g. "RP Tuned", "Vision", "Tools").
 */
function capLabel(cap: string): string {
  switch (cap) {
    case 'roleplay': return 'RP Tuned';
    case 'emotional': return 'Emotional';
    case 'uncensored': return 'Uncensored';
    case 'vision': return 'Vision';
    case 'reasoning': return 'Reasoning';
    case 'tools': return 'Tools';
    case 'chat': return 'Chat';
    default: return cap.charAt(0).toUpperCase() + cap.slice(1);
  }
}

/**
 * Returns a short quality badge from the raw quality_tier string.
 *
 * @param tier - Quality tier from model data (e.g. "very_good", "excellent").
 * @returns Short label like "A+", "A", "B+", "B".
 */
function qualityBadge(tier?: string): string {
  switch (tier) {
    case 'excellent': return 'A+';
    case 'very_good': return 'A';
    case 'good': return 'B+';
    case 'fair': return 'B';
    default: return '—';
  }
}

// ── Model card sub-component ─────────────────────────────────────────────────

interface ModelCardProps {
  model: NonNullable<ExtendedHardwareInfo['recommended_tier']>['models'][number];
}

/**
 * Compact card displaying a single recommended model with metadata and
 * capability pills. Includes a "Copy ID" button that copies the model's
 * HuggingFace repo ID (or internal ID) to the clipboard.
 *
 * @param props.model - Model entry from the recommended tier.
 */
function ModelCard({ model }: ModelCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const idToCopy = model.hf_id || model.id;
    try {
      await navigator.clipboard.writeText(idToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for environments where clipboard API is blocked
    }
  }, [model.hf_id, model.id]);

  // Filter out generic "chat" capability — it's implied
  const displayCaps = (model.capabilities || []).filter((c) => c !== 'chat');

  return (
    <div className={styles.modelCard}>
      {/* Row 1: Name + Quant */}
      <div className={styles.modelHeader}>
        <span className={styles.modelName} title={model.name || model.id}>
          {model.name || model.id}
        </span>
        {model.quant && (
          <span className={styles.modelQuant}>{model.quant}</span>
        )}
      </div>

      {/* Row 2: VRAM / Speed / Quality */}
      <div className={styles.modelMeta}>
        {model.vram_gb != null && (
          <span className={styles.modelMetaItem}>
            <HardDrive size={9} />
            {model.vram_gb} GB
          </span>
        )}
        {model.speed_estimate && (
          <span className={styles.modelMetaItem}>
            <Zap size={9} />
            {model.speed_estimate}
          </span>
        )}
        {model.quality_tier && (
          <span className={styles.modelMetaItem}>
            <Gauge size={9} />
            {qualityBadge(model.quality_tier)}
          </span>
        )}
      </div>

      {/* Row 3: Capability pills + Copy button */}
      <div className={styles.modelFooter}>
        <div className={styles.pillRow}>
          {displayCaps.map((cap) => (
            <span
              key={cap}
              className={`${styles.pill} ${PILL_CLASS_MAP[cap] || styles.pillDefault}`}
            >
              {capLabel(cap)}
            </span>
          ))}
        </div>
        <button
          className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ''}`}
          onClick={handleCopy}
          title={`Copy: ${model.hf_id || model.id}`}
          type="button"
        >
          {copied ? <Check size={9} /> : <Copy size={9} />}
          {copied ? 'OK' : 'ID'}
        </button>
      </div>
    </div>
  );
}

// ── Main ModelSuggestions component ──────────────────────────────────────────

/**
 * Hardware-aware model recommendation widget for the Nova Brain settings section.
 *
 * On mount, calls `GET /api/hardware-info` to detect the user's GPU/VRAM and
 * receive a matched model tier with recommended models. Renders:
 *
 * 1. A compact hardware info banner (GPU name + VRAM)
 * 2. A vertically stacked list of model cards with capability pills
 * 3. A "Copy ID" button per card for easy model loading
 *
 * The component is designed to be embedded inside a collapsible sub-section
 * within the Brain accordion of SettingsPanel.
 *
 * @example
 * ```tsx
 * <ModelSuggestions />
 * ```
 */
export function ModelSuggestions() {
  const [hwInfo, setHwInfo] = useState<ExtendedHardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getExtendedHardwareInfo()
      .then((res) => {
        setHwInfo(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <Cpu size={12} style={{ marginRight: 4 }} />
        Detecting hardware...
      </div>
    );
  }

  if (!hwInfo) {
    return (
      <div className={styles.empty}>
        Could not detect hardware info.
      </div>
    );
  }

  const { hardware, recommended_tier } = hwInfo;
  const models = recommended_tier?.models ?? [];

  return (
    <div className={styles.container}>
      {/* Hardware banner */}
      <div className={styles.hwBanner}>
        {hardware.gpu && (
          <div className={styles.hwRow}>
            <span className={styles.hwLabel}>GPU</span>
            <span className={styles.hwValue}>{hardware.gpu}</span>
          </div>
        )}
        {hardware.vram_gb != null && (
          <div className={styles.hwRow}>
            <span className={styles.hwLabel}>VRAM</span>
            <span className={styles.hwValue}>{hardware.vram_gb} GB</span>
          </div>
        )}
        {recommended_tier && (
          <span className={styles.tierLabel}>{recommended_tier.label}</span>
        )}
      </div>

      {/* Model cards */}
      {models.length > 0 ? (
        <div className={styles.modelList}>
          {models.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          No model recommendations for this hardware tier.
        </div>
      )}
    </div>
  );
}

// ── Collapsible wrapper for embedding in SettingsPanel ──────────────────────

/**
 * Collapsible "Recommended Models" sub-section that wraps ModelSuggestions.
 * Renders as a toggle header with chevron; body only mounts when expanded
 * (lazy-loads hardware info on first open).
 *
 * @example
 * ```tsx
 * // Inside Brain AccordionSection body:
 * <CollapsibleModelSuggestions />
 * ```
 */
export function CollapsibleModelSuggestions() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className={styles.toggleHeader} onClick={() => setOpen((v) => !v)}>
        <span className={styles.toggleTitle}>
          <Cpu size={11} />
          Recommended Models
        </span>
        <ChevronDown
          size={12}
          className={`${styles.toggleChevron} ${open ? styles.toggleChevronOpen : ''}`}
        />
      </div>
      {open && <ModelSuggestions />}
    </div>
  );
}
