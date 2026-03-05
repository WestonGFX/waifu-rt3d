# Settings Consolidation, Capability Auto-Detection & Context Budget UX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify settings into a 3-tier system (Normal/Advanced/Dev), auto-detect and auto-enable model capabilities with toast notifications, upgrade the context budget display to an expandable pill with per-section breakdown, add auto-compaction with inline chat feedback, and build dev-mode power tools.

**Architecture:** Progressive disclosure via `settingsTier: 0|1|2` in Zustand store, replacing `advancedMode: boolean`. Model capabilities auto-apply on detection via HuggingFace enrichment. Context budget upgraded from 3px bar to clickable pill with drawer breakdown. Dev mode unlocks console, prompt inspector, and raw config editor panels.

**Tech Stack:** React 19, Zustand, Framer Motion (toasts), FastAPI backend, tiktoken, HuggingFace API

**Design doc:** `docs/plans/2026-03-02-settings-capabilities-context-ux-design.md`

---

## Phase 1: Core Settings Tier System (Tasks 1–5)

### Task 1: Add settingsTier to appStore

**Files:**
- Modify: `frontends/sakura/src/stores/appStore.ts`

**Step 1: Write the failing test**

Create test file:
- Create: `frontends/sakura/src/test/appStore.settingsTier.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

// We'll test the store logic directly
describe('settingsTier', () => {
  it('defaults to tier 0', () => {
    // After store reset, settingsTier should be 0
    const { useAppStore } = require('../stores/appStore');
    const state = useAppStore.getState();
    expect(state.settingsTier).toBe(0);
  });

  it('setSettingsTier updates tier and computed flags', () => {
    const { useAppStore } = require('../stores/appStore');
    useAppStore.getState().setSettingsTier(1);
    expect(useAppStore.getState().settingsTier).toBe(1);
    expect(useAppStore.getState().advancedMode).toBe(true);
    expect(useAppStore.getState().devMode).toBe(false);

    useAppStore.getState().setSettingsTier(2);
    expect(useAppStore.getState().settingsTier).toBe(2);
    expect(useAppStore.getState().advancedMode).toBe(true);
    expect(useAppStore.getState().devMode).toBe(true);
  });

  it('toggleAdvancedMode still works as legacy shim', () => {
    const { useAppStore } = require('../stores/appStore');
    useAppStore.getState().setSettingsTier(0);
    useAppStore.getState().toggleAdvancedMode();
    expect(useAppStore.getState().settingsTier).toBe(1);
    expect(useAppStore.getState().advancedMode).toBe(true);

    useAppStore.getState().toggleAdvancedMode();
    expect(useAppStore.getState().settingsTier).toBe(0);
    expect(useAppStore.getState().advancedMode).toBe(false);
  });

  it('migrates persisted advancedMode: true to settingsTier: 1', () => {
    // Simulate old persisted state
    const merged = mergePersistedState({ advancedMode: true });
    expect(merged.settingsTier).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontends/sakura && npx vitest run src/test/appStore.settingsTier.test.ts`
Expected: FAIL — `settingsTier` not defined on state

**Step 3: Implement settingsTier in appStore.ts**

In `frontends/sakura/src/stores/appStore.ts`:

A) Add to `AppState` interface (near line 109, after `advancedMode`):
```typescript
  settingsTier: 0 | 1 | 2;
  setSettingsTier: (tier: 0 | 1 | 2) => void;
  devMode: boolean;
```

B) Replace implementation (lines 249-250):
```typescript
  // Settings tier: 0=normal, 1=advanced, 2=developer
  settingsTier: 0,
  setSettingsTier: (tier) => set({
    settingsTier: tier,
    advancedMode: tier >= 1,
    devMode: tier >= 2,
  }),
  advancedMode: false,
  devMode: false,
  // Legacy shim: toggle between tier 0 and 1
  toggleAdvancedMode: () => {
    const current = get().settingsTier;
    get().setSettingsTier(current >= 1 ? 0 : 1);
  },
```

C) Update `partialize` (line 335): replace `advancedMode` with `settingsTier`:
```typescript
  settingsTier: s.settingsTier,
```

D) Update `merge` function to migrate old `advancedMode: true` → `settingsTier: 1`:
```typescript
  // Migrate old advancedMode boolean to settingsTier
  if (p.settingsTier == null && p.advancedMode) {
    merged.settingsTier = 1;
    merged.advancedMode = true;
    merged.devMode = false;
  }
```

**Step 4: Run test to verify it passes**

Run: `cd frontends/sakura && npx vitest run src/test/appStore.settingsTier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontends/sakura/src/stores/appStore.ts frontends/sakura/src/test/appStore.settingsTier.test.ts
git commit -m "feat(settings): add 3-tier settingsTier replacing advancedMode boolean"
```

---

### Task 2: Update SettingField to use tier prop

**Files:**
- Modify: `frontends/sakura/src/components/SettingField.tsx`

**Step 1: Write the failing test**

