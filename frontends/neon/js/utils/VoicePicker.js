/**
 * VoicePicker.js
 * Shared voice picker dropdown that fetches available voices from the backend
 * and renders a grouped <select> for Kokoro, Piper, and Edge-TTS providers.
 *
 * Used by WaifuCreator, PersonaCreator, and SettingsModal.
 *
 * @example
 * import { buildVoicePicker, refreshVoicePicker } from '../utils/VoicePicker.js';
 *
 * buildVoicePicker({
 *     containerId: 'voice-picker-container',
 *     currentProvider: 'edge-tts',
 *     currentVoiceId: 'en-US-AriaNeural',
 *     onChange: ({ provider, voiceId, name }) => console.log('Selected:', provider, voiceId)
 * });
 */

/** @type {Map<string, {select: HTMLSelectElement, onChange: Function}>} */
const _pickerInstances = new Map();

/** @type {Array<{id: string, name: string, provider: string, language: string}>|null} */
let _cachedVoices = null;

/** @type {number} Cache TTL in ms (30 seconds) */
const CACHE_TTL = 30_000;
let _cacheTimestamp = 0;

/**
 * Fetch available voices from the backend API.
 *
 * @param {string} [filterProvider] - Optional provider filter
 * @returns {Promise<Array<{id: string, name: string, provider: string, language: string}>>}
 */
async function fetchVoices(filterProvider) {
    const now = Date.now();
    if (_cachedVoices && (now - _cacheTimestamp) < CACHE_TTL && !filterProvider) {
        return _cachedVoices;
    }

    try {
        const url = filterProvider
            ? `/api/tts/voices?provider=${encodeURIComponent(filterProvider)}`
            : '/api/tts/voices';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!filterProvider) {
            _cachedVoices = data.voices || [];
            _cacheTimestamp = now;
        }
        return data.voices || [];
    } catch (err) {
        console.warn('[VoicePicker] Failed to fetch voices:', err);
        return [];
    }
}

/**
 * Group voices by provider for <optgroup> rendering.
 *
 * @param {Array} voices - Flat voice list from the API
 * @returns {Object<string, Array>} Voices grouped by provider label
 */
function groupByProvider(voices) {
    const labels = {
        'kokoro': 'Kokoro (Local)',
        'piper': 'Piper (Local)',
        'edge-tts': 'Edge-TTS (Cloud)',
    };
    const groups = {};
    for (const v of voices) {
        const label = labels[v.provider] || v.provider;
        if (!groups[label]) groups[label] = [];
        groups[label].push(v);
    }
    return groups;
}

/**
 * Build a voice picker dropdown in the specified container.
 *
 * @param {Object} opts - Configuration options
 * @param {string} opts.containerId - DOM element ID to render into
 * @param {string} [opts.currentProvider] - Currently selected TTS provider
 * @param {string} [opts.currentVoiceId] - Currently selected voice ID
 * @param {Function} opts.onChange - Callback: ({provider, voiceId, name}) => void
 * @param {string} [opts.filterProvider] - Only show voices from this provider
 * @param {boolean} [opts.showManageOption=true] - Show "Manage Voices..." link
 * @returns {Promise<HTMLSelectElement>} The created select element
 *
 * @example
 * const select = await buildVoicePicker({
 *     containerId: 'wc-voice-picker',
 *     currentVoiceId: 'en-US-AriaNeural',
 *     onChange: ({ provider, voiceId }) => console.log(provider, voiceId)
 * });
 */
export async function buildVoicePicker({
    containerId,
    currentProvider = '',
    currentVoiceId = '',
    onChange = () => {},
    filterProvider = null,
    showManageOption = true,
}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`[VoicePicker] Container #${containerId} not found`);
        return null;
    }

    // Loading state
    container.innerHTML = '<span style="color:var(--text-muted); font-size:0.78rem;">Loading voices...</span>';

    const voices = await fetchVoices(filterProvider);
    const groups = groupByProvider(voices);

    // Build select element
    const select = document.createElement('select');
    select.className = 'wc-select voice-picker-select';
    select.style.cssText = 'width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;';

    // Empty / "choose" option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— Select a voice —';
    select.appendChild(emptyOpt);

    // Compose the current value to match against
    const currentValue = currentProvider && currentVoiceId
        ? `${currentProvider}:${currentVoiceId}`
        : currentVoiceId
            ? `:${currentVoiceId}`
            : '';

    // Add grouped options
    for (const [groupLabel, groupVoices] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupLabel;

        for (const v of groupVoices) {
            const opt = document.createElement('option');
            opt.value = `${v.provider}:${v.id}`;
            opt.textContent = v.name;

            // Match by provider:id or just id
            if (opt.value === currentValue ||
                v.id === currentVoiceId ||
                (currentProvider === v.provider && v.id === currentVoiceId)) {
                opt.selected = true;
            }

            optgroup.appendChild(opt);
        }

        select.appendChild(optgroup);
    }

    // "Manage Voices..." option
    if (showManageOption) {
        const manageGroup = document.createElement('optgroup');
        manageGroup.label = '────────────';
        const manageOpt = document.createElement('option');
        manageOpt.value = '__manage__';
        manageOpt.textContent = 'Manage Voices...';
        manageOpt.style.fontStyle = 'italic';
        manageGroup.appendChild(manageOpt);
        select.appendChild(manageGroup);
    }

    // Event handler
    select.addEventListener('change', () => {
        const val = select.value;

        if (val === '__manage__') {
            // Open Settings to TTS Models tab
            if (typeof window.openSettings === 'function') {
                window.openSettings('tts_models');
            }
            // Reset to previous selection
            select.value = currentValue || '';
            return;
        }

        if (!val) {
            onChange({ provider: '', voiceId: '', name: '' });
            return;
        }

        const [provider, ...idParts] = val.split(':');
        const voiceId = idParts.join(':');
        const selectedOpt = select.options[select.selectedIndex];
        onChange({
            provider,
            voiceId,
            name: selectedOpt ? selectedOpt.textContent : '',
        });
    });

    // Render
    container.innerHTML = '';
    container.appendChild(select);

    // Track this instance for refresh
    _pickerInstances.set(containerId, { select, onChange });

    return select;
}

/**
 * Refresh a previously built voice picker dropdown.
 * Re-fetches voices from the API and rebuilds the options.
 *
 * @param {string} containerId - The picker's container ID
 * @returns {Promise<void>}
 *
 * @example
 * await refreshVoicePicker('wc-voice-picker');
 */
export async function refreshVoicePicker(containerId) {
    const instance = _pickerInstances.get(containerId);
    if (!instance) return;

    // Invalidate cache to force fresh fetch
    _cachedVoices = null;
    _cacheTimestamp = 0;

    const currentVal = instance.select.value;
    const [provider, ...idParts] = currentVal ? currentVal.split(':') : ['', ''];

    await buildVoicePicker({
        containerId,
        currentProvider: provider,
        currentVoiceId: idParts.join(':'),
        onChange: instance.onChange,
    });
}

/**
 * Invalidate the cached voice list. Call after installing or deleting a voice.
 */
export function invalidateVoiceCache() {
    _cachedVoices = null;
    _cacheTimestamp = 0;
}

/**
 * Refresh all active voice picker instances. Useful after voice install/delete.
 *
 * @returns {Promise<void>}
 */
export async function refreshAllPickers() {
    invalidateVoiceCache();
    for (const containerId of _pickerInstances.keys()) {
        await refreshVoicePicker(containerId);
    }
}
