/**
 * Hook to poll bond progression state and detect level-ups.
 *
 * Fetches the character's bond state from the backend after each message
 * exchange (detected via messageCount changes). When a level-up is detected,
 * queues a celebration overlay via appStore.setPendingLevelUp().
 *
 * @param charId - Active character ID (null when no character selected).
 * @param messageCount - Current message count; triggers re-fetch on change.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/** Fetch bond state + unlocks and update appStore. Detect level-ups. */
async function fetchBondState(charId: number): Promise<void> {
  const store = useAppStore.getState();
  const prevLevel = store.bondLevel;

  try {
    const [bondRes, unlockRes] = await Promise.all([
      api.getBondLevel(charId),
      api.getBondUnlocks(charId),
    ]);

    const bond = bondRes.bond ?? bondRes;
    const level = bond.bond_level ?? 0;
    const xp = bond.bond_xp ?? 0;
    const xpToNext = bond.xp_to_next ?? 150;
    const tier = bond.tier ?? 'stranger';

    store.setBondState({
      bondLevel: level,
      bondXp: xp,
      bondXpToNext: xpToNext,
      bondTier: tier,
      bondNextUnlock: unlockRes.next_unlock ?? null,
    });

    // Detect level-up (only when level increased, not on first load)
    if (level > prevLevel && prevLevel > 0) {
      const prevTier = store.bondTier;
      const unlocks = (unlockRes.unlocked ?? [])
        .filter((u: { level?: number }) => u.level !== undefined && u.level > prevLevel && u.level <= level)
        .map((u: { type: string; label: string }) => ({ type: u.type, label: u.label }));

      store.setPendingLevelUp({
        newLevel: level,
        tier,
        previousTier: prevTier,
        unlocks,
      });
    }
  } catch {
    // Bond API not available — silent fallback
  }
}

export function useBondProgress(charId: number | null, messageCount: number): void {
  const initialFetch = useRef(false);

  // Fetch on character change
  useEffect(() => {
    if (!charId) return;
    initialFetch.current = false;
    fetchBondState(charId);
  }, [charId]);

  // Fetch after each message exchange
  useEffect(() => {
    if (!charId || messageCount === 0) return;
    // Skip the initial render — only fetch on actual message count changes
    if (!initialFetch.current) {
      initialFetch.current = true;
      return;
    }
    fetchBondState(charId);
  }, [charId, messageCount]);
}