- Create: `frontends/sakura/src/test/SettingField.tier.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingField } from '../components/SettingField';

// Mock appStore to control settingsTier
vi.mock('../stores/appStore', () => ({
  useAppStore: vi.fn(),
}));

import { useAppStore } from '../stores/appStore';

describe('SettingField tier visibility', () => {
  it('renders tier=0 settings always', () => {
    (useAppStore as any).mockReturnValue({ settingsTier: 0, layoutMode: 'normal' });
    const { container } = render(
      <SettingField label="Basic Setting" tier={0}>
        <input />
      </SettingField>
    );
    expect(screen.getByText('Basic Setting')).toBeTruthy();
  });

  it('hides tier=1 settings when settingsTier=0', () => {
    (useAppStore as any).mockReturnValue({ settingsTier: 0, layoutMode: 'normal' });
    const { container } = render(
      <SettingField label="Advanced Setting" tier={1}>
        <input />
      </SettingField>
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows tier=1 settings when settingsTier=1', () => {
    (useAppStore as any).mockReturnValue({ settingsTier: 1, layoutMode: 'normal' });
    render(
      <SettingField label="Advanced Setting" tier={1}>
        <input />
      </SettingField>
    );
    expect(screen.getByText('Advanced Setting')).toBeTruthy();
  });

  it('hides tier=2 settings when settingsTier=1', () => {
    (useAppStore as any).mockReturnValue({ settingsTier: 1, layoutMode: 'normal' });
    const { container } = render(
      <SettingField label="Dev Setting" tier={2}>
        <input />
      </SettingField>
    );
    expect(container.innerHTML).toBe('');
  });

  it('backward compat: advanced={true} maps to tier=1', () => {
    (useAppStore as any).mockReturnValue({ settingsTier: 0, layoutMode: 'normal' });
    const { container } = render(
      <SettingField label="Legacy Advanced" advanced>
        <input />
      </SettingField>
    );
    expect(container.innerHTML).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontends/sakura && npx vitest run src/test/SettingField.tier.test.tsx`
Expected: FAIL — `tier` prop not recognized

**Step 3: Implement tier prop in SettingField.tsx**

Replace the component at `frontends/sakura/src/components/SettingField.tsx`:

```tsx
interface SettingFieldProps {
  label: string;
  description?: React.ReactNode;
  tooltip?: string;
  tier?: 0 | 1 | 2;       // 0=normal (always), 1=advanced, 2=dev
  advanced?: boolean;       // Legacy compat: maps to tier=1
  children: React.ReactNode;
}

export function SettingField({
  label,
  description,
  tooltip,
  tier: tierProp,
  advanced,
  children,
}: SettingFieldProps) {
  const { settingsTier, layoutMode } = useAppStore();
  const compactMode = layoutMode !== 'normal';
  const [showTooltip, setShowTooltip] = useState(false);

  // Resolve tier: explicit tier prop > legacy advanced boolean > 0 (always show)
  const requiredTier = tierProp ?? (advanced ? 1 : 0);

  // Gate: hide if user's tier is below the required tier
  if (settingsTier < requiredTier) return null;

  // ... rest of render unchanged ...
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontends/sakura && npx vitest run src/test/SettingField.tier.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontends/sakura/src/components/SettingField.tsx frontends/sakura/src/test/SettingField.tier.test.tsx
git commit -m "feat(settings): SettingField supports tier prop with backward compat"
```

---

### Task 3: Add Developer Mode toggle to GeneralTab

**Files:**
- Modify: `frontends/sakura/src/views/SettingsView.tsx` (GeneralTab, lines ~2228-2239)

**Step 1: Locate the Advanced Mode toggle in GeneralTab's Display section**

It's at lines 2228-2239. Add the Developer Mode toggle immediately after it.

**Step 2: Add Developer Mode checkbox**

After the existing Advanced Mode toggle (line 2239), add:

```tsx
<SettingField
  label="Developer Mode"
  description="Unlock dev console, prompt inspector, raw config editor, and other power-user tools."
  tier={1}
  tooltip="Enables deep debugging tools: LLM request logger, token profiler, prompt assembly viewer, WebSocket monitor, and raw config editing. For advanced users only."
>
  <input
    type="checkbox"
    checked={settingsTier >= 2}
    onChange={(e) => setSettingsTier(e.target.checked ? 2 : 1)}
    className="accent-[var(--color-accent)]"
  />
</SettingField>
```

Note: This uses `tier={1}` — only visible when Advanced mode is already on.

**Step 3: Update GeneralTab props to receive `settingsTier` and `setSettingsTier`**

In the GeneralTab function signature, add:
```tsx
function GeneralTab({ save, cfg, theme, setTheme, advancedMode, toggleAdvancedMode, layoutMode, setLayoutMode, settingsTier, setSettingsTier }: GeneralTabProps)
```

And update the `GeneralTabProps` type and the parent render call accordingly.

**Step 4: Test manually**

- Open Settings → General → Display
- Advanced Mode OFF: only "Advanced Mode" checkbox visible
- Advanced Mode ON: "Developer Mode" checkbox appears below
- Developer Mode ON: all tier=2 settings appear everywhere

**Step 5: Commit**

```bash
git add frontends/sakura/src/views/SettingsView.tsx
git commit -m "feat(settings): add Developer Mode toggle in GeneralTab Display section"
```

---

### Task 4: Version number easter egg in StatusBar

**Files:**
- Modify: `frontends/sakura/src/components/StatusBar.tsx`

**Step 1: Add click counter state**

Near the top of the StatusBar component, add:

