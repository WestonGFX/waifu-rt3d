/**
 * ThemeEditorPanel.tsx
 *
 * Visual CSS-variable theme editor with live preview.
 * Users pick a base preset, adjust color groups with native color pickers,
 * and see changes applied instantly via documentElement.style.setProperty.
 *
 * Custom overrides are persisted to localStorage under STORAGE_KEY so they
 * survive page reloads. On unmount, pending (unsaved) overrides are rolled back
 * to avoid leaving orphaned inline styles.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Save, Download, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { APP_THEME_OPTIONS } from '../../services/themePresets.ts';
import {
  AppCard,
  AppField,
  AppMutedNote,
  Button,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'animegirly_custom_theme';

/**
 * CSS variable groups exposed in the editor.
 * Each entry has a human-readable label and the exact CSS custom property name.
 */
const COLOR_GROUPS: Array<{
  groupLabel: string;
  groupEyebrow: string;
  vars: Array<{ label: string; varName: string }>;
}> = [
  {
    groupLabel: 'Backgrounds',
    groupEyebrow: 'Surface',
    vars: [
      { label: 'Shell background', varName: '--shell-bg-start' },
      { label: 'Card surface', varName: '--card-bg' },
      { label: 'Card soft surface', varName: '--card-bg-soft' },
      { label: 'Control surface', varName: '--control-bg' },
    ],
  },
  {
    groupLabel: 'Brand & Accent',
    groupEyebrow: 'Accent',
    vars: [
      { label: 'Anime 400', varName: '--color-anime-400' },
      { label: 'Anime 500', varName: '--color-anime-500' },
      { label: 'Anime 600', varName: '--color-anime-600' },
    ],
  },
  {
    groupLabel: 'Text',
    groupEyebrow: 'Typography',
    vars: [
      { label: 'Primary text', varName: '--color-text-primary' },
      { label: 'Secondary text', varName: '--color-text-secondary' },
      { label: 'Muted text', varName: '--color-text-muted' },
    ],
  },
  {
    groupLabel: 'Controls & Borders',
    groupEyebrow: 'Controls',
    vars: [
      { label: 'Control border', varName: '--control-border' },
      { label: 'Control border soft', varName: '--control-border-soft' },
      { label: 'Divider', varName: '--shell-divider' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the computed value of a CSS custom property from documentElement.
 * Returns an empty string if the property is not set or the environment has
 * no DOM (SSR).
 */
function readComputedVar(varName: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Convert any CSS color string to a hex value suitable for <input type="color">.
 * Falls back to '#888888' when the value cannot be parsed (e.g. rgba strings
 * that the browser resolves to a computed value we can inspect via a temporary
 * DOM element).
 */
function cssColorToHex(cssColor: string): string {
  if (!cssColor) return '#888888';
  // Already a 6-digit hex
  if (/^#[0-9a-fA-F]{6}$/.test(cssColor)) return cssColor;
  // 3-digit hex → expand
  if (/^#[0-9a-fA-F]{3}$/.test(cssColor)) {
    const r = cssColor[1];
    const g = cssColor[2];
    const b = cssColor[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // Use the browser to convert the color
  try {
    const el = document.createElement('div');
    el.style.display = 'none';
    el.style.color = cssColor;
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    document.body.removeChild(el);
    const match = resolved.match(/\d+/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match.map(Number);
      return (
        '#' +
        [r, g, b]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
      );
    }
  } catch {
    // Browser parsing failed — return neutral fallback
  }
  return '#888888';
}

/**
 * Load the saved custom theme overrides from localStorage.
 * Returns an empty record when no saved data exists or parsing fails.
 */
function loadSavedTheme(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single color variable row: label + clickable swatch + hex value display.
 * Clicking anywhere on the swatch area opens the hidden native color picker.
 */
function ColorVarRow({
  label,
  varName,
  value,
  onChange,
}: {
  label: string;
  varName: string;
  /** Current hex value (may be a CSS color string for display; picker always shows hex). */
  value: string;
  onChange: (varName: string, hex: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = cssColorToHex(value);

  const handleSwatchClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="flex items-center gap-2.5 py-1">
      {/* Clickable color swatch */}
      <button
        type="button"
        aria-label={`Open color picker for ${label}`}
        onClick={handleSwatchClick}
        className="h-5 w-5 shrink-0 cursor-pointer rounded-[6px] border border-[color:var(--control-border)] shadow-[var(--control-shadow)] transition-transform enabled:active:scale-95"
        style={{ backgroundColor: hex }}
      />

      {/* Hidden native color input */}
      <input
        ref={inputRef}
        type="color"
        aria-label={`Color picker for ${label}`}
        value={hex}
        onChange={(e) => onChange(varName, e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Label */}
      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{label}</span>

      {/* Hex display */}
      <code className="shrink-0 select-all rounded-[6px] bg-[color:var(--control-bg-soft)] px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
        {hex}
      </code>

      {/* Variable name hint */}
      <code className="hidden shrink-0 select-all font-mono text-[9px] text-text-muted opacity-50 xl:inline">
        {varName}
      </code>
    </div>
  );
}

/**
 * A small live preview card that demonstrates the current theme state using
 * sample text, a badge, and two button variants.
 */
function ThemePreviewCard() {
  return (
    <div
      aria-label="Theme preview"
      className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] p-3.5 shadow-[var(--shell-shadow-soft)]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
        Preview
      </div>
      <div className="mt-0.5 font-semibold text-text-primary">Your companion is here</div>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        This panel shows how your custom colors look on real UI elements.
        Everything updates live as you pick colors.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm">Primary</Button>
        <Button type="button" size="sm" variant="secondary">Secondary</Button>
        <span className="inline-flex items-center rounded-pill border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-anime-600">
          Badge
        </span>
      </div>
      <div className="mt-2.5 h-px w-full bg-[color:var(--shell-divider)]" />
      <div className="mt-2.5 flex items-center gap-2 rounded-[12px] border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-3 py-2 text-xs text-text-primary">
        Sample input field
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ThemeEditorPanel({ embedded = false }: { embedded?: boolean }) {
  // The CSS-variable overrides currently applied in-memory.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // The base theme preset used as the starting point (controls data-theme on html).
  const [baseTheme, setBaseTheme] = useState<string>(
    () => document.documentElement.dataset.theme ?? 'light',
  );

  // Track whether there are unsaved changes (overrides differ from saved).
  const [savedOverrides, setSavedOverrides] = useState<Record<string, string>>(loadSavedTheme);

  // Whether the import file input is ready to be triggered.
  const importRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // On mount: apply any saved overrides immediately.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const saved = loadSavedTheme();
    if (Object.keys(saved).length === 0) return;
    Object.entries(saved).forEach(([varName, value]) => {
      document.documentElement.style.setProperty(varName, value);
    });
    setOverrides(saved);
    setSavedOverrides(saved);
  }, []);

  // -------------------------------------------------------------------------
  // On unmount: remove only the unsaved overrides so we don't leave stale
  // inline styles if the user navigates away without saving.
  // -------------------------------------------------------------------------
  const savedOverridesRef = useRef(savedOverrides);
  const overridesRef = useRef(overrides);
  useEffect(() => { savedOverridesRef.current = savedOverrides; }, [savedOverrides]);
  useEffect(() => { overridesRef.current = overrides; }, [overrides]);

  useEffect(() => {
    return () => {
      // Remove in-memory-only (unsaved) overrides on unmount
      const saved = savedOverridesRef.current;
      const current = overridesRef.current;
      Object.keys(current).forEach((varName) => {
        if (!saved[varName]) {
          document.documentElement.style.removeProperty(varName);
        }
      });
    };
  }, []);

  // -------------------------------------------------------------------------
  // Base theme change — update data-theme on <html> and clear overrides.
  // -------------------------------------------------------------------------
  const handleBaseThemeChange = useCallback((themeId: string) => {
    setBaseTheme(themeId);
    // Remove all current inline overrides
    Object.keys(overridesRef.current).forEach((varName) => {
      document.documentElement.style.removeProperty(varName);
    });
    setOverrides({});
    document.documentElement.dataset.theme = themeId;
  }, []);

  // -------------------------------------------------------------------------
  // Color picker change — apply to DOM and update state.
  // -------------------------------------------------------------------------
  const handleColorChange = useCallback((varName: string, hex: string) => {
    document.documentElement.style.setProperty(varName, hex);
    setOverrides((prev) => ({ ...prev, [varName]: hex }));
  }, []);

  // -------------------------------------------------------------------------
  // Reset all overrides for the current group or globally.
  // -------------------------------------------------------------------------
  const handleResetAll = useCallback(() => {
    Object.keys(overridesRef.current).forEach((varName) => {
      document.documentElement.style.removeProperty(varName);
    });
    setOverrides({});
  }, []);

  // -------------------------------------------------------------------------
  // Save overrides to localStorage.
  // -------------------------------------------------------------------------
  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overridesRef.current));
    setSavedOverrides({ ...overridesRef.current });
  }, []);

  // -------------------------------------------------------------------------
  // Export overrides as a JSON file download.
  // -------------------------------------------------------------------------
  const handleExport = useCallback(() => {
    const payload = {
      baseTheme,
      overrides: overridesRef.current,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animegirly-theme-${baseTheme}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [baseTheme]);

  // -------------------------------------------------------------------------
  // Import overrides from a JSON file.
  // -------------------------------------------------------------------------
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result;
        if (typeof raw !== 'string') return;
        const parsed = JSON.parse(raw) as {
          baseTheme?: string;
          overrides?: Record<string, string>;
        };
        const imported: Record<string, string> = parsed.overrides ?? {};
        // Apply the base theme first
        if (parsed.baseTheme) {
          document.documentElement.dataset.theme = parsed.baseTheme;
          setBaseTheme(parsed.baseTheme);
        }
        // Remove existing overrides
        Object.keys(overridesRef.current).forEach((varName) => {
          document.documentElement.style.removeProperty(varName);
        });
        // Apply imported
        Object.entries(imported).forEach(([varName, value]) => {
          document.documentElement.style.setProperty(varName, value);
        });
        setOverrides(imported);
      } catch {
        // Silent fail — invalid JSON file
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = '';
  }, []);

  const isDirty =
    JSON.stringify(overrides) !== JSON.stringify(savedOverrides);

  const padding = embedded ? 'p-3' : 'p-3.5';
  const sectionGap = embedded ? 'space-y-2.5' : 'space-y-3.5';
  const innerMt = embedded ? 'mt-2.5' : 'mt-3';

  return (
    <div className={sectionGap}>
      <AppMutedNote>
        Customize CSS variables live. Changes preview instantly — save them when you're happy, or
        reset to go back to the base preset.
      </AppMutedNote>

      {/* ------------------------------------------------------------------ */}
      {/* Base theme picker                                                   */}
      {/* ------------------------------------------------------------------ */}
      <AppCard className={padding}>
        <SettingsSectionHeader
          eyebrow="Starting point"
          title="Base theme"
          description="Choose a preset to customize from. Switching resets any unsaved overrides."
        />
        <div className={`max-w-sm ${innerMt}`}>
          <AppField
            label="Preset"
            hint="Your custom colors layer on top of the selected preset."
          >
            <Select value={baseTheme} onValueChange={handleBaseThemeChange}>
              <SelectTrigger className="h-10 rounded-pill">
                <SelectValue placeholder="Choose base theme" />
              </SelectTrigger>
              <SelectContent>
                {APP_THEME_OPTIONS.filter((t) => t.id !== 'auto').map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AppField>
        </div>
      </AppCard>

      {/* ------------------------------------------------------------------ */}
      {/* Color groups                                                        */}
      {/* ------------------------------------------------------------------ */}
      {COLOR_GROUPS.map((group) => (
        <AppCard key={group.groupLabel} className={padding}>
          <SettingsSectionHeader
            eyebrow={group.groupEyebrow}
            title={group.groupLabel}
          />
          <div className={`${innerMt} space-y-0.5 rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2`}>
            {group.vars.map(({ label, varName }) => {
              // Priority: active override → computed CSS value
              const currentValue = overrides[varName] ?? readComputedVar(varName);
              return (
                <ColorVarRow
                  key={varName}
                  label={label}
                  varName={varName}
                  value={currentValue}
                  onChange={handleColorChange}
                />
              );
            })}
          </div>
        </AppCard>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Live preview                                                        */}
      {/* ------------------------------------------------------------------ */}
      <AppCard className={padding}>
        <SettingsSectionHeader
          eyebrow="Preview"
          title="Theme Editor"
          description="Create and customize your own color themes"
        />
        <div className={innerMt}>
          <ThemePreviewCard />
        </div>
      </AppCard>

      {/* ------------------------------------------------------------------ */}
      {/* Action bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <AppCard className={padding}>
        <SettingsSectionHeader
          eyebrow="Actions"
          title="Save & share"
          description="Persist your custom theme or move it between devices as a JSON file."
        />
        <div className={`flex flex-wrap items-center gap-2 ${innerMt}`}>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty}
            aria-label="Save theme overrides to local storage"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save theme
            {isDirty ? (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-anime-400" aria-hidden="true" />
            ) : null}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleResetAll}
            disabled={Object.keys(overrides).length === 0}
            aria-label="Reset all overrides and return to base theme"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to base
          </Button>

          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleExport}
              aria-label="Download current theme overrides as JSON"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => importRef.current?.click()}
              aria-label="Import theme overrides from a JSON file"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            aria-label="Import theme JSON file"
            onChange={handleImportFile}
            className="sr-only"
            tabIndex={-1}
          />
        </div>

        {/* Unsaved-changes hint */}
        {isDirty ? (
          <p className="mt-2 text-xs leading-5 text-text-muted">
            You have unsaved changes. Hit "Save theme" to persist them across page reloads.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5 text-text-muted">
            All changes are saved. Your custom theme will be applied on every launch.
          </p>
        )}
      </AppCard>
    </div>
  );
}
