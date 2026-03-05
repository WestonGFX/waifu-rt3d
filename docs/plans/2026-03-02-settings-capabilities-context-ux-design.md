# Settings Consolidation, Capability Auto-Detection & Context Budget UX

> **Status:** Design approved — awaiting implementation plan
> **Date:** 2026-03-02
> **Scope:** Frontend (Sakura) + Backend settings/capabilities/context

---

## Problem Statement

The app has grown organically, leaving settings scattered across multiple locations, model-specific toggles (Qwen3 thinking) alongside generic capability detection, no dev/power-user mode, and a minimal context budget display. This design unifies and cleans up the entire settings + capabilities + context UX.

---

## Part 1: 3-Tier Settings System

### Architecture

Replace `advancedMode: boolean` in `appStore.ts` with `settingsTier: 0 | 1 | 2`:

| Tier | Name | Who | What's visible |
|------|------|-----|----------------|
| 0 | Normal | Casual users | Essential settings only |
| 1 | Advanced | Enthusiasts | Current `advanced` settings |
| 2 | Developer | Power users | Dev console, raw JSON editor, prompt debugger, etc. |

### Activation Methods

- **Normal → Advanced:** Toggle in General tab (existing behavior, preserved)
- **Advanced → Developer:** Checkbox "Developer Mode" appears only when Advanced is ON (tier 1+)
- **Easter egg:** Click version number in StatusBar 5 times → enables both Advanced + Dev Mode

### SettingField Component Change

```tsx
// Before:
<SettingField label="..." advanced>

// After:
<SettingField label="..." tier={1}>  // 0=normal, 1=advanced, 2=dev
```

Backward-compatible: `advanced={true}` maps to `tier={1}`.

### Developer Mode Features (Tier 2)

1. **Dev Console Panel** — tabbed panel: Request Log, Event Log, Performance metrics
2. **Raw Config JSON Editor** — JSON editor with schema validation for app.json
3. **Prompt Inspector** — view assembled LLM context with per-section token breakdown
4. **Capability Override Panel** — force-set vision/tools/thinking/context regardless of detection
5. **WebSocket Monitor** — live view of voice duplex, emotion, viewer postMessage traffic
6. **Token Profiler** — per-message token costs, tiktoken vs heuristic comparison
7. **Memory Inspector** — browse tiered memory entries, importance scores, summary chains

### appStore.ts Changes

```ts
// Replace:
advancedMode: boolean;
toggleAdvancedMode: () => void;

// With:
settingsTier: 0 | 1 | 2;
setSettingsTier: (tier: 0 | 1 | 2) => void;

// Computed (backward-compat):
advancedMode: boolean;   // true when tier >= 1
devMode: boolean;        // true when tier >= 2
```

Persist migration: `advancedMode: true` → `settingsTier: 1`.

---

## Part 2: Unified Model Capability Detection & Auto-Enable

### Problem

Two separate thinking controls exist:
1. `ModelCapabilityCard` — generic, detects `supports_thinking` for any architecture via HuggingFace
2. `"Qwen3 Thinking Mode"` toggle — hardcoded to Qwen3, manual on/off

### Solution: Detect → Auto-Enable → Notify → Allow Override

```
Model loaded in LM Studio
        │
        ▼
Backend: enrich_model() queries HuggingFace
        │
        ▼
Returns: {supports_thinking, supports_tools, supports_vision, context_window, ...}
        │
        ▼
Frontend receives capabilities:
  ├─► supports_thinking=true → auto-enable + toast "Reasoning enabled — Qwen3 detected"
  ├─► supports_tools=true → auto-enable + toast "Tool use enabled"
  ├─► supports_vision=true → enable image UI + toast "Vision enabled"
  └─► context_window detected → auto-set budget + toast "Context: 32k tokens"
        │
        ▼
User can override any of these in Advanced settings
```

### Changes