```tsx
const [versionClicks, setVersionClicks] = useState(0);
const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const { setSettingsTier, settingsTier } = useAppStore();

const handleVersionClick = () => {
  const newCount = versionClicks + 1;
  setVersionClicks(newCount);

  // Reset counter after 3 seconds of no clicks
  if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
  clickTimerRef.current = setTimeout(() => setVersionClicks(0), 3000);

  if (newCount >= 5 && settingsTier < 2) {
    setSettingsTier(2);
    setVersionClicks(0);
    // Show a brief flash or the toast system (Task 8) will handle this
  }
};
```

**Step 2: Attach onClick to version display**

Find the version number text in StatusBar (search for version string) and wrap it:

```tsx
<span onClick={handleVersionClick} style={{ cursor: 'default', userSelect: 'none' }}>
  v9.0.0
</span>
```

**Step 3: Test manually**

- Click version number 5 times rapidly → Dev mode activates
- Click 3 times, wait 4 seconds, click 2 more → nothing happens (counter reset)

**Step 4: Commit**

```bash
git add frontends/sakura/src/components/StatusBar.tsx
git commit -m "feat(settings): version number easter egg enables dev mode after 5 clicks"
```

---

### Task 5: Rename qwen3_thinking_mode → thinking_mode (backend)

**Files:**
- Modify: `backend/config/app.json` (line 31)
- Modify: `backend/server.py` (lines ~2104, ~2852)
- Modify: `docs/SETTINGS_REFERENCE.md`
- Modify: `frontends/sakura/src/views/SettingsView.tsx` (delete old Qwen3 toggle)

**Step 1: Write the failing test**

- Modify: `backend/tests/test_token_counter.py` or create `backend/tests/test_thinking_mode.py`

```python
"""Tests for generic thinking mode config key."""
import json
from pathlib import Path

def test_config_uses_thinking_mode_not_qwen3():
    """Config should use generic 'thinking_mode', not 'qwen3_thinking_mode'."""
    cfg = json.loads((Path(__file__).parent.parent / "config" / "app.json").read_text())
    llm = cfg.get("llm", {})
    assert "qwen3_thinking_mode" not in llm, "Old key 'qwen3_thinking_mode' should be removed"
    assert "thinking_mode" in llm, "New key 'thinking_mode' should exist"
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest backend/tests/test_thinking_mode.py -v`
Expected: FAIL — old key still present

**Step 3: Implement the rename**

A) `backend/config/app.json` (line 31): Change `"qwen3_thinking_mode": false` → `"thinking_mode": false`

B) `backend/server.py` line ~2104 (non-streaming path):
```python
# Before:
qwen3_thinking = cfg.get("llm", {}).get("qwen3_thinking_mode", False)
if cap_ns.get("supports_thinking") is False:
    qwen3_thinking = False
extra_body = None
if "qwen3" in llm_model_name.lower():
    extra_body = {"chat_template_kwargs": {"enable_thinking": bool(qwen3_thinking)}}

# After:
thinking_enabled = cfg.get("llm", {}).get("thinking_mode", False)
if cap_ns.get("supports_thinking") is False:
    thinking_enabled = False
extra_body = _build_thinking_extra_body(llm_model_name, thinking_enabled)
```

C) `backend/server.py` line ~2852 (streaming path): same rename, same `_build_thinking_extra_body` call

D) Add `_build_thinking_extra_body` helper near the top of server.py (helper functions area):
```python
def _build_thinking_extra_body(model_name: str, enabled: bool) -> dict | None:
    """Build architecture-specific extra_body for thinking/reasoning mode.

    Different model families require different payload formats to enable
    their native reasoning capabilities.

    Args:
        model_name: The LLM model identifier string.
        enabled: Whether thinking mode is enabled in config.

    Returns:
        Dict to merge into the request payload, or None if thinking
        is disabled or model doesn't support a known thinking format.
    """
    if not enabled:
        return None
    name = model_name.lower()
    # Qwen3 / Qwen3.5: uses chat_template_kwargs
    if "qwen3" in name or "qwen-3" in name:
        return {"chat_template_kwargs": {"enable_thinking": True}}
    # DeepSeek-R1/R2: uses enable_thinking flag
    if "deepseek-r1" in name or "deepseek-r2" in name:
        return {"enable_thinking": True}
    # QwQ, Cogito, Sky-T1: generic thinking flag
    if any(p in name for p in ("qwq", "cogito", "sky-t1", "thinker")):
        return {"enable_thinking": True}
    # Model supports thinking but no known format — try generic
    return {"enable_thinking": True}
```

E) `frontends/sakura/src/views/SettingsView.tsx`: Delete the Qwen3 toggle (lines 2851-2859) entirely. The generic thinking toggle will be added in Task 7.

F) `frontends/neon/js/components/SettingsModal.js` line 84: rename `qwen3_thinking_mode` → `thinking_mode` if present.

G) `docs/SETTINGS_REFERENCE.md`: Update the key name.

**Step 4: Run tests**

Run: `.venv/bin/python -m pytest backend/tests/test_thinking_mode.py -v && .venv/bin/python -m pytest backend/tests/ -q`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/config/app.json backend/server.py docs/SETTINGS_REFERENCE.md \
  frontends/sakura/src/views/SettingsView.tsx frontends/neon/js/components/SettingsModal.js \
  backend/tests/test_thinking_mode.py
