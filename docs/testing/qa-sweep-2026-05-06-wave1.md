# Browser QA Sweep — Wave 1 (Session 29)
Date: 2026-05-06  
Method: MCP browser automation (chrome-in-browser) + code audit agent  
Tester: Claude (automated)

---

## Executive Summary

| Feature | Status | Notes |
|---|---|---|
| Chat flow (send/stream/abort) | ✅ PASS | LLM connected, streaming works, abort button works |
| 3D Viewer open/close | ✅ PASS | 119 FPS on Full preset |
| 3D Camera presets | ✅ PASS | Full, Bust, Face, 3/4, Side all respond |
| **Animation Library (crash)** | 🔴 **FIXED** | Crashed app on open — `clip.emotions.join()` on undefined |
| Animation clips availability | ⚠️ BLOCKED | 0/36 clips on disk — download script URLs are dead |
| Memory Browser (all 4 tabs) | ✅ PASS | Overview, About You, Memories, Journal all load |
| Settings (General/Brain/Voice) | ✅ PASS | Theme picker, model config, TTS config all work |
| Character switching | ✅ PASS | Header, avatar, bond pill, placeholder all update |
| Quick replies | ✅ PASS (code audit) | Wired end-to-end in chatStore + ChatThread |
| Voice feature pipeline | ✅ PASS (code audit) | VAD state machine complete, no stubs |
| Character creation | ✅ PASS (code audit) | api.createCharacter + CHARA import both wired |
| Keyboard shortcuts | ✅ PASS (code audit) | Pure generic hook — no broken refs |
| Image regen (in-session) | ✅ PASS (code audit) | Regen button wired and functional |
| Image URL persistence | 🟡 SUSPECT | imageUrl/imagePrompt not saved to DB — lost on reload |

---

## Bug Fixed This Session

### B1 — AnimationBrowser crash: `clip.emotions.join()` on undefined [FIXED]
- **File:** `frontends/sakura/src/components/AnimationBrowser.tsx:215`
- **Symptom:** Clicking "Animation Library" accordion → entire app goes black (React tree crash)
- **Root cause:** `clip.emotions` is null/undefined for clips without emotional tags. `.join()` called without optional chain.
- **Fix:** `clip.emotions?.join(', ') ?? ''` (one character change)
- **Commit:** `10519fa`

---

## Outstanding Issues

### P1 — Animation packs: download script has dead URLs
- **File:** `tools/download_animation_packs.py`
- **Symptom:** 36 clips in `backend/data/animation_manifest.json`, 0 files on disk. All clips show as unavailable (grey, unclickable).
- `--pack sillytavern`: `https://github.com/SillyTavern/SillyTavern-VRM-Assets.git` → 404 (repo doesn't exist; actual org has `Extension-VRM` but no animation files)
- `--pack vrm-expression-library`: jsdelivr CDN URLs all 404
- **Impact:** Animation Library UI works but is completely empty for all users.
- **Fix needed:** Find working VRMA sources and update script URLs, OR ship a small set of CC0 VRMA files bundled with the app.

### P2 — Image URL not persisted to DB
- **Files:** `backend/server.py` (get_session_messages), `backend/preflight.py` (messages table schema), `frontends/sakura/src/stores/chatStore.ts` (loadHistory)
- **Symptom:** Regenerated images appear in-session but vanish after page reload. Regen button never appears on history messages.
- **Root cause:** No `image_url`/`image_prompt` columns in `messages` table. `loadHistory` doesn't restore image fields.
- **Fix needed:** Schema migration v72 adding `image_url`/`image_prompt` to messages + server.py read + chatStore restore.

### P3 — 3D Viewer: 0 FPS on initial panel open (UX)
- **Symptom:** When 3D panel first opens, canvas is black and FPS shows 0 until user clicks a camera preset.
- **Impact:** New users see a black panel and may think the viewer is broken.
- **Fix needed:** Auto-trigger the "Full" camera preset on `modelLoaded` event, or show a loading indicator until first render.

### P4 — Avatar grounding/centering off on narrow viewer
- **Symptom:** When viewer panel is narrow (coexisting with chat panel), the VRM character clips to the right edge instead of centering. Camera "Face" preset pointed off-model.
- **Area:** Known sensitive area — `viewer.html` camera positioning.
- **Impact:** Model partially invisible without manually clicking "Full" preset.

---

## Code Audit Findings (from background agent)

Performed by `codebase-analyst` agent (69 tool calls, 191s).

| Area | Finding |
|---|---|
| Quick replies SSE flow | Fully wired. `chatStore.ts:285-290` → `ChatThread.tsx:982-988` |
| Voice VAD pipeline | Complete. `useVoiceMode.ts` 255 lines, idle/listening/processing states intact |
| Character creation | `CreateView.tsx:242` (CHARA import) + `:269` (manual form) both call real APIs |
| Settings tabs | All 10 tabs render real components — no "Coming Soon" stubs |
| Keyboard shortcuts | Pure generic hook — callers own the actions, no broken refs |
| Memory Browser | No stubs, no raw fetch() calls (all migrated to api.* in session 27) |

---

## Test Environment
- Frontend: `http://localhost:5175/sakura/`
- Backend: `http://localhost:8080`
- LLM: `qwen/qwen3.5-9b` via OpenAI-compat at `http://10.0.0.17:1234/v1` (thinking model, slow ~3min for simple prompt)
- Schema: v71
- VRM: Panicandy.vrm (Rin's assigned model)
