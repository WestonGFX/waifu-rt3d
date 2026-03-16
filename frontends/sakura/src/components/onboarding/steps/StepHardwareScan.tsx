import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Loader2, ChevronRight, Cpu } from 'lucide-react';
import { api } from '../../../lib/api';
import type { WizardStepProps } from '../../wizard/WizardShell';

/* ── Scan result types ────────────────────────────────────────────────── */

interface ScanRow {
  label: string;
  status: 'pending' | 'ok' | 'fail';
  detail: string;
}

/**
 * Onboarding Step 1: System / Hardware Scan.
 *
 * Fires 4+ parallel API calls on mount and renders an animated checklist.
 * Results are stored in `wizardData` so downstream steps (LLM, Voice)
 * can auto-fill based on detected hardware and services.
 */
export function StepHardwareScan({ onNext, onSkip, setWizardData }: WizardStepProps) {
  const [rows, setRows] = useState<ScanRow[]>([
    { label: 'Hardware', status: 'pending', detail: 'Scanning...' },
    { label: 'LM Studio', status: 'pending', detail: 'Checking...' },
    { label: 'Ollama', status: 'pending', detail: 'Checking...' },
    { label: 'Database', status: 'pending', detail: 'Checking...' },
    { label: 'Character Art', status: 'pending', detail: 'Scanning...' },
  ]);

  const [autoDetected, setAutoDetected] = useState<{
    provider?: string;
    model?: string;
    endpoint?: string;
  } | null>(null);

  /** Update a single row by index. */
  const updateRow = (idx: number, patch: Partial<ScanRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  useEffect(() => {
    let cancelled = false;
    const data: Record<string, unknown> = {};

    // 1. Hardware info
    const scanHardware = async () => {
      try {
        const hw = await api.getHardwareInfo();
        if (cancelled) return;
        const parts: string[] = [];
        if (hw.gpu) parts.push(hw.gpu);
        if (hw.vram_gb) parts.push(`${hw.vram_gb.toFixed(1)} GB VRAM`);
        if (hw.ram_gb) parts.push(`${hw.ram_gb.toFixed(0)} GB RAM`);
        data.gpu_name = hw.gpu || null;
        data.vram_mb = (hw.vram_gb || 0) * 1024;
        data.ram_mb = (hw.ram_gb || 0) * 1024;
        updateRow(0, {
          status: 'ok',
          detail: parts.length > 0 ? parts.join(' · ') : 'No GPU detected',
        });
      } catch {
        if (!cancelled) updateRow(0, { status: 'fail', detail: 'Could not detect hardware' });
      }
    };

    // 2. LM Studio
    const scanLMStudio = async () => {
      try {
        const res = await fetch('/api/lm-studio/models');
        if (!res.ok) throw new Error('not ok');
        const body = await res.json();
        if (cancelled) return;
        const models = body.models || body.data || [];
        const loaded = models.find((m: { state?: string }) => m.state === 'loaded');
        data.lmStudioModels = models;
        data.lmStudioLoaded = loaded || null;
        if (models.length > 0) {
          const detail = loaded
            ? `${models.length} models (${loaded.id} loaded)`
            : `${models.length} models available`;
          updateRow(1, { status: 'ok', detail });
        } else {
          updateRow(1, { status: 'ok', detail: 'Connected, no models' });
        }
      } catch {
        if (!cancelled) {
          data.lmStudioModels = [];
          updateRow(1, { status: 'fail', detail: 'Not detected' });
        }
      }
    };

    // 3. Ollama
    const scanOllama = async () => {
      try {
        const res = await fetch('/api/ollama/models');
        if (!res.ok) throw new Error('not ok');
        const body = await res.json();
        if (cancelled) return;
        const models = body.models || [];
        data.ollamaModels = models;
        if (models.length > 0) {
          updateRow(2, { status: 'ok', detail: `${models.length} models available` });
        } else {
          updateRow(2, { status: 'ok', detail: 'Connected, no models' });
        }
      } catch {
        if (!cancelled) {
          data.ollamaModels = [];
          updateRow(2, { status: 'fail', detail: 'Not detected' });
        }
      }
    };

    // 4. Database + vector store via health check
    const scanHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const body = await res.json();
        if (cancelled) return;
        const services = body.services || {};
        const parts: string[] = [];
        if (services.database === 'connected') parts.push('Database OK');
        if (services.vector_store === 'active') parts.push('Vector store active');
        data.health = services;
        updateRow(3, {
          status: parts.length > 0 ? 'ok' : 'fail',
          detail: parts.length > 0 ? parts.join(' · ') : 'Issues detected',
        });
      } catch {
        if (!cancelled) updateRow(3, { status: 'fail', detail: 'Backend unreachable' });
      }
    };

    // 5. Character art scan
    const scanImages = async () => {
      try {
        const images = await api.scanImages();
        if (cancelled) return;
        data.availableImages = images;
        updateRow(4, {
          status: 'ok',
          detail: images.length > 0
            ? `${images.length} images available in storage`
            : 'No images found',
        });
      } catch {
        if (!cancelled) {
          data.availableImages = [];
          updateRow(4, { status: 'fail', detail: 'Could not scan' });
        }
      }
    };

    // Fire all in parallel, then set wizard data
    Promise.allSettled([scanHardware(), scanLMStudio(), scanOllama(), scanHealth(), scanImages()])
      .then(() => {
        if (cancelled) return;
        setWizardData(data);

        // Auto-detect best provider
        const lmLoaded = data.lmStudioLoaded as { id: string } | null;
        const lmModels = (data.lmStudioModels as unknown[]) || [];
        const ollamaModels = (data.ollamaModels as unknown[]) || [];

        if (lmLoaded) {
          setAutoDetected({
            provider: 'lmstudio',
            model: lmLoaded.id,
            endpoint: 'http://localhost:1234/v1',
          });
        } else if (lmModels.length > 0) {
          setAutoDetected({
            provider: 'lmstudio',
            endpoint: 'http://localhost:1234/v1',
          });
        } else if (ollamaModels.length > 0) {
          setAutoDetected({
            provider: 'ollama',
            endpoint: 'http://localhost:11434/v1',
          });
        }
      });

    return () => { cancelled = true; };
  }, []);

  /** Whether all scans have completed (no more pending). */
  const allDone = rows.every(r => r.status !== 'pending');

  /** Use auto-detected provider and skip LLM setup step. */
  const handleUseDetected = () => {
    if (autoDetected) {
      setWizardData({
        autoProvider: autoDetected.provider,
        autoModel: autoDetected.model || '',
        autoEndpoint: autoDetected.endpoint || '',
      });
    }
    onNext();
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <div className="flex items-center gap-3 mb-1">
        <Cpu size={20} style={{ color: 'var(--color-accent)' }} />
        <h2
          className="char-name-display"
          style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}
        >
          System Scan
        </h2>
      </div>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Checking your hardware and available AI services...
      </p>

      {/* Scan rows */}
      <div className="flex flex-col gap-2 mb-6">
        {rows.map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.2, duration: 0.2 }}
            className="flex items-center gap-3 p-2.5 rounded-lg"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Status icon */}
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              {row.status === 'pending' && (
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
              )}
              {row.status === 'ok' && (
                <Check size={14} style={{ color: 'var(--color-success, #22c55e)' }} />
              )}
              {row.status === 'fail' && (
                <X size={14} style={{ color: 'var(--color-danger)' }} />
              )}
            </div>

            {/* Label + detail */}
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {row.label}
              </span>
              <span className="text-[10px] ml-2" style={{ color: 'var(--color-text-tertiary)' }}>
                {row.detail}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Auto-detected shortcut */}
      {allDone && autoDetected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl mb-5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-success)' }}>
            We found {autoDetected.provider === 'lmstudio' ? 'LM Studio' : 'Ollama'}
            {autoDetected.model ? ` with ${autoDetected.model}` : ''} — use this?
          </p>
          <button
            onClick={handleUseDetected}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'var(--color-accent-gradient)',
              color: 'var(--color-accent-text)',
            }}
          >
            Use {autoDetected.provider === 'lmstudio' ? 'LM Studio' : 'Ollama'} <ChevronRight size={12} />
          </button>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onSkip} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Skip
        </button>
        <button
          onClick={onNext}
          disabled={!allDone}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