git commit -m "refactor: rename qwen3_thinking_mode to generic thinking_mode, add multi-arch support"
```

---

## Phase 2: Capability Auto-Detection & Toast System (Tasks 6–8)

### Task 6: Create ToastQueue component

**Files:**
- Create: `frontends/sakura/src/components/ToastQueue.tsx`

**Step 1: Implement ToastQueue**

```tsx
/**
 * Lightweight toast notification queue with Framer Motion animations.
 *
 * Toasts appear top-right of the chat area, auto-dismiss after 4s.
 * Clicking a toast navigates to the relevant settings section.
 *
 * @example
 * const { addToast } = useToastStore();
 * addToast({ message: 'Reasoning enabled', icon: '🧠', onClick: () => openSettings('brain') });
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  icon?: string;
  type?: 'info' | 'success' | 'warning';
  onClick?: () => void;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
    // Auto-dismiss
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration ?? 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function ToastQueue() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div style={{
      position: 'fixed', top: 56, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={() => { toast.onClick?.(); removeToast(toast.id); }}
            style={{
              pointerEvents: 'auto',
              cursor: toast.onClick ? 'pointer' : 'default',
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: '0.78rem',
              fontWeight: 500,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: 320,
            }}
          >
            {toast.icon && <span style={{ fontSize: '1rem' }}>{toast.icon}</span>}
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Mount ToastQueue in App.tsx**

In `frontends/sakura/src/App.tsx`, import and render `<ToastQueue />` at the top level (after router, before any panels):

```tsx
import { ToastQueue } from './components/ToastQueue';
// ... in JSX:
<ToastQueue />
```

**Step 3: Test manually**

Import `useToastStore` in browser console or add a temporary test button.

**Step 4: Commit**

```bash
git add frontends/sakura/src/components/ToastQueue.tsx frontends/sakura/src/App.tsx
git commit -m "feat(ui): add ToastQueue component with Framer Motion animations"
```

---

### Task 7: Reorganize BrainTab — Model Intelligence section

**Files:**
- Modify: `frontends/sakura/src/views/SettingsView.tsx` (BrainTab, lines ~2600-2920)

**Step 1: Plan the reorganization**

Current BrainTab has ONE section "Language Model" with everything in a flat list. We're splitting into 3 sub-sections:

1. **Connection** — Provider, endpoint, API key, model selection
2. **Model Intelligence** — ModelCapabilityCard, thinking toggle, show thinking tags, tool use, vision, context override, tool protocol override
3. **Inference Parameters** — Reply length, temperature, top-P, repetition penalty, max tokens
4. **Context & Memory** — History limit, auto-compact threshold, compact batch size, keep recent

**Step 2: Restructure BrainTab JSX**

Within BrainTab function body, reorganize the settings into the sections listed above. Key changes:

A) **Move** "Show Thinking" (line 2841) into Model Intelligence section:
```tsx
<SettingField label="Show Thinking" description="Display chain-of-thought reasoning in chat." tier={1}
  tooltip="When enabled, shows <think> tags from models with reasoning capability. Useful for debugging or understanding model reasoning.">
  <input type="checkbox" checked={cfg('thinking_visible', true) as boolean}
    onChange={(e) => save('thinking_visible', e.target.checked)}
    className="accent-[var(--color-accent)]" />
</SettingField>
```

B) **Add** generic Thinking Mode toggle (replaces deleted Qwen3 toggle):
```tsx
<SettingField label="Thinking / Reasoning" description="Enable extended reasoning for supported models." tier={1}
  tooltip="Auto-detected for Qwen3, DeepSeek-R1/R2, QwQ, Cogito, and other reasoning-capable models. When enabled, the model spends more time thinking before responding (slower but smarter).">
  <input type="checkbox" checked={cfg('llm.thinking_mode', false) as boolean}
    onChange={(e) => save('llm.thinking_mode', e.target.checked)}
    className="accent-[var(--color-accent)]" />
</SettingField>
```

C) **Add** Tool Use toggle:
```tsx
<SettingField label="Tool Use / Function Calling" description="Allow the AI to use tools when available." tier={1}
  tooltip="When enabled and model supports it, the AI can execute tools (web search, code, etc). Disable to force text-only responses.">
  <input type="checkbox" checked={cfg('llm.tool_use_enabled', true) as boolean}
    onChange={(e) => save('llm.tool_use_enabled', e.target.checked)}
    className="accent-[var(--color-accent)]" />
</SettingField>
```

D) **Add** Vision toggle:
```tsx
<SettingField label="Vision / Image Input" description="Allow sending images to the AI." tier={1}
  tooltip="When enabled and model supports vision, you can attach images to messages. Disable to hide the image upload button.">
  <input type="checkbox" checked={cfg('llm.vision_enabled', true) as boolean}
    onChange={(e) => save('llm.vision_enabled', e.target.checked)}
    className="accent-[var(--color-accent)]" />
</SettingField>
```

E) **Move** Context Window input into Model Intelligence section

F) **Move** Tool Protocol Override dropdown and mark it `tier={2}`:
```tsx
<SettingField label="Tool Protocol Override" description="Force a specific tool calling protocol." tier={2}
  tooltip="Override auto-detected protocol. 'auto' uses capability detection. Only change this if you know the model's native tool format.">
  {/* existing dropdown code */}
