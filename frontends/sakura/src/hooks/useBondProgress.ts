/**
 * Hook to poll bond progression state and detect level-ups.
 *
 * Fetches the character's bond state from the backend after each message
 * exchange (detected via messageCount changes). Bond level is used by the
 * Kokoro engine for NSFW tier admission (bondLevel >= 20 for Tier F).
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

    // Grant bond milestone achievements silently (no UI display — consumers removed in session-47)
    const prevLevel = store.bondLevel;
    if (level > prevLevel && prevLevel > 0) {
      for (const milestone of [10, 50, 90]) {
        if (prevLevel < milestone && level >= milestone) {
          api.grantAchievement(charId, `bond_${milestone}`).catch(() => {});
          break;
        }
      }
    }

    // Streak achievements — silent grant
    try {
      const streakRes = await api.getCharacterStreak(charId);
      const s = streakRes.streak ?? 0;
      for (const threshold of [3, 7, 30] as const) {
        if (s >= threshold) {
          api.grantAchievement(charId, `streak_${threshold}`).catch(() => {});
        }
      }
    } catch {
      // Streak API not available — silent fallback
    }
  } catch {
    // Bond API not available — silent fallback
  }
}

const MSG_ACHIEVEMENT_MILESTONES: Array<[number, string]> = [
  [1, 'first_message'],
  [100, 'messages_100'],
  [500, 'messages_500'],
];

export function useBondProgress(charId: number | null, messageCount: number): void {
  const initialFetch = useRef(false);
  const checkedMsgMilestones = useRef(new Set<string>());

  // Fetch on character change — reset milestone cache
  useEffect(() => {
    if (!charId) return;
    initialFetch.current = false;
    checkedMsgMilestones.current.clear();
    fetchBondState(charId);
  }, [charId]);

  // Fetch after each message exchange + check message-count achievements
  useEffect(() => {
    if (!charId || messageCount === 0) return;
    if (!initialFetch.current) {
      initialFetch.current = true;
      return;
    }
    fetchBondState(charId);

    // Grant first/100/500 message achievements silently
    for (const [threshold, key] of MSG_ACHIEVEMENT_MILESTONES) {
      if (messageCount === threshold && !checkedMsgMilestones.current.has(key)) {
        checkedMsgMilestones.current.add(key);
        api.grantAchievement(charId, key).catch(() => {});
      }
    }
  }, [charId, messageCount]);
}
