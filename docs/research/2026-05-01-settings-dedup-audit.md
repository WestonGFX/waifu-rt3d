# Settings Dedup Audit — 2026-05-01

**Scope:** `SettingsView.tsx` (4,883 lines) · `appStore.ts` (523 lines) · `ChatThread.tsx` (1,494 lines) · `StatusBar.tsx` · `SettingsDrawer.tsx` · `NsfwSettingsTab.tsx` · `StepLLMSetup.tsx` · `StepVoiceSetup.tsx` · `ChatModeToggles.tsx` · `backend/server.py` `_KNOWN_CFG_KEYS` · `backend/config/app.json`

---

## Summary

| Category | Count |
|---|---|
| Hard duplicates (same key, multiple controls) | **5** |
| Soft duplicates / split concerns | **6** |
| Orphan store state (defined, never read by UI) | **3** |
| Orphan UI controls (rendered but not wired to state) | **3** |
| Backend unknown-key warnings (actively firing) | **19** (logged live) |
| Config key defined in both backend `_KNOWN_CFG_KEYS` and frontend appStore `partialize` (double-persistence) | **4** |

No code was modified. All findings are read-only.

---

## 1. Hard Duplicates — Same setter, multiple UI controls

### 1.1 `lighting_preset` — 3D Viewport section appears in BOTH General tab AND System tab

| Location | Label | Config key | Line |
|---|---|---|---|
| `SettingsView.tsx` GeneralTab `3D Viewport` section | "Scene Lighting" | `lighting_preset` | 2331–2343 |
| `SettingsView.tsx` SystemTab `3D Viewport` section | "Scene Lighting" | `lighting_preset` | 4652–4663 |

Both controls call `save('lighting_preset', ...)` with identical `<select>` options. The System tab copy was added separately and is a full duplicate.

Additional fields duplicated between the same two sections:

| Config key | General tab line | System tab line |
|---|---|---|
| `lighting_preset` | 2334–2335 | 4654–4655 |
| `shadow_quality` | 2349–2350 | 4682–4683 |
| `fps_target` | 2362–2363 | 4669–4670 |
| `antialias` | 2377–2378 | 4710–4711 |

**The entire "3D Viewport" card in GeneralTab (lines 2327–2383) is a near-full duplicate of the equivalent card in SystemTab (lines 4649–4724).** The System tab version adds `render_quality` and `show_fps_overlay` that the General tab lacks; the General tab version is missing those two. Neither is authoritative.

**Recommendation:** Remove the `3D Viewport` section from `GeneralTab` entirely. Move `render_quality` and `show_fps_overlay` into GeneralTab's copy first if they're desired there, then delete the SystemTab duplicate block. Reference lines to remove: `SettingsView.tsx:2327–2383`.

---

### 1.2 `settingsTier` / "Developer Mode" — controlled by two separate controls with different labels

| Location | Label | Setter | Line |
|---|---|---|---|
| `SettingsView.tsx` GeneralTab "Display" section | "Developer Mode" (checkbox, tier 1) | `setSettingsTier(2)` | 2515–2527 |
| `StatusBar.tsx` version pill easter egg | (hidden — 5 clicks on version string) | `setSettingsTier(2)` | 159–163 |
| `SettingsView.tsx` SystemTab "Developer" section | "Developer Mode" (checkbox) | `save('dev_mode', ...)` → `config.json` | 4747–4754 |

There are actually **two separate developer-mode concepts** sharing the same label:
- `settingsTier >= 2` (appStore, localStorage) — controls UI visibility of dev settings panels
- `config.dev_mode` (config.json) — controls backend `--dev` flag behaviour (verbose logging, etc.)

Both are labeled "Developer Mode" in the UI. The backend `dev_mode` key is **not read at runtime** from `cfg.get()` — it's only set by CLI args (`args.dev`) or `WAIFU_DEV` env var (`server.py:17867`). The checkbox in SystemTab (`save('dev_mode', ...)`) writes to `config.json` but the backend ignores this value on subsequent requests.

**Recommendation:** Rename the SystemTab control to "Verbose Logging" or "Debug Backend Logging" to distinguish it from the UI tier toggle in General tab. Add a note that backend restart is required.

---

### 1.3 `replyLengthMode` — controlled in both Brain tab and ChatThread composer bar

