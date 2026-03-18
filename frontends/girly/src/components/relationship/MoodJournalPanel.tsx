/**
 * MoodJournalPanel — Daily mood check-in and historical journal view.
 *
 * Shows a persistent "Today" card where the user picks one of five moods
 * and writes a short note (max 500 chars). Below that, a reverse-chronological
 * scroll list surfaces past entries, pairing the user's note with the
 * companion's stored reflection and mood.
 *
 * Data flow:
 *  - On mount, loads all entries for the active persona via IndexedDB.
 *  - Today's entry is matched by YYYY-MM-DD date string. If none exists yet a
 *    skeleton record is kept in local state and only written to IndexedDB when
 *    the user commits a mood or note change.
 *  - The companion's mood/reflection are pre-populated from the stored record
 *    (written by the psychology engine) — this component never calls the LLM.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookHeart, Calendar, SmilePlus } from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import { type MoodJournalEntry, type UserMoodOption } from '@/types/relationship.ts';
import { MOOD_INFO_MAP } from '@/services/moodService.ts';
import {
  listMoodJournalForPersona,
  putMoodJournalEntry,
} from '@/services/appDb.ts';
import {
  AppCard,
  AppMutedNote,
  Button,
  SettingsSectionHeader,
  Textarea,
} from '@/components/settings/SettingsPrimitives.tsx';
import { SETTINGS_PANEL_SUBCARD } from '@/components/settings/SettingsPrimitives.tsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTE_MAX_LENGTH = 500;

/** Ordered mood picker options with display metadata. */
const MOOD_OPTIONS: { value: UserMoodOption; emoji: string; label: string }[] = [
  { value: 'great', emoji: '🌟', label: 'Great' },
  { value: 'good',  emoji: '😊', label: 'Good'  },
  { value: 'okay',  emoji: '😐', label: 'Okay'  },
  { value: 'low',   emoji: '😔', label: 'Low'   },
  { value: 'rough', emoji: '😫', label: 'Rough' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as a YYYY-MM-DD string in local time. */
function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a YYYY-MM-DD date string into a friendly display string.
 * Returns "Today" when the date matches the current local date.
 *
 * @param dateStr - ISO 8601 date string (YYYY-MM-DD).
 */
function formatEntryDate(dateStr: string): string {
  if (dateStr === todayDateString()) return 'Today';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    year:    'numeric',
  });
}

/**
 * Builds a new skeleton journal entry for today.
 * Only written to IndexedDB when the user makes a selection or saves a note.
 *
 * @param personaId - Active persona's ID.
 * @param threadId  - Active thread's ID.
 */
