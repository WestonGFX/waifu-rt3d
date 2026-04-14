/**
 * useScenarios — React hook for per-character scenario template management.
 *
 * Fetches the template list for a character and the currently active template
 * for a session. Exposes helpers to activate, deactivate, create, and delete
 * templates. All mutations trigger a refetch so the caller always has fresh data.
 *
 * @example
 *   const { templates, activeTemplate, loading, activate, deactivate } =
 *     useScenarios(charId, sessionId);
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ── Shared types ─────────────────────────────────────────────────────────────

/** A scenario template returned by the backend. */
export interface ScenarioTemplate {
  id: number;
  char_id: number;
  title: string;
  description: string;
  setting: string | null;
  time_of_day: string | null;
  mood: string | null;
  is_default: boolean;
  is_builtin: boolean;
  created_at: string;
}

/** Payload for creating a new custom scenario template. */
export interface CreateScenarioPayload {
  title: string;
  description: string;
  setting?: string;
  time_of_day?: string;
  mood?: string;
  is_default?: boolean;
}

/** Return value of the useScenarios hook. */
export interface UseScenariosResult {
  /** All templates for the character, sorted built-in first. */
  templates: ScenarioTemplate[];
  /** The currently active template for the session, or null if none. */
  activeTemplate: ScenarioTemplate | null;
  /** True while an API call is in-flight. */
  loading: boolean;
  /** Manually re-fetch templates and active state. */
  refetch: () => void;
  /**
   * Activate a template for the current session.
   *
   * @param templateId - Template primary key to activate.
   */
  activate: (templateId: number) => Promise<void>;
  /** Deactivate (clear) the active template for the current session. */
  deactivate: () => Promise<void>;
  /**
   * Create a new custom template and activate it for the session.
   *
   * @param payload - Title, description, and optional filter fields.
   */
  createCustom: (payload: CreateScenarioPayload) => Promise<void>;
  /**
   * Permanently delete a custom template.
   *
   * @param templateId - Template primary key to delete.
   */
  deleteTemplate: (templateId: number) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Per-character scenario template hook.
 *
 * Fetches template list and active-template state on mount (and whenever
 * charId / sessionId change). All mutation helpers automatically re-fetch
 * after the write so the UI stays in sync.
 *
 * @param charId - Character primary key (null disables all fetching).
 * @param sessionId - Session primary key (null disables active-template fetch).
 * @returns UseScenariosResult with templates, activeTemplate, and mutators.
 */
export function useScenarios(
  charId: number | null,
  sessionId: number | null,
): UseScenariosResult {
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ScenarioTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  // Incrementing this counter triggers the useEffect to re-fetch.
  const [fetchTick, setFetchTick] = useState(0);

  /** Trigger a re-fetch on the next render. */
  const refetch = useCallback(() => setFetchTick(t => t + 1), []);

  // ── Fetch templates + active state ────────────────────────────────────────

  useEffect(() => {
    if (!charId) {
      setTemplates([]);
      setActiveTemplate(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      try {
        const [tmplRes, activeRes] = await Promise.all([
          api.getScenarioTemplates(charId),
          sessionId
            ? api.getActiveScenarioTemplate(charId, sessionId)
            : Promise.resolve({ ok: true, template: null }),
        ]);

        if (cancelled) return;
        if (tmplRes.ok) setTemplates(tmplRes.templates);
        if (activeRes.ok) setActiveTemplate(activeRes.template);
      } catch {
        // Silent fallback — scenario API not yet available
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [charId, sessionId, fetchTick]);

  // ── Mutators ──────────────────────────────────────────────────────────────

  /**
   * Activate a template for the current session.
   *
   * @param templateId - Template primary key to activate.
   */
  const activate = useCallback(async (templateId: number) => {
    if (!sessionId) return;
    try {
      await api.activateScenarioTemplate(templateId, sessionId);
      refetch();
    } catch {
      // Silent — caller may handle UI feedback
    }
  }, [sessionId, refetch]);

  /**
   * Clear the active scenario template for the current session.
   */
  const deactivate = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.deactivateScenarioTemplate(sessionId);
      refetch();
    } catch {
      // Silent fallback
    }
  }, [sessionId, refetch]);

  /**
   * Create a new custom template and activate it for the session.
   *
   * @param payload - Title, description, and optional filter fields.
   */
  const createCustom = useCallback(async (payload: CreateScenarioPayload) => {
    if (!charId) return;
    try {
      const res = await api.createScenarioTemplate({ char_id: charId, ...payload });
      if (res.ok && sessionId) {
        await api.activateScenarioTemplate(res.template.id, sessionId);
      }
      refetch();
    } catch {
      // Silent fallback
    }
  }, [charId, sessionId, refetch]);

  /**
   * Permanently delete a custom template.
   *
   * @param templateId - Template primary key to delete.
   */
  const deleteTemplate = useCallback(async (templateId: number) => {
    try {
      await api.deleteScenarioTemplate(templateId);
      refetch();
    } catch {
      // Silent fallback
    }
  }, [refetch]);

  return { templates, activeTemplate, loading, refetch, activate, deactivate, createCustom, deleteTemplate };
}