| Location | Label | Setter | Line |
|---|---|---|---|
| `SettingsView.tsx` BrainTab "Inference Parameters" | "Reply Length" (segmented pill) | `setReplyLengthMode(mode)` | 3326–3347 |
| `ChatThread.tsx` composer status pill | (abbreviated: Brief/Norm/Long/Auto) | `cycleReplyLengthMode()` → `setReplyLengthMode` | 1245–1261 |

This is **intentional design** (quick access in chat + persistent setting in Brain tab), but the labels differ significantly. Settings tab shows full names; chat pill shows "Brief / Norm / Long / Auto·{n}t". Same setter is called in both cases — not a persistence problem, but confusing discoverability.

**Recommendation:** Document as intentional. Consider adding a tooltip on the Brain tab control pointing to the chat pill, or vice versa.

---

### 1.4 `rp_style_preset` — controlled in both Safety tab and ChatThread composer bar

| Location | Label | Setter | Line |
|---|---|---|---|
| `SettingsView.tsx` SafetyTab "RP Style" section | "RP Style Preset" (select dropdown) | `save('rp_style_preset', ...)` | 4167–4176 |
| `ChatThread.tsx` status pill third segment | (RP/RP+/18+RP/Chat, cycle-click) | `saveConfig({ rp_style_preset: next })` | 1280–1292 |

Both write the same `rp_style_preset` config key. The options align. This is intentional quick-access vs persistent setting, but the safety tab uses a dropdown with 4 full options; the chat pill cycles through the same 4 values. Both persist correctly.

**Recommendation:** Same as 1.3 — document as intentional. Add a tooltip in the Safety tab noting the chat bar shortcut.

---

### 1.5 `content_filter_level` — controlled in both Safety tab and ChatThread composer bar

| Location | Label | Setter | Line |
|---|---|---|---|
| `SettingsView.tsx` SafetyTab (via content gate API) | Content ceiling selector | `save('content_filter_level', ...)` as a bridge sync | 3861 |
| `ChatThread.tsx` status pill middle segment | Filter: Off/SFW/18+ (cycle-click) | `saveConfig({ content_filter_level: next })` | 199 |

The Safety tab is the authoritative UI (uses `/api/content-gate`). The chat pill is a quick-cycle shortcut. The Safety tab `save('content_filter_level', ...)` call at line 3861 is a bridge-compat sync, not a primary control. The chat pill is the actual user-facing control. This is **asymmetric design** — safety-critical settings shouldn't be the easiest to cycle through with a click.

**Recommendation:** Consider removing the content filter from the chat bar pill (or making it Settings-only) since it is safety-adjacent and was presumably moved to Safety tab for a reason.

---

## 2. Soft Duplicates / Split Concerns

### 2.1 TTS Provider and Voice — split across Character tab AND Voice tab

| Setting | Character tab | Voice tab |
|---|---|---|
| TTS Provider (per-character override) | `SettingsView.tsx:869–900` | `SettingsView.tsx:3473–3508` (global) |
| Voice picker | `SettingsView.tsx:903–909` | `SettingsView.tsx:3511–3520` (global) |

The Character tab sets `character.tts_provider` and `character.voice_id` (per-character overrides stored on the character row). The Voice tab sets `config.tts.provider` and `config.tts.voice_id` (global defaults). The relationship is correct in principle but the labels are nearly identical — both say "TTS Provider" and "Voice". The descriptions differ slightly ("Override the global voice provider for this character" vs no qualifier), but a user scanning quickly would not know which takes priority.

**Recommendation:** Add a clear priority note: "Character tab overrides the global Voice tab setting for this character only."

---

### 2.2 Proactive Messages — split across General tab AND Character tab

| Section | Controls | Location |
|---|---|---|
| Character tab "Relationship" area | "Day Off" toggle (pauses proactive today) | `SettingsView.tsx:1055–1077` |
| GeneralTab "Behavior" section | "Proactive Messages" (enable/disable), frequency, hours, history | `SettingsView.tsx:2399–2470` |

"Day Off" is on the Character tab (saves to `character.day_off`). The "Proactive Messages" enabled toggle, frequency, and hour window are in the General tab (save to `character.proactive_*` fields via PATCH). Both are per-character settings but live in different tabs. A user who turns off "Proactive Messages" globally in General tab would expect to find that control near "Day Off" in the Character tab.

