/**
 * Lorebook trigger scanner service — scans recent chat messages against lorebook
 * entries to determine which entries should be injected into the LLM context.
 *
 * Algorithm:
 *  1. Build a scan corpus from the most recent N messages.
 *  2. For each enabled, non-constant entry: test primary triggers (OR logic),
 *     and if selective, also require secondary triggers (AND logic).
 *  3. Constant entries are always included.
 *  4. Recursively scan activated entry content for further triggers.
 *  5. Sort by priority (desc) then insertionOrder (asc).
 *  6. Cut off at budget cap (15% of context window by default).
 *  7. Separate Author's Note entries from regular entries.
 */

import { type ChatMessage } from '../types/index.ts';
import {
  type LorebookEntry,
  type LorebookGlobalSettings,
  type LorebookScanResult,
} from '../types/lorebook.ts';
import { estimateTokenCount } from './contextBudgetService.ts';

/**
 * Tests whether a single trigger matches the scan corpus.
 *
 * @param corpus - Concatenated message text to search.
 * @param trigger - The trigger string (plain or regex).
 * @param caseSensitive - Whether to match case-sensitively.
 * @param useRegex - Whether to treat the trigger as a regex pattern.
 * @returns True if the trigger matches.
 */
export function matchesTrigger(
  corpus: string,
  trigger: string,
  caseSensitive: boolean,
  useRegex: boolean,
): boolean {
  if (!trigger.trim()) return false;

  if (useRegex) {
    try {
      const flags = caseSensitive ? '' : 'i';
      const regex = new RegExp(trigger, flags);
      return regex.test(corpus);
    } catch {
      // Invalid regex — skip silently
      return false;
    }
  }

  if (caseSensitive) {
    return corpus.includes(trigger);
  }
  return corpus.toLowerCase().includes(trigger.toLowerCase());
}

/**
 * Builds a scan corpus from recent messages.
 *
 * @param messages - All messages in the conversation.
 * @param scanDepth - Number of recent messages to include.
 * @returns Concatenated text of the last N messages.
 */
export function buildScanCorpus(messages: ChatMessage[], scanDepth: number): string {
  const recent = messages.slice(-scanDepth);
  return recent.map((m) => m.content).join('\n');
}

/**
 * Checks whether an entry's triggers match the scan corpus.
 *
 * @param entry - The lorebook entry to test.
 * @param corpus - The scan corpus text.
 * @returns True if the entry should activate.
 */
function entryTriggersMatch(entry: LorebookEntry, corpus: string): boolean {
  // Check primary triggers (OR logic — any one match suffices)
  const primaryMatch = entry.triggers.some((trigger) =>
    matchesTrigger(corpus, trigger, entry.caseSensitive, entry.useRegex),
  );

  if (!primaryMatch) return false;

  // If selective, also require at least one secondary trigger
  if (entry.selective && entry.secondaryTriggers.length > 0) {
    return entry.secondaryTriggers.some((trigger) =>
      matchesTrigger(corpus, trigger, entry.caseSensitive, entry.useRegex),
    );
  }

  return true;
}

/**
 * Scans lorebook entries against recent messages and returns activated entries
 * within the token budget.
 *
 * @param entries - All lorebook entries (should be pre-filtered to enabled only).
 * @param recentMessages - Recent chat messages for trigger scanning.
 * @param settings - Global lorebook scanner settings.
 * @param contextWindow - Total context window size in tokens (for budget calc).
 * @returns Scan result with activated entries, author's note, and budget metadata.
 *
 * @example
 * const result = scanForActivatedEntries(entries, messages, DEFAULT_LOREBOOK_SETTINGS);
 * // result.activatedEntries — inject into prompt
 * // result.authorsNote — splice into conversation turns at depth
 */
export function scanForActivatedEntries(
  entries: LorebookEntry[],
  recentMessages: ChatMessage[],
  settings: LorebookGlobalSettings,
  contextWindow = 4096,
): LorebookScanResult {
  if (entries.length === 0) {
    return { activatedEntries: [], authorsNote: null, totalTokens: 0, truncatedCount: 0 };
  }

  const enabledEntries = entries.filter((e) => e.enabled);
  const activated = new Set<string>();

  // Phase 1: Evaluate triggers
  for (const entry of enabledEntries) {
    if (entry.constant) {
      activated.add(entry.id);
      continue;
    }

    const scanDepth = entry.scanDepth > 0 ? entry.scanDepth : settings.defaultScanDepth;
    const corpus = buildScanCorpus(recentMessages, scanDepth);

    if (entryTriggersMatch(entry, corpus)) {
      activated.add(entry.id);
    }
  }

  // Phase 2: Recursive scanning (activated entry content triggers other entries)
  if (settings.recursiveScanning) {
    for (let pass = 0; pass < settings.maxRecursiveDepth; pass++) {
      const beforeSize = activated.size;

      // Build corpus from activated entry content
      const activatedContent = enabledEntries
        .filter((e) => activated.has(e.id))
        .map((e) => e.content)
        .join('\n');

      for (const entry of enabledEntries) {
        if (activated.has(entry.id)) continue; // Already activated
        if (entry.constant) continue; // Constants are already included

        if (entryTriggersMatch(entry, activatedContent)) {
          activated.add(entry.id);
        }
      }

      // No new activations — stop early
      if (activated.size === beforeSize) break;
    }
  }

  // Phase 3: Sort by priority (desc) then insertionOrder (asc)
  const activatedEntries = enabledEntries
    .filter((e) => activated.has(e.id))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.insertionOrder - b.insertionOrder;
    });

  // Phase 4: Separate Author's Note entries
  const authorsNoteEntry = activatedEntries.find((e) => e.isAuthorsNote);
  const regularEntries = activatedEntries.filter((e) => !e.isAuthorsNote);

  // Phase 5: Budget enforcement (15% cap)
  const maxTokens = Math.floor((contextWindow * settings.maxBudgetPercent) / 100);
  let totalTokens = 0;
  let truncatedCount = 0;
  const budgetedEntries: LorebookEntry[] = [];

  for (const entry of regularEntries) {
    const tokens = entry.tokenEstimate > 0
      ? entry.tokenEstimate
      : estimateTokenCount(entry.content);

    if (totalTokens + tokens > maxTokens) {
      truncatedCount++;
      continue;
    }

    totalTokens += tokens;
    budgetedEntries.push(entry);
  }

  // Build author's note result
  const authorsNote = authorsNoteEntry
    ? { content: authorsNoteEntry.content, depth: authorsNoteEntry.authorsNoteDepth }
    : null;

  return {
    activatedEntries: budgetedEntries,
    authorsNote,
    totalTokens,
    truncatedCount,
  };
}
