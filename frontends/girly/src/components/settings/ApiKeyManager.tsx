/**
 * ApiKeyManager – renders one row per cloud LLM provider so the user can
 * enter, save, test, and delete API keys.
 *
 * Layout per provider row:
 *   [Label]  [masked input ─────────] [Save] [Delete]   ✓ Key saved
 *                                                        [Test]  ✓ / ✗
 *
 * Design notes:
 *   - The input value is held in local component state (not persisted until
 *     the user clicks Save) so we never accidentally write a half-typed key.
 *   - hasKey() is polled each render to show/hide the "Key saved" badge and
 *     pre-fill the masked placeholder.
 *   - The Test button calls the provider's testConnection() — same method the
 *     Setup Wizard and ProviderStatus use.
 */

import { useState, useCallback } from 'react';
import { listLLMProviders } from '../../providers/registry.ts';
import { setKey, deleteKey, hasKey } from '../../services/apiKeyService.ts';
import { testLLMConnection } from '../../services/providerHealthService.ts';

/** Per-row test status. */
type TestStatus = 'idle' | 'testing' | 'ok' | 'missing_key' | 'unreachable';

export default function ApiKeyManager() {
  // Only show rows for cloud providers (those that require an API key).
  const cloudProviders = listLLMProviders().filter(p => p.requiresApiKey);

  // Local state: current input value per provider.
  const [inputs, setInputs]           = useState<Record<string, string>>({});
  // Local state: test status per provider.
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});

  /* ── handlers ──────────────────────────────────────────────────── */

  /**
   * Update the local input for a single provider without touching others.
   *
   * @param name  - Provider identifier.
   * @param value - New input string.
   */
  const handleInputChange = useCallback((name: string, value: string) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  }, []);

  /**
   * Persist the current input value for a provider.
   * Trims whitespace so accidental trailing spaces don't break auth headers.
   *
   * @param name - Provider identifier.
   */
  const handleSave = useCallback((name: string) => {
    const val = (inputs[name] ?? '').trim();
    if (val) {
      setKey(name, val);
      // Clear the input after save so it shows as the masked placeholder.
      setInputs(prev => ({ ...prev, [name]: '' }));
    }
  }, [inputs]);

  /**
   * Remove the stored key for a provider and clear the local input.
   *
   * @param name - Provider identifier.
   */
  const handleDelete = useCallback((name: string) => {
    deleteKey(name);
    setInputs(prev => ({ ...prev, [name]: '' }));
  }, []);

  /**
   * Run the provider's connectivity test and update the local status.
   *
   * @param name - Provider identifier.
   */
  const handleTest = useCallback(async (name: string) => {
    setTestStatuses(prev => ({ ...prev, [name]: 'testing' }));
    const result = await testLLMConnection(name);
    setTestStatuses(prev => ({ ...prev, [name]: result.status }));
  }, []);

  /* ── render ────────────────────────────────────────────────────── */

  if (cloudProviders.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-anime border border-anime-100 bg-white/60 p-2.5">
      <label className="text-xs font-semibold text-text-secondary">API Keys</label>

      <div className="flex flex-col gap-2.5">
        {cloudProviders.map(provider => {
          const name       = provider.name;
          const saved      = hasKey(name);
          const inputVal   = inputs[name] ?? '';
          const testStatus = testStatuses[name] ?? 'idle';

          return (
            <div key={name} className="flex flex-col gap-1 bg-anime-50/85 rounded-anime p-2 border border-anime-100">
              {/* Label + saved badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-secondary">{provider.label}</span>
                {saved && (
                  <span className="text-xs text-green-600 font-semibold">✓ Key saved</span>
                )}
              </div>

              {/* Input row: masked input + Save + Delete */}
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={saved ? '••••••••••••' : `Paste ${provider.label} key…`}
                  value={inputVal}
                  onChange={e => handleInputChange(name, e.target.value)}
                  className="flex-1 text-xs px-2 py-1 rounded-pill border border-anime-200 bg-white text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-anime-400"
                />
                <button
                  type="button"
                  onClick={() => handleSave(name)}
                  disabled={!inputVal.trim()}
                  className="text-xs px-2 py-0.5 rounded-pill border border-anime-200 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
                {saved && (
                  <button
                    type="button"
                    onClick={() => handleDelete(name)}
                    className="text-xs px-2 py-0.5 rounded-pill border border-rose-pastel-200 text-rose-pastel-400 hover:bg-rose-pastel-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Test row – only show when a key is saved */}
              {saved && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleTest(name); }}
                    disabled={testStatus === 'testing'}
                    className="text-xs px-2 py-0.5 rounded-pill border border-anime-200 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-50 transition-colors"
                  >
                    {testStatus === 'testing' ? 'Testing…' : 'Test'}
                  </button>
                  {testStatus === 'ok'   && <span className="text-xs text-green-600 font-semibold">✓ Connected</span>}
                  {testStatus === 'missing_key' && <span className="text-xs text-rose-pastel-400 font-semibold">✗ Missing key</span>}
                  {testStatus === 'unreachable' && <span className="text-xs text-rose-pastel-400 font-semibold">✗ Failed</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
