/**
 * useLLMProbe — runs ``GET /api/llm/probe`` once per session and exposes
 * an actionable warning (with character-voiced copy) plus a dismiss
 * mechanism that persists in ``localStorage`` keyed by warning code.
 *
 * Why this exists:
 *   The probe endpoint (session-46 commit ``6fc9de5``) returns clinical
 *   hints like *"Model qwen3.5 didn't return a token within 60s"*. That
 *   reads like an error log. For the v1-Lite declutter, we render the
 *   warning as a quiet italic aside in the character's voice — soft
 *   information, in the voice of the persona, never a popup.
 *
 * Caching strategy:
 *   - Module-level promise dedupes concurrent mounts.
 *   - ``sessionStorage`` caches the response across navigations within a
 *     tab session — the LLM config doesn't change mid-session, so a
 *     second probe round-trip would waste 5-60s of latency budget.
 *   - ``localStorage`` records dismissals per warning code so the same
 *     warning never re-pesters after the user has acknowledged it. The
 *     storage key includes the model name to re-arm dismissal when the
 *     user switches models.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type LLMProbeWarning =
  | 'reasoning_only'
  | 'slow_first_token'
  | 'endpoint_unreachable'
  | 'endpoint_error'
  | 'probe_failed';

export interface LLMProbeResult {
  warning: LLMProbeWarning | null;
  /** Character-voiced italic copy intended for inline display. */
  copy: string | null;
  /** Underlying clinical hint from the backend, kept for debug surfaces. */
  hint: string | null;
  model: string | null;
  /** Whether the active warning has been dismissed by the user. */
  dismissed: boolean;
  /** True until the probe finishes; banner should stay hidden during boot. */
  loading: boolean;
  dismiss: () => void;
}

const SESSION_KEY = 'llm_probe_v1';
const DISMISS_PREFIX = 'llm_probe_dismissed_v1';

interface CachedProbe {
  warning: LLMProbeWarning | null;
  hint: string | null;
  model: string;
}

let inFlight: Promise<CachedProbe | null> | null = null;

function readSession(): CachedProbe | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProbe;
  } catch {
    return null;
  }
}

function writeSession(c: CachedProbe): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(c));
  } catch {
    // sessionStorage can be unavailable in private browsing — non-fatal.
  }
}

function dismissKey(warning: LLMProbeWarning, model: string): string {
  return `${DISMISS_PREFIX}:${warning}:${model}`;
}

function isDismissed(warning: LLMProbeWarning, model: string): boolean {
  try {
    return localStorage.getItem(dismissKey(warning, model)) === '1';
  } catch {
    return false;
  }
}

function markDismissed(warning: LLMProbeWarning, model: string): void {
  try {
    localStorage.setItem(dismissKey(warning, model), '1');
  } catch {
    // ignore
  }
}

/**
 * Map a probe warning code to a soft, in-character aside.  Tone is
 * deliberately model-agnostic and persona-agnostic so any character can
 * "say it" without sounding wrong.  Italics wrap action-style asides
 * (matches the session-46 baseline "actions wrapped in asterisks" rule).
 */
export function copyForWarning(warning: LLMProbeWarning): string {
  switch (warning) {
    case 'reasoning_only':
      return "*tilts head* The model you're running thinks out loud — you'll see my thoughts before I find my voice. If you'd like to hear me clearly, load a non-reasoning model like gemma, llama-3, or mistral-nemo.";
    case 'slow_first_token':
      return '*soft smile* Replies might come slower today — the model is taking its time. Stay with me, okay?';
    case 'endpoint_unreachable':
      return "*looking around* I can't quite reach the model server right now. Could you check that LM Studio or Ollama is running? I'll be right here when it is.";
    case 'endpoint_error':
      return "*quiet* The model answered, but something's off with the response. Mind taking a look at LM Studio?";
    case 'probe_failed':
      return "*pauses* Something's not quite right on my end. The model connection didn't come through cleanly.";
  }
}

async function runProbe(): Promise<CachedProbe | null> {
  const cached = readSession();
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const resp = await api.llmProbe();
      const result: CachedProbe = {
        warning: resp.warning,
        hint: resp.hint,
        model: resp.model,
      };
      writeSession(result);
      return result;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function useLLMProbe(): LLMProbeResult {
  const [state, setState] = useState<{
    warning: LLMProbeWarning | null;
    hint: string | null;
    model: string | null;
    dismissed: boolean;
    loading: boolean;
  }>({
    warning: null,
    hint: null,
    model: null,
    dismissed: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    runProbe().then((result) => {
      if (cancelled) return;
      if (!result || !result.warning) {
        setState({
          warning: null,
          hint: null,
          model: result?.model ?? null,
          dismissed: false,
          loading: false,
        });
        return;
      }
      setState({
        warning: result.warning,
        hint: result.hint,
        model: result.model,
        dismissed: isDismissed(result.warning, result.model),
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    warning: state.warning,
    copy: state.warning ? copyForWarning(state.warning) : null,
    hint: state.hint,
    model: state.model,
    dismissed: state.dismissed,
    loading: state.loading,
    dismiss: () => {
      if (state.warning && state.model) {
        markDismissed(state.warning, state.model);
        setState((s) => ({ ...s, dismissed: true }));
      }
    },
  };
}

/**
 * Test-only helper to clear the module-level probe cache + storage
 * so a fresh probe runs on the next mount.  Not exported through
 * ``hooks/index`` and not referenced in production code.
 */
export function __resetLLMProbeCacheForTests(): void {
  inFlight = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
