/**
 * apiKeyService – CRUD for per-provider API keys stored in localStorage.
 *
 * Design decisions:
 *   - Keys live under a single dedicated localStorage entry so they can be
 *     managed (backed up / wiped) independently of the rest of the app state.
 *   - Each provider reads its key at call-time via getKey(), not at
 *     construction time.  This means a key updated in the UI takes effect on
 *     the very next request without restarting the app or re-registering the
 *     provider.
 *   - Phase 3 will wrap the stored blob with a master-password encryption
 *     layer.  For now keys are stored as plain text in localStorage, which is
 *     the same trust level we already accept for chat history.
 *
 * Storage layout (animegirly_apikeys):
 *   { "openai": "sk-…", "anthropic": "sk-ant-…", … }
 */

/** The localStorage key under which all API keys are stored as one JSON blob. */
const KEYS_STORAGE_KEY = 'animegirly_apikeys';

/* ── internal helpers ──────────────────────────────────────────────────── */

/**
 * Reads the raw key map from localStorage.
 *
 * @returns A (possibly empty) record of provider-name → key-string.
 */
function _loadKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Persists the full key map to localStorage.
 *
 * @param keys - The map to write.
 */
function _saveKeys(keys: Record<string, string>): void {
  try {
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    console.warn('[AnimeGirly] Could not persist API keys to localStorage.');
  }
}

/* ── public API ─────────────────────────────────────────────────────────── */

/**
 * Store (or overwrite) the API key for a given provider.
 *
 * @param providerName - The provider's unique identifier (e.g. "openai").
 * @param key          - The API key string to store.
 *
 * @example
 *   setKey('openai', 'sk-abc123…');
 */
export function setKey(providerName: string, key: string): void {
  const keys = _loadKeys();
  keys[providerName] = key;
  _saveKeys(keys);
}

/**
 * Retrieve the stored API key for a given provider.
 *
 * @param providerName - The provider's unique identifier.
 * @returns The key string, or undefined if no key has been saved.
 *
 * @example
 *   const key = getKey('anthropic'); // "sk-ant-…" | undefined
 */
export function getKey(providerName: string): string | undefined {
  return _loadKeys()[providerName];
}

/**
 * Delete the stored API key for a given provider.
 *
 * @param providerName - The provider whose key should be removed.
 *
 * @example
 *   deleteKey('google');
 */
export function deleteKey(providerName: string): void {
  const keys = _loadKeys();
  delete keys[providerName];
  _saveKeys(keys);
}

/**
 * Check whether a key has been stored for a given provider.
 *
 * @param providerName - The provider's unique identifier.
 * @returns true if a non-empty key exists.
 *
 * @example
 *   if (hasKey('openrouter')) { … }
 */
export function hasKey(providerName: string): boolean {
  const key = _loadKeys()[providerName];
  return typeof key === 'string' && key.length > 0;
}

/**
 * Remove ALL stored API keys in one go (e.g. for a "factory reset" flow).
 */
export function clearAllKeys(): void {
  try {
    localStorage.removeItem(KEYS_STORAGE_KEY);
  } catch {
    // no-op
  }
}
