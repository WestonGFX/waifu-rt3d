# Plan: Avatar Fix, Helper Auto-Start, UX Overhaul, Camera Controls, Scenario System

## Context

User-reported issues from testing AnimeGirly on 2026-03-20. Core problems: avatar doesn't appear on fresh launch, helper must be started manually, settings UX is "atrocious" (buried, non-intuitive tab names, cramped, too many tabs), orbit controls trap camera inside walls/underground, and Scenario System #9 is 70% scaffolded but the integration layer is a stub.

**Previous session completed:** Voice preview error handling, avatar animation overhaul (3-4x amplitudes, gestures, gaze, blink), room floor detection fix, animation quality wiring, `/checkpoint` skill.

---

## Item 1 — Model Loading & Corrupted File Cleanup

**Problem:** Avatar does load, but some GLB files in character_files/models/ are corrupted and fail silently. The camera/environment often hides the avatar (see Item 3). Need to identify and quarantine broken files so users don't accidentally select them.

**Fix A — Auto-load with fallback:** Add `useEffect` in ModelContext that auto-selects the first model on fresh launch. If loading fails, try the next file.

**File:** `src/context/ModelContext.tsx`
- Add useEffect after localStorage persistence effect (~line 86)
- Fetch `/api/models`, try `data.files[0].url`, dispatch `SET_MODEL_URL`
- If `SET_ERROR` fires (model corrupt), auto-advance to next file in list
- Skip if `state.modelUrl` already set

**Fix B — Test all models programmatically:** Write a one-time script (or use Chrome automation) to load each file in character_files/models/ and record which ones fail. Move broken files to `character_files/backups/` (gitignored).

**File:** Add `character_files/backups/` to `.gitignore`

---

## Item 2 — Helper Auto-Start via Vite Plugin (~30 min)

**Problem:** Helper must be running at `127.0.0.1:8765` for TTS/STT/models. No spawn mechanism exists.

**Fix:** Add `helperAutoStartPlugin()` to `vite.config.ts` that spawns the helper subprocess during `npm run dev`.

**File:** `vite.config.ts`
- New plugin function using `configureServer()` hook
- Check if helper is already running (fetch `/v1/health`)
- If not, spawn `uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765` with cwd=`helper/`
- Pipe stdout/stderr to Vite logger with `[helper]` prefix
- Kill process on server close
- Graceful fallback: if `uv` not found or spawn fails, log warning and continue

---

## Item 3 — Camera Controls & Viewer UX (~45 min)

**Problem:** OrbitControls lets camera go through walls, under the floor, and into impossible positions. No way to reset camera or center on character. Controls are buried in Rendering settings.

**Fix:** Add camera guardrails and a visible reset button.

**File:** `src/components/viewer/ThreeViewer.tsx`
- Clamp `controls.minPolarAngle` / `controls.maxPolarAngle` to prevent going underground (~10° to ~170°)
- Clamp `controls.minDistance` / `controls.maxDistance` to scene-appropriate range
- Add collision detection: if camera position is inside scene bounds below floor, snap it back up

**File:** `src/components/viewer/ViewerChrome.tsx`
- Add "Center on character" button (visible in viewer overlay, not buried in settings)
- On click: reset camera position to the environment's `cameraPreset` values
- Add "Reset camera" keyboard shortcut (e.g. `R` key or double-click)

---

## Item 4 — Settings UX Overhaul (~2.5 hours)

**Problem:** 16 tabs with non-intuitive names. Everything buried. User says "the way we have the UX/UI flow is terrible" and "it is displayed poorly." The grouped tabs (Core/AI & Story/Social/System → sub-tabs) add cognitive overhead. Chat is cramped.

### Phase A — Restructure information architecture

**Goal:** Reduce from 16 tabs to ~8 with obvious names. Merge related panels.

Current structure (4 groups × 4 sub-tabs):
```
Core:       General | Voice | Rendering | Rooms
AI & Story: Persona | Psychology | Memory | Content
Social:     Lorebook | Relationship | Scenarios | Backup
System:     Models | Advanced | Usage | Themes
```

Proposed restructure (~8 clear tabs, no sub-groups):
```
Companion    — Persona + Psychology + Memory (who she is)
Voice        — TTS/STT profiles + preview (how she sounds)
World        — Rooms + Themes + Lorebook (where she lives)
Chat         — Content settings + Scenarios (how conversations work)
Models       — Model manager + Rendering + Performance (hardware)
Account      — Backup + Usage + Advanced (your data)
```

**File:** `src/components/settings/SettingsPanel.tsx`
- Flatten from 2-level (group → sub-tab) to 1-level tabs
- Merge panels as listed above (combine into composite panels or render sequentially)
- Use clear, user-friendly names

### Phase B — Strengthen visual primitives

**File:** `src/components/settings/SettingsPrimitives.tsx`
- `SETTINGS_PRIMARY_BUTTON`: `bg-anime-50 text-anime-700` → `bg-anime-500 text-white hover:bg-anime-600`
- All buttons: bump from `text-xs` to `text-sm`
- Add `ToggleRow` component: label + description + Radix Switch in consistent row
- Strengthen tab active state (solid background, not just text color change)

### Phase C — Panel consistency sweep

| Panel | Change |
|-------|--------|
| `GeneralSettingsPanel.tsx` | Delete custom `Toggle`, use `ToggleRow` |
| `AdvancedSettingsPanel.tsx` | Replace inline styles with shared primitives |
| `ModelManagerPanel.tsx` | Replace inline toggle with `Switch` |
| `MemorySettingsPanel.tsx` | Replace inline toggle with `ToggleRow` |
| All others | Scan for custom toggles/inline card styles, standardize |