1. **DELETE** standalone `"Qwen3 Thinking Mode"` toggle (SettingsView.tsx:2851-2859)
2. **Rename** config key `llm.qwen3_thinking_mode` → `llm.thinking_mode` (generic)
3. **Backend** (`server.py`): Expand `extra_body` thinking injection beyond Qwen3:
   - Qwen3: `{"chat_template_kwargs": {"enable_thinking": true}}`
   - DeepSeek-R1/R2: `{"enable_thinking": true}` (or model-specific format)
   - QwQ, Cogito, etc.: architecture-specific injection patterns
4. **Move** all capability settings into unified "Model Intelligence" section
5. **Auto-detection**: On model change, call `GET /api/models/active-capabilities`, auto-apply, show grouped toast

### Toast Notification System

- Lightweight toast queue using Framer Motion exit animations
- Position: top-right of chat area
- Auto-dismiss: 4 seconds
- Clickable → opens "Model Intelligence" settings section
- Grouped: "Qwen3-8B: Reasoning, Tools, Vision enabled" (one toast for multiple caps)

---

## Part 3: Context Budget Visualization & Auto-Compaction UX

### A. Context Budget Pill

**Position:** Top-right corner of chat panel (below nav, not overlapping 3D viewport).

```
Normal:     [ 🟢 2.1k / 8k (26%) ]
Warning:    [ 🟡 6.2k / 8k (78%) ]
Critical:   [ 🔴 7.5k / 8k (94%) ]
Compacting: [ ⟳ Compacting... ]
```

**Click to expand** dropdown:
- Per-section horizontal bars (system prompt, chat history, RAG/lore, summaries, recalled)
- Token counts per section
- "Remaining" bar
- Auto-compact threshold: "Auto-compact at 85% (6.8k tokens)"
- Counter badge: "exact" (tiktoken) or "~est" (heuristic)
- Manual "Compact Now" button

### B. Auto-Compaction Trigger

- **Trigger:** After each assistant reply, if `usage_pct >= 85%`, auto-fire `compress_session()`
- **Threshold configurable:** `auto_compact_threshold` in Advanced settings (default 85%)
- **Chat feedback:** Inline system message (muted styling, small font, dashed border):
  ```
  ⟳ Auto-compacted — 20 messages summarized, context freed to 42%
  ```
- Not stored as real message — injected client-side
- Budget pill pulses green after compaction

### C. Cross-Character Context

Sessions are isolated per character. Budget pill shows current character's context. Switching characters refreshes the display. No cross-character compaction.

### D. Token Counting Accuracy

Already implemented (Part 1 of previous plan):
- tiktoken `cl100k_base` when installed → "exact" badge
- `chars // 4` fallback → "~est" badge
- `is_tiktoken_available()` flag sent in SSE done events and budget API

---

## Part 4: Settings Consolidation & Cleanup

### BrainTab Reorganization

```
BrainTab
├── Connection
│   ├── LLM Provider (dropdown)                    [Normal]
│   ├── Endpoint URL                                [Normal]
│   ├── API Key                                     [Normal]
│   └── Model Selection                             [Normal]
│
├── Model Intelligence                              ← NEW unified section
│   ├── [ModelCapabilityCard] auto-detect display    [Normal]
│   ├── Thinking / Reasoning toggle (auto-detected)  [Advanced]
│   ├── Show Thinking Tags (<think> in chat)         [Advanced]
│   ├── Tool Use / Function Calling toggle           [Advanced]
│   ├── Vision toggle                                [Advanced]
│   ├── Context Window Override                      [Advanced]
│   └── Tool Protocol Override dropdown              [Dev]
│
├── Inference Parameters
│   ├── Reply Length                                 [Normal]
│   ├── Temperature                                  [Advanced]
│   ├── Top-P                                        [Advanced]
│   ├── Repetition Penalty                           [Advanced]
│   └── Max Tokens                                   [Advanced]
│
└── Context & Memory
    ├── History Limit                                [Advanced]
    ├── Auto-Compact Threshold %                     [Advanced, default 85]
    ├── Compact Batch Size                           [Dev]
    └── Keep Recent Messages count                   [Dev]
```

### GeneralTab Reorganization

