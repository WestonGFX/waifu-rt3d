/**
 * useMemorialScene — Detects pending memorial scenes after bond level-ups.
 *
 * Watches the bondLevel from appStore (updated by useBondProgress after each
 * message exchange). When the level increases, polls
 * GET /api/characters/{charId}/bond/memorial-scene?level=N. If a scene is
 * returned, stores it in appStore and opens the 'memorialscene' overlay so
 * MemorialScene renders it.
 *
 * Also checks the first-memory endpoint on initial character load (level >= 1).
 *
 * @example
 *   // Inside ChatThread or a top-level hook:
 *   useMemorialScene(activeCharacter?.id ?? null);
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { MemorialSceneData } from '../components/MemorialScene';

/**
 * Polls for a pending memorial scene whenever the bond level increases.
 *
 * @param charId - Active character ID, or null when no character is selected.
 */
export function useMemorialScene(charId: number | null): void {
  const bondLevel = useAppStore(s => s.bondLevel);
  const prevLevelRef = useRef<number>(0);
  const checkedFirstMemory = useRef<number | null>(null);

  // Check first-memory once per character when bondLevel is set
  useEffect(() => {
    if (!charId || bondLevel === 0) return;
    if (checkedFirstMemory.current === charId) return;
    checkedFirstMemory.current = charId;

    api.getFirstMemory(charId)
      .then(res => {
        if (res.ok && res.scene) {
          useAppStore.setState({ pendingMemorialScene: res.scene });
          // memorialscene overlay removed — scene stored but not shown
        }
      })
      .catch(() => { /* non-critical */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId]);

  // Reset refs when character changes
  useEffect(() => {
    prevLevelRef.current = 0;
    checkedFirstMemory.current = null;
  }, [charId]);

  // Check for scene on level-up
  useEffect(() => {
    if (!charId || bondLevel === 0) return;
    const prev = prevLevelRef.current;

    if (bondLevel > prev && prev > 0) {
      // Level just increased — check for a pending memorial scene at the new level
      api.getMemorialScene(charId, bondLevel)
        .then(res => {
          if (res.ok && res.scene) {
            useAppStore.setState({ pendingMemorialScene: res.scene as MemorialSceneData });
            // memorialscene overlay removed — scene stored but not shown
          }
        })
        .catch(() => { /* non-critical */ });
    }

    prevLevelRef.current = bondLevel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId, bondLevel]);
}