</SettingField>
```

G) **Add** new "Context & Memory" section with:
- History Limit (existing, move here)
- Auto-Compact Threshold (new, tier={1}):
```tsx
<SettingField label="Auto-Compact Threshold" description="Compress history when context reaches this % full." tier={1}
  tooltip="When the context budget exceeds this percentage, the app automatically summarizes older messages to free space. Lower values compact sooner (preserves more budget), higher values keep more raw history.">
  <SliderField value={cfg('auto_compact_threshold', 85) as number}
    onChange={(v) => save('auto_compact_threshold', v)}
    min={50} max={95} step={5} suffix="%" />
</SettingField>
```
- Compact Batch Size (tier={2})
- Keep Recent Messages (tier={2})

**Step 3: Test manually**

- Open Settings → Brain tab
- Verify 4 sections are visible: Connection, Model Intelligence, Inference, Context & Memory
- Toggle Advanced Mode → verify tier=1 settings appear/disappear
- Toggle Dev Mode → verify tier=2 settings appear/disappear

**Step 4: Commit**

```bash
git add frontends/sakura/src/views/SettingsView.tsx
git commit -m "feat(settings): reorganize BrainTab into Connection, Model Intelligence, Inference, Context sections"
```

---

### Task 8: Auto-detect capabilities and fire toasts on model change

**Files:**
- Modify: `frontends/sakura/src/views/SettingsView.tsx` (ModelCapabilityCard `onApply` callback)
- Modify: `frontends/sakura/src/stores/appStore.ts` (add auto-detect trigger)
- Modify: `frontends/sakura/src/lib/api.ts` (add `compressSession` endpoint)

**Step 1: Add compressSession to api.ts**

In `frontends/sakura/src/lib/api.ts`, add:

```typescript
/**
 * Trigger rolling compression on a session.
 *
 * @param sessionId - Session to compress.
 * @param keepRecent - Number of recent messages to keep verbatim (default 6).
 * @returns Compression result with summary and archive count.
 */
compressSession: (sessionId: number, keepRecent = 6) =>
  post<{
    ok: boolean;
    summary?: string;
    archived?: number;
    kept?: number;
    batch_range?: [number, number];
    error?: string;
  }>(`/api/sessions/${sessionId}/compress`, { keep_recent: keepRecent }),