```
GeneralTab
├── Appearance
│   ├── Theme                                        [Normal]
│   ├── Layout Mode: Normal/Compact/Mobile           [Normal]
│   └── Settings Panel Mode: Drawer/Sidebar          [Normal]
│
├── Display
│   ├── Advanced Mode toggle                         [Normal]
│   ├── Developer Mode toggle                        [Advanced]
│   ├── FPS Cap                                      [Advanced]
│   └── Proactive Messages                           [Advanced]
│
└── Data
    ├── Export Settings                               [Normal]
    ├── Import Settings                               [Normal]
    └── Reset to Defaults                             [Advanced]
```

### Tooltip Policy

- Every Advanced and Dev tier setting gets a tooltip explaining purpose + when to use it
- Normal tier settings get tooltips only if the label isn't self-explanatory
- All tooltips use the existing `<HelpCircle>` icon pattern from `SettingField`

### Deleted/Moved Items

| Setting | From | To | Action |
|---------|------|----|--------|
| Qwen3 Thinking Mode | BrainTab Inference | — | DELETE (replaced by generic thinking toggle) |
| Show Thinking | BrainTab Inference | BrainTab Model Intelligence | MOVE |
| Tool Protocol override | BrainTab scattered | BrainTab Model Intelligence | MOVE (Dev tier) |
| Context limit display | StatusBar only | BrainTab Context & Memory | ADD override control |

---

## Files Affected

### Frontend (Sakura)

| File | Action | Changes |
|------|--------|---------|
| `stores/appStore.ts` | MODIFY | `settingsTier` replaces `advancedMode`, add `devMode` computed, persist migration |
| `views/SettingsView.tsx` | MODIFY | Delete Qwen3 toggle, reorganize BrainTab sections, add "Model Intelligence" section, add "Context & Memory" section |
| `components/SettingField.tsx` | MODIFY | `tier` prop replaces `advanced`, visibility gate on `settingsTier` |
| `components/StatusBar.tsx` | MODIFY | Replace thin bar with clickable budget pill, add version click counter for easter egg |
| `components/ContextBudgetPill.tsx` | NEW | Expandable context budget display with per-section breakdown |
| `components/ToastQueue.tsx` | NEW | Lightweight toast notification system (Framer Motion) |
| `components/DevConsole.tsx` | NEW | Dev mode: request logger, event log, performance metrics |
| `components/PromptInspector.tsx` | NEW | Dev mode: assembled prompt viewer with section breakdown |
| `components/RawConfigEditor.tsx` | NEW | Dev mode: JSON editor for app.json |
| `components/ChatInterface.tsx` | MODIFY | Add compaction system message injection, auto-compact trigger |
| `lib/api.ts` | MODIFY | Add auto-compact endpoint call, toast capability grouping |

### Backend

| File | Action | Changes |
|------|--------|---------|
| `server.py` | MODIFY | Rename `qwen3_thinking_mode` → `thinking_mode`, expand thinking injection to multi-arch, add auto-compact threshold to config, add `/api/dev/prompt-inspect` endpoint |
| `config/app.json` | MODIFY | Rename config key, add `auto_compact_threshold` |
| `llm/model_enricher.py` | MODIFY | Add architecture-specific thinking injection patterns |

---

## Verification Checklist

- [ ] Settings tier system: Normal shows ~8 settings, Advanced shows ~25, Dev shows ~35+
- [ ] Old "Qwen3 Thinking Mode" toggle is gone from UI
- [ ] Generic thinking toggle auto-enables when `supports_thinking` detected
- [ ] Loading Qwen3 model → toast notification → thinking auto-enabled
- [ ] Loading basic model (no caps) → no toasts, features stay off
- [ ] Context budget pill shows accurate token count (exact vs est badge)
- [ ] Clicking pill opens breakdown with per-section bars
- [ ] Sending 50+ messages → auto-compact fires at 85% → inline system message appears
- [ ] Dev mode: console panel shows request/response logs
- [ ] Dev mode: prompt inspector shows assembled context sections
- [ ] Version number easter egg (5 clicks) enables dev mode
- [ ] All Advanced/Dev settings have tooltips
- [ ] Compact/mobile layout hides descriptions correctly
- [ ] Existing tests still pass after reorganization
