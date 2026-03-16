import { useState, useEffect, useCallback } from 'react';
import { Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { api } from '../lib/api';

/** A single output format rule as returned by the backend. */
interface FormatRule {
  id: number;
  rule_name: string;
  pattern: string;
  replacement: string;
  is_enabled: boolean;
  priority: number;
}

/** Built-in presets the user can add with one click. */
const PRESETS: Array<{ name: string; pattern: string; replacement: string }> = [
  { name: 'Strip OOC',             pattern: '\\(OOC:.*?\\)',  replacement: '' },
  { name: 'Remove narrator',       pattern: '\\*[^*]+\\*',    replacement: '' },
  { name: 'Clean double asterisks', pattern: '\\*{2,}',       replacement: '*' },
];

/**
 * CRUD editor for per-character regex output formatting rules.
 * Shows a list of existing rules with toggle + delete, an "Add Rule" form,
 * built-in presets, and a live test preview.
 *
 * @param characterId - Active character ID to fetch/save rules for.
 */
export function FormatRulesEditor({ characterId }: { characterId: number }) {
  const [rules, setRules] = useState<FormatRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // New rule form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPattern, setNewPattern] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Test preview
  const [testInput, setTestInput] = useState('');

  // Preset dropdown
  const [showPresets, setShowPresets] = useState(false);

  const fetchRules = useCallback(() => {
    setLoading(true);
    api.getFormatRules(characterId)
      .then(d => setRules(d.rules))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [characterId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  /** Toggle a rule's is_enabled flag. */
  const toggleRule = async (rule: FormatRule) => {
    const updated = !rule.is_enabled;
    // Optimistic update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_enabled: updated } : r));
    try {
      await api.updateFormatRule(rule.id, { is_enabled: updated });
    } catch {
      // Revert on error
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_enabled: !updated } : r));
    }
  };

  /** Delete a rule with no confirmation (small data, easily re-created). */
  const deleteRule = async (ruleId: number) => {
    setRules(prev => prev.filter(r => r.id !== ruleId));
    try {
      await api.deleteFormatRule(ruleId);
    } catch {
      fetchRules(); // re-sync on error
    }
  };

  /** Validate regex and create a new rule. */
  const createRule = async () => {
    setFormError(null);
    if (!newName.trim()) { setFormError('Name required'); return; }
    if (!newPattern.trim()) { setFormError('Pattern required'); return; }
    // Validate regex
    try {
      new RegExp(newPattern);
    } catch (e) {
      setFormError(`Invalid regex: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    try {
      await api.createFormatRule(characterId, {
        rule_name: newName.trim(),
        pattern: newPattern.trim(),
        replacement: newReplacement,
      });
      setNewName('');
      setNewPattern('');
      setNewReplacement('');
      setShowForm(false);
      fetchRules();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  /** Add a preset as a new rule. */
  const addPreset = async (preset: typeof PRESETS[number]) => {
    setShowPresets(false);
    try {
      await api.createFormatRule(characterId, {
        rule_name: preset.name,
        pattern: preset.pattern,
        replacement: preset.replacement,
      });
      fetchRules();
    } catch { /* ignore duplicates */ }
  };

  /** Apply all enabled rules to the test input string (client-side preview). */
  const computePreview = (): string => {
    if (!testInput) return '';
    let result = testInput;
    for (const rule of rules) {
      if (!rule.is_enabled) continue;
      try {
        const re = new RegExp(rule.pattern, 'g');
        result = result.replace(re, rule.replacement);
      } catch { /* skip invalid regex */ }
    }
    return result;
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
  };

  if (loading) {
    return <div className="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>Loading rules…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Rule list */}
      {rules.length === 0 && (
        <>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No format rules yet. Add one below or pick a preset.
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.8 }}>
            Format rules are regex patterns applied to AI responses before display. Use them to strip unwanted markers, clean formatting, or enforce output style.
          </p>
        </>
      )}

      {rules.map(rule => (
        <div
          key={rule.id}
          className="rounded-lg px-3 py-2"
          style={{
            border: '1px solid var(--color-border-subtle)',
            backgroundColor: rule.is_enabled ? 'transparent' : 'color-mix(in srgb, var(--color-background) 50%, transparent)',
            opacity: rule.is_enabled ? 1 : 0.6,
          }}
        >
          <div className="flex items-center gap-2">
            {/* Expand/collapse toggle */}
            <button
              onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
              className="p-0.5"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label={expandedId === rule.id ? 'Collapse' : 'Expand'}
            >
              {expandedId === rule.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {/* Rule name */}
            <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
              {rule.rule_name}
            </span>

            {/* Enable/disable toggle */}
            <input
              type="checkbox"
              checked={rule.is_enabled}
              onChange={() => toggleRule(rule)}
              className="accent-[var(--color-accent)]"
              title={rule.is_enabled ? 'Disable rule' : 'Enable rule'}
            />

            {/* Delete */}
            <button
              onClick={() => deleteRule(rule.id)}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              title="Delete rule"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Expanded details */}
          {expandedId === rule.id && (
            <div className="mt-2 space-y-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <div>
                <span className="font-medium">Pattern:</span>{' '}
                <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-accent)' }}>
                  {rule.pattern}
                </code>
              </div>
              <div>
                <span className="font-medium">Replace:</span>{' '}
                <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-background)' }}>
                  {rule.replacement || '(empty)'}
                </code>
              </div>
              <div>
                <span className="font-medium">Priority:</span> {rule.priority}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Action buttons row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
          style={{
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            background: showForm ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
          }}
          title="Create a custom regex rule to clean up AI output"
        >
          <Plus size={12} /> Add Rule
        </button>

        {/* Preset dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowPresets(s => !s)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', background: 'transparent' }}
            title="Add a commonly-used formatting rule with one click"
          >
            Add Preset <ChevronDown size={10} />
          </button>
          {showPresets && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                minWidth: 200,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              {PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => addPreset(preset)}
                  className="w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <div className="font-medium">{preset.name}</div>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                    /{preset.pattern}/ → {preset.replacement || '(remove)'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New rule form */}
      {showForm && (
        <div
          className="space-y-2 px-3 py-3 rounded-lg"
          style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-background)' }}
        >
          <input
            type="text"
            placeholder="Rule name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded"
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Regex pattern (e.g. \\(OOC:.*?\\))"
            value={newPattern}
            onChange={e => setNewPattern(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded font-mono"
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Replacement (empty = delete match)"
            value={newReplacement}
            onChange={e => setNewReplacement(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded font-mono"
            style={inputStyle}
          />
          {formError && (
            <p className="text-xs" style={{ color: 'var(--color-danger, #f44)' }}>{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="px-3 py-1 text-xs rounded-lg"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              Cancel
            </button>
            <button
              onClick={createRule}
              className="px-3 py-1 text-xs font-medium rounded-lg"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Test preview */}
      {rules.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
            title="Paste sample text below to see how your active rules transform it"
          >
            Test Preview
          </p>
          <textarea
            placeholder="Paste sample AI output here... e.g. *She smiles* (OOC: this is a test) Hello!"
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            rows={3}
            className="w-full text-xs px-2 py-1.5 rounded resize-y font-mono"
            style={inputStyle}
          />
          {testInput && (
            <div
              className="text-xs px-2 py-1.5 rounded whitespace-pre-wrap font-mono"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-success, #39c96e) 8%, var(--color-background))',
                border: '1px solid color-mix(in srgb, var(--color-success, #39c96e) 20%, var(--color-border))',
                color: 'var(--color-text-primary)',
                minHeight: 40,
              }}
            >
              {computePreview() || <span style={{ color: 'var(--color-text-tertiary)' }}>(empty result)</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