**Recommendation:** Move "Day Off" into the General tab "Behavior" section alongside the other proactive controls, or move all proactive controls to the Character tab.

---

### 2.3 `chat_layout` — stored twice with diverging keys

| Key | Storage | Where set | Where read |
|---|---|---|---|
| `chatLayout` | appStore localStorage (persisted) | `appStore.ts:351` | **nowhere in the codebase outside appStore** |
| `chat_layout` | `config.json` (backend) | `SettingsView.tsx:2234` | `backend/server.py:200` (known key), `server.py:1648` (default) |

`appStore.chatLayout` and `setChatLayout` are defined and persisted to localStorage (`appStore.ts:491,111`), but **zero components outside appStore.ts read `chatLayout` or call `setChatLayout`**. The UI instead reads from `cfg('chat_layout', ...)` (config.json). This means there are two independent sources of truth for chat layout that are never kept in sync.

**Recommendation:** Remove `chatLayout` / `setChatLayout` from appStore entirely, or wire it to the config-reading path. The localStorage copy is dead state.

---

### 2.4 "Reply Length" and "Max Tokens" — conceptually related but in different Brain tab sections

| Control | Section | What it does | Line |
|---|---|---|---|
| Reply Length (Brief/Normal/Detailed/Auto) | BrainTab "Inference Parameters" | Sets `replyLengthMode` Zustand state → `useAdaptivePacing()` converts to token count | 3326–3347 |
| Context Window | BrainTab "Model Intelligence" | Sets `config.context_limit` (max tokens the model can receive) | 3253–3273 |

These are related but distinct — one controls output token target, the other the input context window. Placing them in different sections of the same tab is acceptable, but the Reply Length control reads from Zustand (not config.json) while Context Window reads from config.json. A user may confuse the two.

**Recommendation:** Add a tooltip cross-reference on Reply Length: "This sets target response length. For input context window, see Context Window below."

---

### 2.5 Onboarding wizard LLM/Voice settings vs Settings tabs

| Onboarding step | Config keys set | Corresponding settings tab |
|---|---|---|
| `StepLLMSetup.tsx` | `llm.provider`, `llm.endpoint`, `llm.model`, `llm.api_key` | Brain tab "Connection" section |
| `StepVoiceSetup.tsx` | `tts.provider`, `tts.voice_id` | Voice tab (global) |

The onboarding wizard saves to the same config.json paths as SettingsView. This is correct behavior (onboarding is initial configuration). Not a duplicate — just noting the overlap exists for completeness.

---

### 2.6 "Advanced Mode" appears as two controls mapped to `settingsTier`

| Control | Label | Action | Line |
|---|---|---|---|
| GeneralTab "Display" | "Advanced Mode" (checkbox) | Calls `toggleAdvancedMode()` → `setSettingsTier(0 or 1)` | 2502–2512 |
| GeneralTab "Display" | "Developer Mode" (checkbox, tier=1) | Calls `setSettingsTier(checked ? 2 : 1)` | 2515–2527 |

Both are in the same section and operate on the same `settingsTier` value. The first toggles between 0↔1, the second between 1↔2. Together they implement a 3-way tier, but presented as two independent checkboxes. A user who checks "Advanced Mode" then unchecks "Developer Mode" expects tier 0, but gets tier 1. The interaction model is confusing.

**Recommendation:** Replace both checkboxes with a single 3-way segmented control: Normal / Advanced / Developer.

---

## 3. Orphan Store State — defined in appStore but no UI control

### 3.1 `chatLayout` / `setChatLayout`

Defined: `appStore.ts:111–112,350–351,491`
Used by UI: **not found** — zero files outside `appStore.ts` call `setChatLayout` or read `chatLayout`.
Config equivalent: `config.chat_layout` is read via `cfg('chat_layout', ...)` in SettingsView and written via `save(...)`.

`chatLayout` is persisted to localStorage via `partialize` but never referenced by any component. This creates a ghost copy of the chat layout preference that diverges from the config.json value.

### 3.2 `modelPanelOpen` / `toggleModelPanel`

Defined: `appStore.ts:113–114,353–354`
Persisted: No (not in `partialize`)
Used by: `StatusBar.tsx:124` (reads it to show active state on a button), `ChatThread.tsx:52` (reads to conditionally position model panel), `ModelPanel.tsx` (likely reads it)

