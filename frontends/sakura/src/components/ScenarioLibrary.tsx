import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookMarked, Search, ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface ScenarioCategory {
  name: string;
  scenarios: string[];
}

interface ScenarioLibraryProps {
  /**
   * Called when the user clicks "Use this" on a scenario.
   * Receives the full scenario text; another agent will wire this into the
   * chat composer.
   */
  onSelect: (text: string) => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Hardcoded scenario data
   ═══════════════════════════════════════════════════════════════════════ */

const BUILT_IN_SCENARIOS: ScenarioCategory[] = [
  {
    name: 'First Meeting',
    scenarios: [
      "Hi there! I just moved into the neighborhood...",
      "Excuse me, do you know where the library is? I seem to be lost.",
      "You look familiar... have we met before?",
    ],
  },
  {
    name: 'Movie Night',
    scenarios: [
      "I was thinking we could watch something tonight. Do you have any suggestions?",
      "I can't believe that movie ending! Did you see that coming?",
      "Can I rest my head on your shoulder? This film is scary...",
    ],
  },
  {
    name: 'Comfort',
    scenarios: [
      "Today was really rough. I just need someone to talk to.",
      "I failed the exam I studied so hard for. I feel terrible.",
      "It's my birthday today but nobody remembered...",
    ],
  },
  {
    name: 'Debate Club',
    scenarios: [
      "Hot take: cats are objectively better than dogs. Defend your position.",
      "If you could change one thing about society, what would it be?",
      "Do you believe in fate, or do we make our own destiny?",
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Accordion section for a single scenario category.
 *
 * @param category - Category data including name and scenario texts.
 * @param query - Current search filter query (used for visibility filtering).
 * @param onSelect - Callback to invoke when a scenario is selected.
 */
function CategorySection({
  category,
  query,
  onSelect,
}: {
  category: ScenarioCategory;
  query: string;
  onSelect: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);

  // Filter scenarios to those matching the search query (case-insensitive).
  const filtered = query.trim()
    ? category.scenarios.filter(s =>
        s.toLowerCase().includes(query.toLowerCase())
      )
    : category.scenarios;

  // Hide the entire category section when no scenarios match the query.
  if (query.trim() && filtered.length === 0) return null;

  return (
    <section>
      {/* Accordion toggle header */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls={`scenarios-${category.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          marginBottom: open ? '8px' : '0',
        }}
      >
        {open
          ? <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        }
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          {category.name}
        </span>
        <span style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          {filtered.length}
        </span>
      </button>

      {open && (
        <div
          id={`scenarios-${category.name}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {filtered.map((text, i) => (
            <ScenarioRow key={i} text={text} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Single scenario row with truncated preview text and "Use this" action.
 *
 * @param text - Full scenario text to display and pass to onSelect.
 * @param onSelect - Callback invoked with the scenario text on click.
 */
function ScenarioRow({ text, onSelect }: { text: string; onSelect: (t: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '8px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: '0.83rem',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary)',
          wordBreak: 'break-word',
          fontStyle: 'italic',
        }}
      >
        "{text}"
      </p>
      <button
        onClick={() => onSelect(text)}
        aria-label={`Use scenario: ${text}`}
        style={{
          flexShrink: 0,
          padding: '4px 10px',
          fontSize: '0.7rem',
          fontWeight: 600,
          borderRadius: '5px',
          border: '1px solid var(--color-accent)',
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
          color: 'var(--color-accent)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background-color 0.15s',
        }}
      >
        Use this
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out drawer presenting pre-built conversation starter templates.
 *
 * Features:
 * - Accordion categories with search filter
 * - "Use this" button to inject a scenario into the chat composer
 * - Export scenarios as JSON
 * - Import scenarios from a JSON file (merged with built-in scenarios)
 *
 * The `onSelect` prop is called with the scenario text and the overlay is
 * automatically closed; another agent wires it into the composer.
 */
export function ScenarioLibrary({ onSelect }: ScenarioLibraryProps) {
  const { activeOverlay, closeOverlay } = useAppStore();
  const open = activeOverlay === 'scenarios';

  const [query, setQuery] = useState('');
  /** User-imported custom scenarios, merged on top of built-ins. */
  const [customCategories, setCustomCategories] = useState<ScenarioCategory[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Combined categories: built-ins first, then user-imported. */
  const allCategories = [...BUILT_IN_SCENARIOS, ...customCategories];

  /**
   * Handle scenario selection: invoke the callback and close the overlay.
   *
   * @param text - The selected scenario text.
   */
  const handleSelect = (text: string) => {
    onSelect(text);
    closeOverlay();
  };

  /**
   * Serialize the full scenario catalogue to a JSON file and trigger browser
   * download.
   */
  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify(allCategories, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenario_library.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Parse and import a user-provided JSON file of scenario categories.
   * Validates the top-level structure before merging.
   *
   * @param e - File input change event.
   */
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of categories.');
        // Basic shape validation.
        for (const cat of parsed) {
          if (typeof cat.name !== 'string' || !Array.isArray(cat.scenarios)) {
            throw new Error('Each category must have a "name" string and "scenarios" array.');
          }
        }
        setCustomCategories(parsed as ScenarioCategory[]);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-imported after edits.
    e.target.value = '';
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="scenarios-backdrop"
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
            key="scenarios-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Scenario library"
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
              }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <BookMarked size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  SCENARIO LIBRARY
                </span>
                <button
                  onClick={closeOverlay}
                  aria-label="Close scenario library"
                  title="Close"
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search bar */}
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute', left: '9px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter scenarios…"
                  aria-label="Filter scenarios"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    paddingLeft: '28px',
                    paddingRight: query ? '28px' : '8px',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    fontSize: '0.78rem',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Clear filter"
                    style={{
                      position: 'absolute', right: '8px', top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', padding: '2px',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Category list ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {allCategories.map(cat => (
                <CategorySection
                  key={cat.name}
                  category={cat}
                  query={query}
                  onSelect={handleSelect}
                />
              ))}

              {/* No match state */}
              {query.trim() && allCategories.every(cat =>
                cat.scenarios.every(s => !s.toLowerCase().includes(query.toLowerCase()))
              ) && (
                <p style={{
                  textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '0.85rem',
                  padding: '32px 0',
                }}>
                  No scenarios match "{query}"
                </p>
              )}

              {/* ── Import/Export section ── */}
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <p
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                  }}
                >
                  Import / Export
                </p>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Export button */}
                  <button
                    onClick={handleExport}
                    aria-label="Export scenarios as JSON"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '7px 0',
                      fontSize: '0.72rem',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={13} />
                    Export JSON
                  </button>

                  {/* Import button — opens hidden file input */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Import scenarios from JSON file"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '7px 0',
                      fontSize: '0.72rem',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <Upload size={13} />
                    Import JSON
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImport}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                  />
                </div>

                {/* Import error feedback */}
                {importError && (
                  <p style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-danger, #f44)',
                    margin: 0,
                    lineHeight: 1.4,
                  }}>
                    Import failed: {importError}
                  </p>
                )}

                {/* Confirm when custom categories loaded */}
                {customCategories.length > 0 && !importError && (
                  <p style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-success)',
                    margin: 0,
                  }}>
                    {customCategories.length} custom {customCategories.length === 1 ? 'category' : 'categories'} loaded.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
