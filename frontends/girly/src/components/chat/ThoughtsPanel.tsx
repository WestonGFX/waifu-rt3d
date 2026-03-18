/**
 * ThoughtsPanel – companion inner monologue tray.
 *
 * Displays all messages in the current thread that carry extracted `<think>`
 * thoughts (populated by `SET_MESSAGE_THOUGHTS` in ChatContext). Each thought
 * is rendered as a dated card showing a preview of the visible message and the
 * full inner monologue text. Newest entries appear at the top.
 *
 * Intended to be embedded as a slide-out utility tray or any container that
 * wants to surface the companion's stream-of-consciousness reasoning.
 */

import { useState, useMemo } from 'react';
import { Brain } from 'lucide-react';
import { type ChatMessage } from '@/types/index.ts';
import {
  SettingsSectionHeader,
  SETTINGS_PANEL_SUBCARD,
  SETTINGS_INPUT,
} from '@/components/settings/SettingsPrimitives.tsx';

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Formats a Unix timestamp as a concise human-readable relative string.
 *
 * Rules:
 *   - < 60 s  → "just now"
 *   - < 60 min → "{n} min ago"
 *   - Same calendar day  → "today at HH:MM"
 *   - Yesterday          → "yesterday at HH:MM"
 *   - Older              → locale date string
 *
 * @param timestamp - Unix timestamp in milliseconds (Date.now() style).
 * @returns Human-readable relative time string.
 * @example
 *   formatRelativeTime(Date.now() - 45_000) // "just now"
 *   formatRelativeTime(Date.now() - 300_000) // "5 min ago"
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;

  const date = new Date(timestamp);
  const today = new Date();
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === todayStr) return `today at ${timeLabel}`;
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${timeLabel}`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Returns the first `maxLen` characters of a string, appending "…" if
 * truncated.
 *
 * @param text - Source string to truncate.
 * @param maxLen - Maximum character count before truncation (default 50).
 * @returns Truncated string with ellipsis if needed, original otherwise.
 */
function truncatePreview(text: string, maxLen = 50): string {
  const trimmed = text.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

/* ── Component ────────────────────────────────────────────────────── */

interface ThoughtsPanelProps {
  /** Full message array for the current thread (user + assistant). */
  messages: ChatMessage[];
}

/**
 * ThoughtsPanel component — a scrollable tray of the companion's inner
 * monologue across all messages that contain extracted `<think>` content.
 *
 * @param props.messages - The current thread's full message array.
 *
 * @example
 * <ThoughtsPanel messages={state.messages} />
 */
export default function ThoughtsPanel({ messages }: ThoughtsPanelProps) {
  const [filterText, setFilterText] = useState('');

  /** Messages with thoughts, newest first, case-insensitively filtered. */
  const thoughtMessages = useMemo(() => {
    const withThoughts = messages.filter(
      (m): m is ChatMessage & { thoughts: string } =>
        m.role === 'assistant' && typeof m.thoughts === 'string' && m.thoughts.trim().length > 0,
    );

    // Reverse so newest is first.
    const reversed = [...withThoughts].reverse();

    if (!filterText.trim()) return reversed;

    const needle = filterText.toLowerCase();
    return reversed.filter(
      (m) =>
        m.thoughts.toLowerCase().includes(needle) ||
        m.content.toLowerCase().includes(needle),
    );
  }, [messages, filterText]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <SettingsSectionHeader
        eyebrow="Companion"
        title="Inner Thoughts"
        description="The companion's internal monologue from &lt;think&gt; tags."
        aside={
          <Brain
            size={16}
            className="text-violet-400 opacity-70"
            aria-hidden="true"
          />
        }
      />

      {/* Search filter */}
      <input
        type="search"
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        placeholder="Filter thoughts…"
        aria-label="Filter inner thoughts"
        className={SETTINGS_INPUT}
      />

      {/* Thought card list */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
        {thoughtMessages.length === 0 ? (
          <div
            className={[
              SETTINGS_PANEL_SUBCARD,
              'text-xs leading-relaxed text-text-muted',
            ].join(' ')}
          >
            {filterText.trim()
              ? 'No thoughts match the current filter.'
              : 'No inner thoughts yet. The companion\u2019s internal monologue will appear here when she uses <think> tags.'}
          </div>
        ) : (
          thoughtMessages.map((m) => (
            <ThoughtCard key={m.id} message={m} />
          ))
        )}
      </div>
    </div>
  );
}

/* ── ThoughtCard ──────────────────────────────────────────────────── */

interface ThoughtCardProps {
  message: ChatMessage & { thoughts: string };
}

/**
 * ThoughtCard – single thought entry card.
 *
 * Shows the message timestamp, a truncated preview of the visible reply,
 * and the full inner monologue in italic with a violet left-border accent.
 *
 * @param props.message - An assistant ChatMessage guaranteed to have thoughts.
 */
function ThoughtCard({ message }: ThoughtCardProps) {
  return (
    <div className={SETTINGS_PANEL_SUBCARD}>
      {/* Meta row: timestamp + message preview */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] text-text-muted shrink-0">
          {formatRelativeTime(message.timestamp)}
        </span>
        <span className="text-xs text-text-muted truncate min-w-0">
          {truncatePreview(message.content)}
        </span>
      </div>

      {/* Inner monologue text */}
      <div className="border-l-2 border-anime-300 pl-3">
        <p className="italic text-text-secondary text-[12px] leading-relaxed whitespace-pre-wrap">
          {message.thoughts}
        </p>
      </div>
    </div>
  );
}