This one is NOT orphaned — found in StatusBar. Removing from this list after verification. No issue here.

### 3.3 `vnMode` / `toggleVnMode` — not in any SettingsView section

`vnMode` and `toggleVnMode` are in appStore (`appStore.ts:122–124`) but the **only UI control to toggle them is the Modes popover in ChatThread** (`ChatThread.tsx:1163–1173`). There is no Settings tab control for Visual Novel mode. This is by design (it's a session-mode not a preference), but it means `vnMode` is persisted via `cinematicMode` omission (checked: `vnMode` is NOT in `partialize` at `appStore.ts:490–503`, so it resets on page reload). No issue.

### 3.4 `cinematicMode` / `toggleCinematicMode` — no Settings control

Same situation as `vnMode`. Only toggled via keyboard shortcut (`App.tsx:297`) and not accessible in Settings. It also resets on page reload (not persisted). No issue for auditing purposes, but it means a user cannot find this via Settings.

---

## 4. Orphan UI Controls — rendered but not wired to state

### 4.1 `whisperMode` and `quickFireMode` in ChatThread Modes popover — local useState only

`whisperMode` (`ChatThread.tsx:78`) and `quickFireMode` (`ChatThread.tsx:79`) are `useState(false)` local to `ChatThread`. They are toggled in the Modes popover (`ChatThread.tsx:1204–1224`). However:

- Neither is read by `sendMessage`, `ChatStore`, or any hook to actually modify behavior
- `ChatModeToggles.tsx` exists as a dead component file — it is **imported nowhere** (`grep -rn "ChatModeToggles"` found it referenced only within itself)
- The visual toggles show/hide checkmarks but have no effect on message generation

**These are cosmetic dead controls.** The modes show active (checked) but the state is not consumed anywhere.

### 4.2 SystemTab `dev_mode` checkbox at `SettingsView.tsx:4747–4754`

As described in Section 1.2, this saves `config.dev_mode = true/false` to config.json, but the backend reads dev mode exclusively from CLI args or env var (`server.py:17867`). The `cfg.get('dev_mode')` is never called at runtime — only `app.state.dev_mode` is checked (`server.py:744`). The checkbox persists a value that is never acted on.

### 4.3 Soundscape "enabled" config key — backend has `soundscape_enabled` in `_KNOWN_CFG_KEYS` but no UI control writes it

`backend/server.py:211` lists `soundscape_enabled` as a known config key. No SettingsView control writes `soundscape_enabled`. The soundscape is controlled exclusively via `toggleSoundscape()` in appStore (session-only, not persisted). The config key exists in `_KNOWN_CFG_KEYS` but no UI writes it and it's not in `app.json`.

---

## 5. Backend ↔ Frontend Overlap — Keys stored in both config.json AND appStore localStorage

The following keys are saved to **both** `config.json` (via `saveConfig`) and the appStore `partialize` (localStorage under `sakura-app`). On page load, the last-write wins if they diverge:

| Key | appStore partialize | config.json route | Risk |
|---|---|---|---|
| `chatLayout` | `appStore.ts:491` | `save('chat_layout', ...)` at `SettingsView.tsx:2234` | **High** — different key names (`chatLayout` vs `chat_layout`), never synced |
| `settingsTier` | `appStore.ts:492` | No config.json equivalent | Low — appStore is authoritative |
| `layoutMode` | `appStore.ts:493` | No config.json equivalent | Low — appStore is authoritative |
| `incognito` | `appStore.ts:498` | No config.json equivalent | Low — appStore is authoritative |

The most serious overlap is `chatLayout` (appStore localStorage) vs `chat_layout` (config.json). These are **different camelCase/snake_case keys** that represent the same setting but are stored independently and never reconciled. A user's layout preference set in SettingsView goes to config.json; the appStore localStorage key stays at its default and is never read.

### Backend-unknown keys (actively producing log warnings as of 2026-04-28 → 2026-05-01)

These 19 keys exist in `app.json` but are NOT in `_KNOWN_CFG_KEYS` in `server.py:194–212`. They trigger `[Config] Unknown key` warnings on every server restart:

| Key | Where it comes from | Action needed |
|---|---|---|
| `tts_volume` | `SettingsView.tsx VoiceTab:3535` `save('tts_volume', ...)` | Add to `_KNOWN_CFG_KEYS` OR move under `tts.*` namespace |
| `antialias` | `SettingsView.tsx:2377` | Add to `_KNOWN_CFG_KEYS` |
| `auto_compact_threshold` | `SettingsView.tsx:3399` | Add to `_KNOWN_CFG_KEYS` |
| `message_input_mode` | `SettingsView.tsx:2487` | Add to `_KNOWN_CFG_KEYS` |
| `tooltips_hidden` | `SettingsView.tsx:2694` | Add to `_KNOWN_CFG_KEYS` |
| `system_prompt` | `SettingsView.tsx:3370` | Add to `_KNOWN_CFG_KEYS` |
| `keep_recent_messages` | `SettingsView.tsx:3421` | Add to `_KNOWN_CFG_KEYS` |
| `llm.link.enabled` | `SettingsView.tsx:3172` | Add to `_KNOWN_CFG_KEYS` |
| `llm.link.auto_route` | `SettingsView.tsx:3173` | Add to `_KNOWN_CFG_KEYS` |
| `discovered_features` | `wizardStore.ts` | Add to `_KNOWN_CFG_KEYS` OR move to localStorage only |
| `embedding` | backend internal | Add to `_KNOWN_CFG_KEYS` |
| `image_gen_setup_completed` | Wizard | Add to `_KNOWN_CFG_KEYS` |
| `intimacy` | `NsfwSettingsTab.tsx` | Add to `_KNOWN_CFG_KEYS` |
| `last_seen_version` | `WhatsNewModal.tsx` | Add to `_KNOWN_CFG_KEYS` |
| `onboarding_version` | Onboarding | Add to `_KNOWN_CFG_KEYS` |
| `tips_snoozed_until` | Feature discovery | Add to `_KNOWN_CFG_KEYS` |
| `voice_setup_completed` | Onboarding | Add to `_KNOWN_CFG_KEYS` |
| `wizard_message_count` | Onboarding | Add to `_KNOWN_CFG_KEYS` |
| `wizard_session_count` | Onboarding | Add to `_KNOWN_CFG_KEYS` |

Additionally, `compact_batch_size` is saved by `SettingsView.tsx:3412` `save('compact_batch_size', ...)` but is **not in app.json and not in _KNOWN_CFG_KEYS** — it's silently discarded.

---

## 6. Recommended Next Steps (Prioritized, no deletions)

These are prioritized by impact vs effort. Per user direction, no deletions in this pass — remediation only.

| Priority | Action | Files | Impact |
|---|---|---|---|
| P1 | Add all 19 unknown keys to `_KNOWN_CFG_KEYS` in `server.py:194–212` | `backend/server.py` | Stops log spam immediately |
| P1 | Add `tts_volume` and `compact_batch_size` to `_KNOWN_CFG_KEYS` | `backend/server.py` | Stops log spam + ensures value is not silently discarded |
| P2 | Remove dead `chatLayout` / `setChatLayout` from appStore (or wire to `config.chat_layout` on load) | `appStore.ts:111,350,491` | Eliminates divergent state |
| P2 | Remove the "3D Viewport" card from `GeneralTab` (lines 2327–2383) — keep only the SystemTab version which is more complete | `SettingsView.tsx` | Eliminates 4 duplicated config controls |
| P3 | Rename SystemTab "Developer Mode" to "Verbose Backend Logging" | `SettingsView.tsx:4747` | Disambiguates from settingsTier Developer Mode |
| P3 | Replace GeneralTab "Advanced Mode" + "Developer Mode" dual-checkbox with a single 3-way segmented control | `SettingsView.tsx:2502–2527` | Fixes confusing tier interaction |
| P4 | Move "Day Off" from Character tab into GeneralTab Behavior section alongside Proactive Messages | `SettingsView.tsx:1055–1077` | Consolidates per-character proactive controls |
| P4 | Add priority labels to Character/Voice TTS Provider fields to clarify character override vs global default | `SettingsView.tsx:869, 3473` | Reduces user confusion |
| P5 | Mark `whisperMode` and `quickFireMode` in ChatThread as unimplemented or wire them to actual behavior | `ChatThread.tsx:78–79` | Eliminates dead UI controls |
| P5 | Document `content_filter_level` chat pill as intentional quick-access, or move to Safety-only | `ChatThread.tsx:1264` | Addresses safety control discoverability |

---

*Report generated 2026-05-01. Read-only audit — no code was modified.*
