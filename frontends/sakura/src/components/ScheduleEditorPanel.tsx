import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Clock, CalendarCheck } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Valid schedule type keys understood by the backend. */
type ScheduleType = 'morning_greeting' | 'evening_check_in' | 'reminder' | 'custom';

/**
 * A single character message schedule entry as returned by the backend.
 */
interface Schedule {
  id: number;
  type: ScheduleType;
  /** 24-hour time string "HH:MM", e.g. "08:00". Null for non-time-based triggers. */
  time_of_day: string | null;
  /** Hours away from now (for relative schedules). Null when time_of_day is set. */
  hours_away: number | null;
  enabled: boolean;
  /** Optional custom prompt/template injected when the schedule fires. */
  message_template: string | null;
}

/** Payload sent to POST /api/characters/{id}/schedules. */
interface NewSchedulePayload {
  type: ScheduleType;
  time_of_day: string | null;
  message_template: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Human-readable labels for each schedule type. */
const TYPE_LABELS: Record<ScheduleType, string> = {
  morning_greeting: 'Morning Greeting',
  evening_check_in: 'Evening Check-in',
  reminder:         'Reminder',
  custom:           'Custom',
};

/** Default times suggested when a user picks a schedule type. */
const TYPE_DEFAULT_TIMES: Record<ScheduleType, string> = {
  morning_greeting: '08:00',
  evening_check_in: '20:00',
  reminder:         '12:00',
  custom:           '09:00',
};

const SCHEDULE_TYPES: ScheduleType[] = [
  'morning_greeting',
  'evening_check_in',
  'reminder',
  'custom',
];

/* ═══════════════════════════════════════════════════════════════════════
   Helper components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A small toggle switch styled to match the panel's design language.
 *
 * @param checked - Whether the toggle is on.
 * @param onChange - Callback when the user clicks the toggle.
 * @param disabled - When true, the toggle is greyed out and non-interactive.
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        border: 'none',
        padding: '2px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-border)',
        transition: 'background-color 0.2s',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

/**
 * Renders a single schedule row: type label, time badge, toggle, and delete.
 *
 * @param schedule - The schedule data to display.
 * @param onToggle - Called when the user flips the enabled switch.
 * @param onDelete - Called when the user clicks the trash button.
 * @param disabled - When true, both interactive controls are inert (during saves).
 */
function ScheduleRow({
  schedule,
  onToggle,
  onDelete,
  disabled,
}: {
  schedule: Schedule;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '8px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        opacity: schedule.enabled ? 1 : 0.6,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Clock icon */}
      <Clock size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />

      {/* Schedule info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
          }}
        >
          {TYPE_LABELS[schedule.type]}
        </p>
        {schedule.time_of_day && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '0.7rem',
              color: 'var(--color-text-tertiary)',
              lineHeight: 1,
            }}
          >
            Daily at {schedule.time_of_day}
          </p>
        )}
        {schedule.message_template && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '0.68rem',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '200px',
            }}
            title={schedule.message_template}
          >
            "{schedule.message_template}"
          </p>
        )}
      </div>

      {/* Enabled toggle */}
      <ToggleSwitch
        checked={schedule.enabled}
        onChange={v => onToggle(schedule.id, v)}
        disabled={disabled}
      />

      {/* Delete button */}
      <button
        onClick={() => onDelete(schedule.id)}
        disabled={disabled}
        title="Delete schedule"
        aria-label={`Delete ${TYPE_LABELS[schedule.type]} schedule`}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--color-text-tertiary)',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel for managing character message schedules.
 *
 * Features:
 * - Lists existing schedules with type label, time, and enabled state
 * - Toggle switch to enable/disable individual schedules (PATCH endpoint)
 * - Trash button to delete a schedule (DELETE endpoint)
 * - Inline "Add Schedule" form: type dropdown, time picker, optional template
 * - Auto-fetches schedules when the panel opens or the active character changes
 *
 * API endpoints used:
 * - GET  /api/characters/{id}/schedules
 * - POST /api/characters/{id}/schedules
 * - PATCH /api/characters/{id}/schedules/{schedId}
 * - DELETE /api/characters/{id}/schedules/{schedId}
 *
 * @example
 * // Rendered unconditionally in App.tsx.
 * <ScheduleEditorPanel />
 */
export function ScheduleEditorPanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'schedule';

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tracks IDs of schedules currently being saved (toggled/deleted). */
  const [saving, setSaving] = useState<Set<number>>(new Set());

  // Add-schedule form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formType, setFormType] = useState<ScheduleType>('morning_greeting');
  const [formTime, setFormTime] = useState<string>(TYPE_DEFAULT_TIMES['morning_greeting']);
  const [formTemplate, setFormTemplate] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Fetch all schedules for the active character. */
  const loadSchedules = useCallback((charId: number) => {
    setLoading(true);
    setError(null);

    fetch(`/api/characters/${charId}/schedules`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ schedules: Schedule[] }>;
      })
      .then(data => {
        setSchedules(data.schedules ?? []);
      })
      .catch(() => {
        setError('Failed to load schedules.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Fetch when the panel opens or active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;
    setShowAddForm(false);
    loadSchedules(activeCharacter.id);
  }, [open, activeCharacter?.id, loadSchedules]);

  /**
   * Toggle a schedule's `enabled` flag via PATCH.
   *
   * @param schedId - ID of the schedule to update.
   * @param enabled - New enabled state.
   */
  const handleToggle = async (schedId: number, enabled: boolean) => {
    if (!activeCharacter?.id) return;
    setSaving(prev => new Set(prev).add(schedId));

    try {
      const res = await fetch(`/api/characters/${activeCharacter.id}/schedules/${schedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // Optimistically update local state
      setSchedules(prev =>
        prev.map(s => s.id === schedId ? { ...s, enabled } : s)
      );
    } catch {
      // On failure, re-fetch to restore correct state
      loadSchedules(activeCharacter.id);
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(schedId);
        return next;
      });
    }
  };

  /**
   * Delete a schedule via DELETE, then remove it from local state.
   *
   * @param schedId - ID of the schedule to delete.
   */
  const handleDelete = async (schedId: number) => {
    if (!activeCharacter?.id) return;
    setSaving(prev => new Set(prev).add(schedId));

    try {
      const res = await fetch(`/api/characters/${activeCharacter.id}/schedules/${schedId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSchedules(prev => prev.filter(s => s.id !== schedId));
    } catch {
      loadSchedules(activeCharacter.id);
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(schedId);
        return next;
      });
    }
  };

  /**
   * Submit the add-schedule form.
   * Sends a POST and prepends the new schedule to the list on success.
   */
  const handleAddSubmit = async () => {
    if (!activeCharacter?.id) return;
    setFormSaving(true);
    setFormError(null);

    const payload: NewSchedulePayload = {
      type: formType,
      time_of_day: formTime || null,
      message_template: formTemplate.trim() || null,
    };

    try {
      const res = await fetch(`/api/characters/${activeCharacter.id}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { schedule: Schedule };
      setSchedules(prev => [data.schedule, ...prev]);
      // Reset and hide the form
      setShowAddForm(false);
      setFormType('morning_greeting');
      setFormTime(TYPE_DEFAULT_TIMES['morning_greeting']);
      setFormTemplate('');
    } catch {
      setFormError('Failed to create schedule. Please try again.');
    } finally {
      setFormSaving(false);
    }
  };

  /** Update the form's default time suggestion when the type changes. */
  const handleTypeChange = (t: ScheduleType) => {
    setFormType(t);
    setFormTime(TYPE_DEFAULT_TIMES[t]);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    fontSize: '0.8rem',
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-primary)',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="schedule-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="schedule-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Message schedules"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(480px, 94vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <CalendarCheck size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                MESSAGE SCHEDULES
              </span>
              {activeCharacter && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
                  {activeCharacter.name}
                </span>
              )}

              {/* Add Schedule button */}
              <button
                onClick={() => { setShowAddForm(v => !v); setFormError(null); }}
                disabled={!activeCharacter}
                title="Add a new schedule"
                aria-label="Add schedule"
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  borderRadius: '5px',
                  border: '1px solid var(--color-border)',
                  background: showAddForm ? 'var(--color-accent-soft)' : 'transparent',
                  color: showAddForm ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: activeCharacter ? 'pointer' : 'not-allowed',
                  opacity: activeCharacter ? 1 : 0.4,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <Plus size={11} />
                Add Schedule
              </button>

              <button
                onClick={closeOverlay}
                style={{
                  marginLeft: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
                aria-label="Close schedule editor"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Inline Add Form ── */}
            <AnimatePresence initial={false}>
              {showAddForm && (
                <motion.div
                  key="add-form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden', flexShrink: 0 }}
                >
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      New Schedule
                    </p>

                    {/* Schedule type dropdown */}
                    <div>
                      <label style={labelStyle}>Type</label>
                      <select
                        value={formType}
                        onChange={e => handleTypeChange(e.target.value as ScheduleType)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {SCHEDULE_TYPES.map(t => (
                          <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Time picker */}
                    <div>
                      <label style={labelStyle}>Time (24-hour)</label>
                      <input
                        type="time"
                        value={formTime}
                        onChange={e => setFormTime(e.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    {/* Optional message template */}
                    <div>
                      <label style={labelStyle}>Message Template (optional)</label>
                      <textarea
                        value={formTemplate}
                        onChange={e => setFormTemplate(e.target.value)}
                        placeholder="Leave blank to use the character's default voice..."
                        rows={3}
                        style={{
                          ...inputStyle,
                          resize: 'vertical',
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {formError && (
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-danger, #f55)' }}>
                        {formError}
                      </p>
                    )}

                    {/* Form actions */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setShowAddForm(false); setFormError(null); }}
                        disabled={formSaving}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.78rem',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-text-secondary)',
                          cursor: formSaving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddSubmit}
                        disabled={formSaving || !formTime}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--color-accent)',
                          color: '#fff',
                          cursor: formSaving || !formTime ? 'not-allowed' : 'pointer',
                          opacity: formSaving ? 0.7 : 1,
                        }}
                      >
                        {formSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* No character selected */}
              {!activeCharacter && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>📅</span>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    No character selected
                  </p>
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Select a character first to manage their message schedules.
                  </p>
                </div>
              )}

              {/* Loading */}
              {activeCharacter && loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.85rem', padding: '40px 0' }}>
                  Loading schedules…
                </p>
              )}

              {/* Error */}
              {activeCharacter && error && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-danger, #f44)', fontSize: '0.85rem', padding: '40px 0' }}>
                  {error}
                </p>
              )}

              {/* Empty state */}
              {activeCharacter && !loading && !error && schedules.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>⏰</span>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    No schedules yet
                  </p>
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Click "Add Schedule" to set up a morning greeting, evening check-in, or custom message.
                  </p>
                </div>
              )}

              {/* Schedule list */}
              {activeCharacter && !loading && !error && schedules.map(schedule => (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  disabled={saving.has(schedule.id)}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
