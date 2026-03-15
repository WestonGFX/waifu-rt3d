import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import type { ConnectionProfile } from '../lib/api';
import { useNovaStore } from '../stores/novaStore';
import styles from './ProfileSelector.module.css';

/**
 * Default values for a new connection profile form.
 * Matches the SQLite column defaults from schema v46.
 */
const DEFAULT_FORM: ProfileFormData = {
  name: '',
  server_url: 'http://localhost:1234/v1',
  model: '',
  context_size: 4096,
  temperature: 0.8,
  top_p: 0.95,
  repeat_penalty: 1.1,
};

/** Shape of the inline add/edit form state. */
interface ProfileFormData {
  name: string;
  server_url: string;
  model: string;
  context_size: number;
  temperature: number;
  top_p: number;
  repeat_penalty: number;
}

/**
 * Connection Profile Selector — dropdown for one-click LLM backend switching.
 *
 * Renders a compact pill in the chat header showing the active profile name.
 * Clicking expands a glass-styled dropdown listing all saved profiles with:
 * - One-click activation (calls POST /api/profiles/{id}/activate)
 * - Inline add/edit form for creating and updating profiles
 * - Hover-revealed edit/delete buttons per profile row
 *
 * The component polls for profiles on mount and after any CRUD operation.
 *
 * @example
 * ```tsx
 * <ProfileSelector />
 * ```
 */
export function ProfileSelector() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileFormData>({ ...DEFAULT_FORM });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const addToast = useNovaStore((s) => s.addToast);

  /** Fetch all profiles from the backend. */
  const loadProfiles = useCallback(async () => {
    try {
      const res = await api.getProfiles();
      setProfiles(res.profiles);
      setActiveId(res.active_id);
    } catch {
      // Silently fail — table may not exist yet
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowForm(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  /**
   * Activate a profile — switches the live LLM backend.
   *
   * @param id - Profile primary key to activate.
   */
  const handleActivate = async (id: number) => {
    try {
      await api.activateProfile(id);
      addToast('Profile activated', 'success');
      await loadProfiles();
    } catch {
      addToast('Failed to activate profile', 'error');
    }
  };

  /**
   * Submit the inline form to create or update a profile.
   * Determines create vs. update based on whether editingId is set.
   */
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      addToast('Profile name is required', 'error');
      return;
    }
    try {
      if (editingId) {
        await api.updateProfile(editingId, form);
        addToast('Profile updated', 'success');
      } else {
        await api.createProfile({ ...form, name: form.name.trim() });
        addToast('Profile created', 'success');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...DEFAULT_FORM });
      await loadProfiles();
    } catch {
      addToast('Failed to save profile', 'error');
    }
  };

  /**
   * Delete a profile after user confirmation.
   *
   * @param id - Profile primary key to delete.
   * @param name - Profile name (for confirmation dialog).
   */
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return;
    try {
      await api.deleteProfile(id);
      addToast('Profile deleted', 'success');
      await loadProfiles();
    } catch {
      addToast('Failed to delete profile', 'error');
    }
  };

  /**
   * Open the inline form pre-filled with an existing profile's data.
   *
   * @param profile - The profile to edit.
   */
  const handleEdit = (profile: ConnectionProfile) => {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      server_url: profile.server_url,
      model: profile.model,
      context_size: profile.context_size,
      temperature: profile.temperature,
      top_p: profile.top_p,
      repeat_penalty: profile.repeat_penalty,
    });
    setShowForm(true);
  };

  const activeProfile = profiles.find((p) => p.id === activeId);
  const triggerLabel = activeProfile ? activeProfile.name : 'No Profile';

  /**
   * Truncate a URL for display by removing the protocol prefix.
   *
   * @param url - Full URL string.
   * @returns Shortened URL without http(s)://.
   */
  const shortUrl = (url: string) => url.replace(/^https?:\/\//, '');

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* Trigger pill */}
      <button
        className={`${styles.trigger} ${activeProfile ? styles.triggerActive : ''}`}
        onClick={() => setOpen(!open)}
        title="Switch LLM connection profile"
      >
        <span>{triggerLabel}</span>
        <span className={`${styles.triggerIcon} ${open ? styles.triggerIconOpen : ''}`}>
          &#9662;
        </span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.dropdown}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Profile list */}
            {profiles.length === 0 && !showForm && (
              <div className={styles.empty}>
                No profiles yet. Add one to enable quick switching.
              </div>
            )}

            {profiles.map((p) => (
              <div
                key={p.id}
                className={`${styles.profileRow} ${p.id === activeId ? styles.profileRowActive : ''}`}
                onClick={() => handleActivate(p.id)}
              >
                <div
                  className={`${styles.profileDot} ${p.id === activeId ? styles.profileDotActive : ''}`}
                />
                <div className={styles.profileInfo}>
                  <div className={styles.profileName}>{p.name}</div>
                  <div className={styles.profileMeta}>
                    {p.model || 'auto'} &middot; {shortUrl(p.server_url)}
                  </div>
                </div>
                <div
                  className={styles.rowActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={styles.rowBtn}
                    title="Edit profile"
                    onClick={() => handleEdit(p)}
                  >
                    &#9998;
                  </button>
                  <button
                    className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                    title="Delete profile"
                    onClick={() => handleDelete(p.id, p.name)}
                  >
                    &#10005;
                  </button>
                </div>
              </div>
            ))}

            {/* Divider before add button / form */}
            {profiles.length > 0 && <div className={styles.divider} />}

            {/* Inline form (add / edit) */}
            {showForm ? (
              <div className={styles.form}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Name</label>
                  <input
                    className={styles.formInput}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Local 7B, Cloud 70B"
                    autoFocus
                  />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Server URL</label>
                  <input
                    className={styles.formInput}
                    value={form.server_url}
                    onChange={(e) => setForm({ ...form, server_url: e.target.value })}
                    placeholder="http://localhost:1234/v1"
                  />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Model</label>
                  <input
                    className={styles.formInput}
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Leave blank for auto-detect"
                  />
                </div>
                <div className={styles.formGrid}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Context Size</label>
                    <input
                      className={styles.formInput}
                      type="number"
                      value={form.context_size}
                      onChange={(e) => setForm({ ...form, context_size: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Temperature</label>
                    <input
                      className={styles.formInput}
                      type="number"
                      step="0.05"
                      min="0"
                      max="2"
                      value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Top P</label>
                    <input
                      className={styles.formInput}
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={form.top_p}
                      onChange={(e) => setForm({ ...form, top_p: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Repeat Penalty</label>
                    <input
                      className={styles.formInput}
                      type="number"
                      step="0.05"
                      min="1"
                      max="2"
                      value={form.repeat_penalty}
                      onChange={(e) => setForm({ ...form, repeat_penalty: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button
                    className={styles.formBtn}
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm({ ...DEFAULT_FORM });
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                    onClick={handleSubmit}
                  >
                    {editingId ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className={styles.addBtn}
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setForm({ ...DEFAULT_FORM });
                }}
              >
                + Add Profile
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