---

## Item 5 — Scenario System Completion (~2.5 hours)

**Problem:** Wizard UI and LLM generation work. `handleScenarioApply` is a stub that only creates a bare thread title.

### Step 1 — Extend types
**File:** `src/types/scenario.ts`
- Add to `ScenarioConfig`: `personaId?`, `relationshipPremise?`, `goal?`
- Add to `ScenarioOutput`: `title`

### Step 2 — Enhance prompt builder
**File:** `src/services/scenarioGeneratorService.ts`
- Add `relationshipPremise`, `goal` to `buildGenerationPrompt()`
- Add `TITLE:` section to LLM output format
- Update `parseGenerationOutput()` to extract title

### Step 3 — Implement full onApply (CRITICAL PATH)
**File:** `src/components/chat/ChatPanel.tsx`
- Clone active persona with `rawPromptOverride` = scenario systemPrompt
- Create thread linked to cloned persona
- Inject director note with scenario context
- Inject opening message as assistant message
- Close wizard
- **Reuse:** `putPersona` from `appDb.ts`, `addDirectorNote` from ChatContext, `createThread` from CompanionContext

### Step 4 — Persona picker in wizard
**File:** `src/components/scenario/ScenarioWizard.tsx`
- Add persona dropdown in step 4 ('characters')
- Pre-fill character[0] from selected persona
- Track `personaId` on ScenarioConfig state

### Step 5 — Regenerate + Edit on preview
**File:** `src/components/scenario/ScenarioWizard.tsx`
- "Regenerate" button → clear scenario, re-run generation
- "Edit" toggle on system prompt → textarea
- "Edit" toggle on opening message → textarea

### Step 6 — DB persistence (optional, defer if time-constrained)
**File:** `src/services/appDb.ts`
- Add `scenarios` table to schema
- CRUD functions for saving/listing scenarios

---

## Item 6 — Environment Avatar Placement (Research + Fix)

**Problem:** Only the minimalistic bedroom correctly places the avatar on the floor. All other rooms (office, dining room, living rooms, sci-fi hanger) have the avatar floating, underground, or in unrealistic positions. The bedroom works because it has a hand-crafted `.scene.json` metadata file with exact anchor coordinates. Other rooms use `inferEnvironmentMetadata()` which guesses floor height from bounding boxes.

**Previous fix (this session):** Improved `sampleFloorHeight()` to pick lowest upward-facing surface and reduced anchor spread. But this is not enough — the raycasting approach is fundamentally fragile for rooms with varied geometry.

**Fix approach — Create .scene.json metadata for each room:**

Each room needs a hand-crafted metadata file like the bedroom has. The challenge is determining correct Y positions without loading GLBs programmatically.

**Step 1 — Build a scene calibration tool:**
- Add a dev-mode overlay in ThreeViewer that shows current camera position, avatar position, and floor height
- Add click-to-set-anchor: click a point on the floor → record world-space position
- Add "Export metadata" button that dumps the current anchors/camera/hotspots as JSON
- This lets the user visually calibrate each room

**Step 2 — Calibrate each room:**
Using the dev tool, load each environment and:
- Click the floor to set anchor positions
- Adjust camera preset to a good default view
- Export as `<room-name>.scene.json` alongside the `.glb` file

**Step 3 — Improve inferEnvironmentMetadata as fallback:**
For user-uploaded rooms that don't have metadata:
- Use multiple raycast samples (grid pattern, not just center) to find the most common floor Y
- Weight toward surfaces that are flat and large
- Place anchors at confirmed floor positions only

**Files:**
- `src/components/viewer/ThreeViewer.tsx` — dev overlay + click-to-anchor
- `scene_files/*.scene.json` — new metadata files for each room
- `src/services/environmentLibraryService.ts` — metadata loading

---

## Execution Order

1. **Item 1** (model loading + cleanup) → get avatar visible
2. **Item 2** (helper auto-start) → unblocks TTS/STT
3. **Item 3** (camera controls) → stop getting trapped underground
4. **Item 4** (settings UX overhaul) → biggest UX improvement
5. **Item 5** (scenario system) → feature completion
6. **Item 6** (environment placement) → fix all rooms, not just bedroom

Run `/checkpoint` after items 1-3, then again after items 4-5, and after item 6.

## Verification

After each item:
- `npx tsc --noEmit` — must pass
- `npx vitest run` — no new failures (3 pre-existing allowed)
- Chrome automation screenshots for UI changes
- Manual test: fresh launch → avatar auto-loads
- Manual test: `npm run dev` → `[helper]` logs appear in terminal
- Manual test: camera can't go underground, "center" button works
- Manual test: settings tabs are findable and make sense
- Manual test: apply scenario template → thread + persona + messages created

## New Session Instructions

Start a new Claude Code session in `/Users/chris/Code/AnimeGirly` and type:

```
/go
```

The `/go` skill reads plans and dispatches agents. If `/go` doesn't pick up this plan automatically, paste this instead:

```
Execute the plan at .claude/plans/lively-leaping-wombat.md — all 5 items in order.
Read memory files project_session_handoff.md and feedback_ux_pain_points.md first.
Branch: claude/improvements, PR #2 open against master.
Run /checkpoint after items 1-3 and again after 4-5.
```