```

**Step 2: Add auto-apply logic in ModelCapabilityCard**

When capabilities are fetched, auto-apply to config and fire grouped toast:

```typescript
// Inside ModelCapabilityCard, after setCaps(result):
if (result.ok) {
  setCaps(result);
  // Auto-apply capabilities and notify
  const changes: string[] = [];
  if (result.supports_thinking) {
    save('llm.thinking_mode', true);
    changes.push('Reasoning');
  }
  if (result.supports_tools) {
    save('llm.tool_use_enabled', true);
    changes.push('Tools');
  }
  if (result.supports_vision) {
    save('llm.vision_enabled', true);
    changes.push('Vision');
  }
  if (result.context_window) {
    save('context_limit', result.context_window);
  }
  if (changes.length > 0) {
    const arch = result.architecture ?? result.model_id;
    addToast({
      message: `${arch}: ${changes.join(', ')} enabled`,
      icon: '🧠',
      type: 'success',
      onClick: () => openSettingsTab('brain'),
    });
  }
}
```

**Step 3: Test manually**

- Select a Qwen3 model in Brain settings → toast appears: "qwen3: Reasoning, Tools enabled"
- Select a basic model → no toast, caps turn off
- Check that thinking_mode config is now true after selecting a reasoning model

**Step 4: Commit**

```bash
git add frontends/sakura/src/views/SettingsView.tsx frontends/sakura/src/lib/api.ts frontends/sakura/src/stores/appStore.ts
git commit -m "feat(capabilities): auto-detect and auto-enable model capabilities with toast notifications"
```

---

## Phase 3: Context Budget Pill & Auto-Compaction (Tasks 9–11)

### Task 9: Create ContextBudgetPill component

**Files:**
- Create: `frontends/sakura/src/components/ContextBudgetPill.tsx`

**Step 1: Implement the pill component**

```tsx
/**
 * Clickable context budget pill with expandable per-section breakdown.
 *
 * Positioned top-right of chat panel. Shows token usage as a colored pill
 * that expands on click to show per-section horizontal bars.
 *
 * @example
 * <ContextBudgetPill sessionId={42} messageCount={15} />
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Zap, RefreshCw } from 'lucide-react';
import api from '../lib/api';

interface BudgetSection {
  name: string;
  tokens: number;
  chars: number;
}

interface BudgetData {
  sections: BudgetSection[];
  total_tokens: number;
  context_limit: number;
  usage_pct: number;
  remaining_tokens: number;
  history_messages?: number;
  summaries_included?: number;
  high_importance_kept?: number;
  token_counter?: 'tiktoken' | 'heuristic';
}

function budgetColor(pct: number): string {
  if (pct > 80) return 'var(--color-error, #f44)';
  if (pct > 50) return '#f59e0b';
  return 'var(--color-success, #4ade80)';
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ContextBudgetPill({
  sessionId,
  messageCount,
  autoCompactThreshold = 85,
  onCompact,
}: {
  sessionId: number | null | undefined;
  messageCount: number;
  autoCompactThreshold?: number;
  onCompact?: () => void;
}) {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionId == null) return;
    api.getContextBudget(sessionId)
      .then((data) => { if (data) setBudget(data as BudgetData); })
      .catch(() => {});
  }, [sessionId, messageCount]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    if (expanded) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  const handleCompact = async () => {
    if (!sessionId || compacting) return;
    setCompacting(true);
    try {
      await api.compressSession(sessionId);
      onCompact?.();
      // Refetch budget
      const data = await api.getContextBudget(sessionId);
      if (data) setBudget(data as BudgetData);
    } catch { /* ignore */ }
    setCompacting(false);
  };

  if (!budget || budget.context_limit === 0) return null;

  const pct = Math.round(budget.usage_pct);
  const color = budgetColor(pct);
  const compactAt = Math.round(budget.context_limit * autoCompactThreshold / 100);
  const counterLabel = budget.token_counter === 'tiktoken' ? 'exact' : '~est';

  return (
    <div ref={panelRef} style={{ position: 'relative', zIndex: 100 }}>
      {/* Pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          fontSize: '0.72rem', fontWeight: 500,
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: `1px solid ${color}40`,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}60`,
        }} />
        <span>{fmtTokens(budget.total_tokens)} / {fmtTokens(budget.context_limit)} ({pct}%)</span>
        <ChevronDown size={10} style={{
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }} />
      </button>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              width: 280, padding: 12, borderRadius: 12,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              fontSize: '0.72rem',
            }}
          >
            {/* Section bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {budget.sections.map((s) => {
                const secPct = budget.context_limit > 0
                  ? Math.max(1, Math.round(s.tokens / budget.context_limit * 100))
                  : 0;
                return (
                  <div key={s.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{fmtTokens(s.tokens)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--color-border)' }}>
                      <div style={{
                        width: `${Math.min(secPct, 100)}%`, height: '100%',
                        borderRadius: 2, backgroundColor: 'var(--color-accent)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                );
              })}

              {/* Remaining */}
              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 6, marginTop: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Remaining</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{fmtTokens(budget.remaining_tokens)}</span>
                </div>
              </div>

              {/* Threshold line */}
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                Auto-compact at {autoCompactThreshold}% ({fmtTokens(compactAt)})
                {' · '}
                <span style={{
                  padding: '1px 5px', borderRadius: 4, fontSize: '0.6rem',
                  backgroundColor: budget.token_counter === 'tiktoken' ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)',
                  color: budget.token_counter === 'tiktoken' ? '#4ade80' : '#f59e0b',
                }}>{counterLabel}</span>
              </div>

              {/* Compact Now button */}
              <button
                onClick={handleCompact}
                disabled={compacting || pct < 30}
                style={{
                  marginTop: 4, padding: '5px 0', borderRadius: 6, width: '100%',
                  fontSize: '0.7rem', fontWeight: 500,
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-accent-text)',
                  border: 'none', cursor: compacting ? 'wait' : 'pointer',
                  opacity: compacting || pct < 30 ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                {compacting ? <><RefreshCw size={10} className="animate-spin" /> Compacting...</> : <><Zap size={10} /> Compact Now</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Test manually** — will be mounted in Task 10

**Step 3: Commit**

```bash
git add frontends/sakura/src/components/ContextBudgetPill.tsx
git commit -m "feat(context): create ContextBudgetPill with expandable per-section breakdown"
```

---

### Task 10: Mount ContextBudgetPill and replace old ContextBudgetBar

**Files:**
- Modify: `frontends/sakura/src/components/StatusBar.tsx`
- Modify: `frontends/sakura/src/components/ChatInterface.tsx` (or `ChatThread.tsx` — wherever the chat area header is)

**Step 1: Remove the old ContextBudgetBar from StatusBar**

In `StatusBar.tsx`, remove the `ContextBudgetBar` component definition (lines 14-89) and its render call (line ~570). Keep the StatusBar component but remove the thin bar at the top.

**Step 2: Add ContextBudgetPill to the chat area top-right**

Find where the chat panel header/toolbar is rendered. Mount the pill there:

```tsx
import { ContextBudgetPill } from './ContextBudgetPill';

// In the chat area header, top-right position:
<div style={{ position: 'absolute', top: 8, right: 12, zIndex: 50 }}>
  <ContextBudgetPill
    sessionId={sessionId}
    messageCount={messageCount}
    autoCompactThreshold={cfg('auto_compact_threshold', 85) as number}
    onCompact={() => { /* refetch messages if needed */ }}
  />
</div>
```

The exact placement depends on the chat panel layout. The pill should be positioned top-right of the chat area, below any nav icons but not overlapping the 3D viewport.

**Step 3: Test manually**

- Start chat → pill appears top-right showing token usage
- Send messages → pill updates after each reply
- Click pill → breakdown drawer opens with section bars
- Click "Compact Now" → compression fires

**Step 4: Commit**

```bash
git add frontends/sakura/src/components/StatusBar.tsx frontends/sakura/src/components/ChatInterface.tsx
git commit -m "feat(context): mount ContextBudgetPill in chat area, remove old ContextBudgetBar"
```

---

### Task 11: Auto-compact trigger and inline chat feedback

**Files:**
- Modify: `frontends/sakura/src/stores/chatStore.ts` (after assistant reply completes)
- Modify: `frontends/sakura/src/components/DialogueBubble.tsx` (render compaction messages)

**Step 1: Add auto-compact trigger in chatStore.ts**

After the `done` SSE event is processed (~line 276), add:

```typescript
// Auto-compact: check context usage after each reply
if (sessionId) {
  api.getContextBudget(sessionId).then((budgetData: any) => {
    const threshold = appStore.getState().config?.auto_compact_threshold ?? 85;
    if (budgetData?.usage_pct > threshold) {
      // Inject compaction system message
      const compactMsg: ChatMessage = {
        id: `compact-${Date.now()}`,
        role: 'system',
        text: '⟳ Auto-compacting conversation...',
        createdAt: Date.now(),
        status: 'sent',
      };
      set((s) => ({ messages: [...s.messages, compactMsg] }));

      api.compressSession(sessionId).then((result: any) => {
        if (result?.ok) {
          // Update the system message with results
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === compactMsg.id
                ? { ...m, text: `⟳ Auto-compacted — ${result.archived} messages summarized, context freed to ${Math.round(budgetData.usage_pct * (1 - result.archived / budgetData.history_messages))}%` }
                : m
            ),
          }));
        } else {
          // Remove the system message on failure
          set((s) => ({ messages: s.messages.filter((m) => m.id !== compactMsg.id) }));
        }
      }).catch(() => {
        set((s) => ({ messages: s.messages.filter((m) => m.id !== compactMsg.id) }));
      });
    }
  }).catch(() => {});
}
```

**Step 2: Style compaction messages in DialogueBubble**

In `DialogueBubble.tsx`, add a special case for system messages starting with `⟳`:

```tsx
// At the top of DialogueBubble render:
if (message.role === 'system' && message.text.startsWith('⟳')) {
  return (
    <div style={{
      textAlign: 'center', padding: '6px 16px', margin: '8px 0',
      fontSize: '0.7rem', color: 'var(--color-text-muted)',
      borderTop: '1px dashed var(--color-border)',
      borderBottom: '1px dashed var(--color-border)',
      opacity: 0.7,
    }}>
      {message.text}
    </div>
  );
}
```

**Step 3: Add `auto_compact_threshold` to backend config**

In `backend/config/app.json`, add to the top-level:
```json
"auto_compact_threshold": 85,
```

**Step 4: Test manually**

- Set a small context limit (e.g. 4096 tokens)
- Send many messages until usage exceeds 85%
- Verify inline "Auto-compacting..." message appears and updates
- Verify context budget pill drops after compaction

**Step 5: Commit**

```bash
git add frontends/sakura/src/stores/chatStore.ts frontends/sakura/src/components/DialogueBubble.tsx backend/config/app.json
git commit -m "feat(context): auto-compact at configurable threshold with inline chat feedback"
```

---

## Phase 4: Dev Mode Panels (Tasks 12–14)

### Task 12: DevConsole panel — request/event logger

**Files:**
- Create: `frontends/sakura/src/components/DevConsole.tsx`
- Modify: `frontends/sakura/src/App.tsx` (mount)

**Step 1: Create DevConsole with tabbed interface**

Create `frontends/sakura/src/components/DevConsole.tsx` with:
- **Request Log tab**: intercept fetch calls, log method/URL/status/duration/tokens
- **Event Log tab**: subscribe to SSE events, viewer postMessages, WebSocket frames
- **Performance tab**: FPS counter, memory usage, render counts

The DevConsole is a collapsible bottom panel (like browser DevTools) that only mounts when `devMode === true`.

```tsx
/**
 * DevConsole — developer tools panel with request logger, event log, and performance metrics.
 *
 * Only rendered when devMode is enabled (settingsTier >= 2).
 * Collapsible bottom panel similar to browser DevTools.
 */
```

Implementation: ~200 lines. Uses a global `devLog` store (Zustand) that intercepts API calls via a fetch wrapper. The console renders entries with timestamp, method, URL, status code, duration, and response size.

**Step 2: Mount conditionally in App.tsx**

```tsx
const { devMode } = useAppStore();
// ... at the bottom of the app layout:
{devMode && <DevConsole />}
```

**Step 3: Commit**

```bash
git add frontends/sakura/src/components/DevConsole.tsx frontends/sakura/src/App.tsx
git commit -m "feat(dev): add DevConsole panel with request logger, event log, performance metrics"
```

---

### Task 13: PromptInspector panel

**Files:**
- Create: `frontends/sakura/src/components/PromptInspector.tsx`
- Modify: `backend/server.py` (add `/api/dev/prompt-inspect` endpoint)

**Step 1: Add backend endpoint**

In `backend/server.py`, add:

```python
@app.get("/api/dev/prompt-inspect/{session_id}")
async def dev_prompt_inspect(session_id: int, char_id: int = None):
    """Return the fully assembled prompt for debugging.

    Dev-mode endpoint that reconstructs the exact prompt sections
    that would be sent to the LLM, with per-section token counts.

    Args:
        session_id: Active session ID.
        char_id: Character ID (uses active character if omitted).

    Returns:
        Dict with sections list, each containing name, content preview,
        and token count.
    """
    # Build sections using existing _build_prompt_sections()
    # Return the section breakdown without sending to LLM
```

**Step 2: Create PromptInspector component**

~150 lines. Fetches `/api/dev/prompt-inspect/{sessionId}`, displays each section in a collapsible panel with syntax highlighting and token counts. Only renders when `devMode === true`.

**Step 3: Add to Settings or as a standalone panel**

Mount as a tab in DevConsole or as a standalone overlay accessible from dev settings.

**Step 4: Commit**

```bash
git add frontends/sakura/src/components/PromptInspector.tsx backend/server.py
git commit -m "feat(dev): add PromptInspector panel with per-section prompt breakdown"
```

---

### Task 14: RawConfigEditor panel

**Files:**
- Create: `frontends/sakura/src/components/RawConfigEditor.tsx`

**Step 1: Implement JSON editor**

~120 lines. Textarea with JSON syntax validation that reads from `GET /api/config` and writes via `POST /api/config`. Shows validation errors inline. Only renders when `devMode === true`.

Features:
- Monospace textarea with line numbers
- JSON parse validation on every change (red border on invalid)
- "Save" button that calls `POST /api/config` with the full config
- "Reset" button that reloads from server
- Diff indicator showing changed keys

**Step 2: Add to DevConsole as a tab**

```tsx
// In DevConsole tabs:
{ label: 'Config', content: <RawConfigEditor /> }
```

**Step 3: Commit**

```bash
git add frontends/sakura/src/components/RawConfigEditor.tsx
git commit -m "feat(dev): add RawConfigEditor for direct JSON config editing"
```

---

## Phase 5: Code Review of Existing Implementation (Task 15)

### Task 15: Deep code review of Part 1 (Context Compaction) and Part 2 (Animation Library)

**Files:** All files from the previous implementation plan (already on disk, uncommitted)

**Step 1: Review Part 1 — Context Compaction**

Check each file for:
- `backend/llm/token_counter.py` — edge cases (empty strings, None, huge strings)
- `backend/llm/importance_scorer.py` — scoring formula correctness, edge cases
- `backend/llm/context_assembler.py` — budget overflow, empty session, missing table graceful fallback
- `backend/preflight.py` v35 migration — idempotency, rollback safety
- `backend/server.py` integration — all `chars // 4` replaced, `compress_session` rolling behavior

**Step 2: Review Part 2 — Animation Library**

Check each file for:
- `tools/convert_bvh_to_glb.py` — bone mapping completeness, rotation math
- `tools/download_animation_packs.py` — URL validity, error handling, disk space
- `backend/data/animation_manifest.json` — JSON validity, file path references
- `frontends/shared/viewer/viewer.html` — AnimationRegistry, _triggerAutoAnimation, BVH loader
- `frontends/sakura/src/components/AnimationBrowser.tsx` — error states, empty states
- `frontends/sakura/src/stores/viewerStore.ts` — new command kinds

**Step 3: Run full test suite**

Run: `.venv/bin/python -m pytest backend/tests/ -q`
Expected: 190 passed

**Step 4: Document findings and fix any issues**

Create a checklist of issues found. Fix critical bugs immediately, log minor issues.

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: address code review findings for context compaction and animation library"
```

---

## Verification Checklist

### Phase 1 (Tier System)
- [ ] `settingsTier` persists across page reloads
- [ ] Old `advancedMode: true` in localStorage migrates to `settingsTier: 1`
- [ ] SettingField `tier={0}` always visible, `tier={1}` only when Advanced, `tier={2}` only when Dev
- [ ] `advanced={true}` backward compat maps to `tier={1}`
- [ ] Developer Mode checkbox only visible when Advanced is ON
- [ ] Version number 5-click easter egg enables Dev Mode
- [ ] `qwen3_thinking_mode` renamed to `thinking_mode` everywhere (backend + frontend + config + docs)
- [ ] `_build_thinking_extra_body` handles Qwen3, DeepSeek, QwQ, Cogito, generic

### Phase 2 (Capabilities + Toasts)
- [ ] Toast appears top-right with Framer Motion animation
- [ ] Toast auto-dismisses after 4 seconds
- [ ] Loading Qwen3 model fires grouped toast: "qwen3: Reasoning, Tools enabled"
- [ ] Capabilities auto-apply to config (thinking_mode, tool_use_enabled, vision_enabled)
- [ ] BrainTab has 4 sections: Connection, Model Intelligence, Inference, Context & Memory
- [ ] Old Qwen3 Thinking Mode toggle is deleted

### Phase 3 (Context Budget + Auto-Compact)
- [ ] Budget pill shows colored dot + token count + percentage
- [ ] Click pill expands per-section breakdown with bars
- [ ] "exact" / "~est" badge shows counter method
- [ ] Auto-compact threshold configurable (default 85%)
- [ ] "Compact Now" button works in expanded pill
- [ ] Inline system message appears during auto-compaction
- [ ] System message updates with results after completion
- [ ] Old 3px ContextBudgetBar removed from StatusBar

### Phase 4 (Dev Mode)
- [ ] DevConsole panel appears at bottom when Dev Mode ON
- [ ] Request Log shows API calls with timing
- [ ] PromptInspector shows assembled sections with token counts
- [ ] RawConfigEditor validates JSON and saves on submit
- [ ] All dev panels hidden when Dev Mode OFF

### Phase 5 (Code Review)
- [ ] All 190 existing tests still pass
- [ ] No `chars // 4` remaining in server.py (all replaced with token_counter)
- [ ] compress_session uses rolling summarization (not monolithic)
- [ ] AnimationRegistry correctly maps emotions to clips
- [ ] No critical bugs in review findings