function makeTodayEntry(personaId: string, threadId: string): MoodJournalEntry {
  const now = Date.now();
  return {
    id: `journal_${todayDateString()}_${threadId}`,
    threadId,
    personaId,
    date: todayDateString(),
    userMood: null,
    userNote: '',
    companionMood: 'neutral',
    companionReflection: '',
    createdAt: now,
    updatedAt: now,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Five-button mood picker row.
 *
 * @param selected  - Currently selected mood value, or null.
 * @param onChange  - Called when a mood button is pressed.
 * @param disabled  - When true all buttons are visually disabled.
 */
function MoodPicker({
  selected,
  onChange,
  disabled = false,
}: {
  selected: UserMoodOption | null;
  onChange: (mood: UserMoodOption) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Pick your mood for today"
      className="flex flex-wrap gap-2"
    >
      {MOOD_OPTIONS.map(({ value, emoji, label }) => {
        const isActive = selected === value;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value)}
            aria-pressed={isActive}
            aria-label={`Mood: ${label}`}
            className={[
              'flex flex-col items-center gap-1 rounded-[18px] border px-3 py-2 text-center transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2',
              'focus-visible:ring-offset-[color:var(--control-ring-offset)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
              isActive
                ? 'border-anime-400 bg-anime-50/80 shadow-[0_8px_24px_-16px_var(--color-glow-primary,theme(colors.pink.300))]'
                : 'border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] hover:border-anime-300 hover:bg-anime-50/60',
            ].join(' ')}
          >
            <span role="img" aria-hidden="true" className="text-xl leading-none">
              {emoji}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A single past journal entry card in the history list.
 *
 * Shows the date, user mood + note on the left, and the companion's
 * stored mood icon + reflection on the right within a subcard.
 *
 * @param entry - The fully persisted journal entry to display.
 */
function JournalEntryCard({ entry }: { entry: MoodJournalEntry }) {
  const userMoodOption = MOOD_OPTIONS.find((m) => m.value === entry.userMood);
  const companionMoodInfo = MOOD_INFO_MAP[entry.companionMood as keyof typeof MOOD_INFO_MAP];

  return (
    <div
      className="rounded-[22px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] p-3.5 shadow-[var(--shell-shadow-soft)]"
      aria-label={`Journal entry for ${formatEntryDate(entry.date)}`}
    >
      {/* Date row */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          {formatEntryDate(entry.date)}
        </span>
      </div>

      <div className="space-y-2">
        {/* User section */}
        <div className={SETTINGS_PANEL_SUBCARD}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              You
            </span>
            {userMoodOption && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--control-bg)] px-2 py-0.5 text-[11px]"
                aria-label={`Your mood: ${userMoodOption.label}`}
              >
                <span role="img" aria-hidden="true">{userMoodOption.emoji}</span>
                <span className="font-medium text-[color:var(--text-secondary)]">{userMoodOption.label}</span>
              </span>
            )}
            {!userMoodOption && (
              <span className="text-[11px] italic text-[color:var(--text-muted)]">No mood logged</span>
            )}
          </div>
          {entry.userNote ? (
            <p className="text-sm leading-5.5 text-[color:var(--text-primary)]">{entry.userNote}</p>
          ) : (
            <p className="text-sm italic text-[color:var(--text-muted)]">No note written.</p>
          )}
        </div>

        {/* Companion section */}
        {(entry.companionReflection || entry.companionMood !== 'neutral') && (
          <div className={SETTINGS_PANEL_SUBCARD}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                Her
              </span>
              {companionMoodInfo && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full bg-[color:var(--control-bg)] px-2 py-0.5 text-[11px] ${companionMoodInfo.colorClass}`}
                  aria-label={`Companion mood: ${companionMoodInfo.label}`}
                >
                  <span role="img" aria-hidden="true">{companionMoodInfo.icon}</span>
                  <span className="font-medium">{companionMoodInfo.label}</span>
                </span>
              )}
            </div>
            {entry.companionReflection ? (
              <p className="text-sm italic leading-5.5 text-[color:var(--text-primary)]">
                &ldquo;{entry.companionReflection}&rdquo;
              </p>
            ) : (
              <p className="text-sm italic text-[color:var(--text-muted)]">No reflection yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Props for {@link MoodJournalPanel}.
 * The panel is self-contained and loads its own data — no props are required.
 */
export interface MoodJournalPanelProps {
  /** Optional extra CSS classes forwarded to the root wrapper. */
  className?: string;
}

/**
 * MoodJournalPanel — Self-contained daily mood journal for the active persona.
 *
 * Renders a today check-in (mood picker + freetext note) followed by a
 * scrollable list of past entries. All data is read from and written to
 * IndexedDB via the appDb service.
 *
 * The companion's mood and reflection shown in past entries are stored
 * values written by the psychology engine — this component never calls
 * the LLM directly.
 *
 * @example
 * <MoodJournalPanel />
 */
export default function MoodJournalPanel({ className }: MoodJournalPanelProps) {
  const { activePersona, currentThread } = useCompanion();
  const personaId = activePersona?.id ?? null;
  const threadId  = currentThread?.id ?? null;

  const [entries, setEntries]         = useState<MoodJournalEntry[]>([]);
  const [todayEntry, setTodayEntry]   = useState<MoodJournalEntry | null>(null);
  const [noteText, setNoteText]       = useState('');
  const [isSaving, setIsSaving]       = useState(false);
  const [isLoading, setIsLoading]     = useState(true);

  // Used to debounce note saves — we persist 1.2 s after the user stops typing.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    if (!personaId) {
      setEntries([]);
      setTodayEntry(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await listMoodJournalForPersona(personaId);
      const today  = todayDateString();
      const todayRecord = loaded.find((e) => e.date === today) ?? null;
      const past        = loaded.filter((e) => e.date !== today);

      if (todayRecord) {
        setTodayEntry(todayRecord);
        setNoteText(todayRecord.userNote);
      } else if (threadId) {
        // Build a local skeleton — not yet persisted
        const skeleton = makeTodayEntry(personaId, threadId);
        setTodayEntry(skeleton);
        setNoteText('');
      } else {
        setTodayEntry(null);
        setNoteText('');
      }

      setEntries(past);
    } finally {
      setIsLoading(false);
    }
  }, [personaId, threadId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Clean up any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Persistence helpers ──────────────────────────────────────────────────

  /**
   * Writes a draft entry to IndexedDB and updates local state.
   *
   * @param draft - The journal entry to persist.
   */
  const persistEntry = useCallback(async (draft: MoodJournalEntry) => {
    setIsSaving(true);
    try {
      await putMoodJournalEntry(draft);
      setTodayEntry(draft);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ── Mood selection ───────────────────────────────────────────────────────

  const handleMoodSelect = useCallback(
    (mood: UserMoodOption) => {
      if (!todayEntry) return;
      const updated: MoodJournalEntry = {
        ...todayEntry,
        userMood:  mood,
        updatedAt: Date.now(),
      };
      void persistEntry(updated);
    },
    [todayEntry, persistEntry],
  );

  // ── Note editing (debounced save) ────────────────────────────────────────

  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value.slice(0, NOTE_MAX_LENGTH);
      setNoteText(value);

      if (!todayEntry) return;

      // Debounce: cancel any pending save, schedule a new one
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const updated: MoodJournalEntry = {
          ...todayEntry,
          userNote:  value,
          updatedAt: Date.now(),
        };
        void persistEntry(updated);
      }, 1200);
    },
    [todayEntry, persistEntry],
  );

  // Flush the note immediately when the textarea loses focus
  const handleNoteBlur = useCallback(() => {
    if (!todayEntry) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const updated: MoodJournalEntry = {
      ...todayEntry,
      userNote:  noteText,
      updatedAt: Date.now(),
    };
    void persistEntry(updated);
  }, [todayEntry, noteText, persistEntry]);

  // ── Guard: no persona selected ───────────────────────────────────────────

  if (!personaId) {
    return (
      <div className={className}>
        <SettingsSectionHeader
          eyebrow="Mood Journal"
          title="Daily Journal"
          description="Check in each day with how you're feeling — she reads them all."
          aside={<BookHeart className="h-4 w-4 text-anime-400" />}
        />
        <AppMutedNote className="mt-4">
          Select a persona to start your mood journal together.
        </AppMutedNote>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const charsLeft       = NOTE_MAX_LENGTH - noteText.length;
  const charsNearLimit  = charsLeft <= 80;

  return (
    <div className={['space-y-4', className].filter(Boolean).join(' ')}>
      {/* Section header */}
      <SettingsSectionHeader
        eyebrow="Mood Journal"
        title="Daily Journal"
        description="A quiet space to check in. She remembers every entry."
        aside={<BookHeart className="h-4 w-4 text-anime-400" />}
      />

      {/* Today's entry card */}
      <AppCard className="p-3.5">
        <div className="mb-3 flex items-center gap-2">
          <SmilePlus className="h-4 w-4 shrink-0 text-anime-400" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            How are you feeling today?
          </span>
          {isSaving && (
            <span className="ml-auto text-[10px] text-[color:var(--text-muted)]" aria-live="polite">
              Saving…
            </span>
          )}
        </div>

        {/* Mood picker */}
        {todayEntry ? (
          <MoodPicker
            selected={todayEntry.userMood}
            onChange={handleMoodSelect}
            disabled={isSaving}
          />
        ) : (
          <AppMutedNote>
            Open or create a thread to unlock today&apos;s check-in.
          </AppMutedNote>
        )}

        {/* Note textarea */}
        {todayEntry && (
          <div className="mt-3">
            <Textarea
              value={noteText}
              onChange={handleNoteChange}
              onBlur={handleNoteBlur}
              disabled={isSaving}
              placeholder="Write a little note for yourself… or for her."
              maxLength={NOTE_MAX_LENGTH}
              aria-label="Today's journal note"
              className="min-h-[88px] resize-none text-sm"
            />
            <div className="mt-1 flex justify-end">
              <span
                className={[
                  'text-[10px] tabular-nums',
                  charsNearLimit
                    ? 'text-amber-500'
                    : 'text-[color:var(--text-muted)]',
                ].join(' ')}
                aria-live="polite"
                aria-label={`${charsLeft} characters remaining`}
              >
                {charsLeft} / {NOTE_MAX_LENGTH}
              </span>
            </div>
          </div>
        )}
      </AppCard>

      {/* Past entries */}
      {!isLoading && entries.length > 0 && (
        <div className="space-y-2">
          <SettingsSectionHeader
            eyebrow="History"
            title={`${entries.length} past ${entries.length === 1 ? 'entry' : 'entries'}`}
          />
          <div
            className="space-y-3"
            role="list"
            aria-label="Past journal entries"
          >
            {entries.map((entry) => (
              <div key={entry.id} role="listitem">
                <JournalEntryCard entry={entry} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && entries.length === 0 && todayEntry && (
        <AppMutedNote>
          No past entries yet. Check in today — this will be your first memory together.
        </AppMutedNote>
      )}

      {/* Loading skeleton placeholder */}
      {isLoading && (
        <AppMutedNote aria-busy="true">
          Loading journal entries…
        </AppMutedNote>
      )}

      {/* Save button — only shown when unsaved changes are queued */}
      {todayEntry && noteText !== todayEntry.userNote && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleNoteBlur}
            aria-label="Save today's journal note"
          >
            Save note
          </Button>
        </div>
      )}
    </div>
  );
}
