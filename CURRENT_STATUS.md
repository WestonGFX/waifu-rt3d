# Current Project Status

**Last updated:** 2026-06-14 (Stage 2b Phase 1 — click-to-walk navigation with real raycast collision)
**Branch:** `master` · HEAD = `140c3f8` · **fully synced with origin/master** (Stage 2b Phase 1 pushed `cd27227..140c3f8`).
**Schema version:** v89 (`characters.environment_url` — Stage 2a avatar 3D location; v88 = memory forget/privacy trust spine).
**Tests:** **3,121 backend pytest** + **498 sakura vitest** passing, tsc clean.
**Automation:** 12 agents, ~22 skills, 6 rules, 0 wired hooks (per Apr 26 audit), 3 MCP servers

**Archive:** Sessions 1-11 + NSFW sprint detail + Mar 29 research expansion moved to [`docs/sessions/ARCHIVE.md`](docs/sessions/ARCHIVE.md) during session 16 token-budget prune. Nothing deleted — relocated.

## Active Work

**Session (2026-06-22) — Stage 3 AI motion: Phase 2 COMPLETE + hardened, gesture library, Phase 3 engine, EMAGE scoped. Branch `master`, HEAD `96a9feb` — ALL PUSHED (0 unpushed).** Plan: `docs/plans/2026-06-14-stage3-ai-motion.md`. Design: `docs/research/2026-06-22-stage3-phase3-design.md`.

Big session — 9 commits, all pushed (incl. the 10 prior Stage-3 doc commits):
- **Phase 2 — `tools/dart_to_glb.py`** (`1214e09`): SMPL-X axis-angle `poses (162,165)` → per-VRM-bone three-vrm **normalized** quaternion GLB the viewer's `retargetClip` path plays like Stage-1 clips. Frame **measured** on the box (SMPL rest=Y-up template, posed=Z-up AMASS): conversion = rigid stand-up `G_pre=Rx(-90°)` on the **root (hips) only**; children keep raw SMPL local (cancels in chain). First attempt conjugated every bone → laid her on her side; render gate caught it → root-only fix + regression test. Gate PASS on walk: 22/22 tracks, upright, grounded, arms track, zero eversion.
- **Phase 2 hardening** (`4e7f9e7`): gate-proven on **wave** (clean arm-wave, correct reach — 16° rest-arm offset is a non-issue) + **turn**. Generalizes across locomotion/gesture/yaw.
- **`--face-camera`** (`c9369dd`): auto-yaw so generated clips face the user (back-to-camera wave → greets the camera). +tests.
- **Pre-baked gesture library** (`7eaa2e5`): `backend/motion/dart_gesture_library.json` (8 gestures: wave/clap/cheer/point/cross_arms/bow/stretch/shrug, each mapped to Kokoro emotion/intent triggers) + `tools/build_dart_gestures.py`. All 8 render-gated clean. **Zero runtime GPU** — the pragmatic bridge. GLBs gitignored/regenerable.
- **Phase 3 ENGINE** (`9ec261e`): `backend/motion/dart_runner.py` — resident-model DART wrapper (load once / generate ~1.3 s), DART imports lazy (Mac-importable). **Live-verified on the box** (nod-head clip → npz → GLB → gate). +4 Mac-side pytest.
- **Design + EMAGE scoping** (`a2a9489`, `96a9feb`): Phase 3 networked-service design grounded in `motion_server.py`/`remote_client.py`; Phase 6 EMAGE stand-up plan (license-gated).

**Next (gated, next-session):**
1. **Phase 3 networked service** — deploy the waifu repo to the box as a persistent daemon in the `dart` conda env (both waifu + DART importable), wire `motion_server` AI branch → `DartRunner` → clip-artifact response, `remote_client` decode→`dart_to_glb`→`/files` URL, `api.ts` mirror, `/status` advert, live round-trip verify. Design: `docs/research/2026-06-22-stage3-phase3-design.md`.
2. **Phase 5.1 emotion→motion** — wire `dart_gesture_library.json` triggers into the Kokoro/embodiment seam (play the mapped gesture on emotion).
3. **Phase 6 EMAGE** — resolve license intent, then stand up (separate session).

**Live status:** push gate clear (no active OPEN BUG/UNFIXED/BLOCKER markers). **3154 backend pytest** (+33 this session) + 498 vitest, tsc clean. **0 commits unpushed — origin/master synced at `96a9feb`.**

---

**Session (2026-06-14) — Stage 2b Phase 1: click-to-walk navigation. Branch `master`, HEAD `b5c8857` (2 commits, LOCAL).** Plan: `docs/plans/2026-06-14-stage2b-p1-click-to-walk.md`.

- **`df6e99f` feat(stage2b-P1): click-to-walk navigation with real raycast collision.** The avatar can now walk around her loaded 3D room. Dev-gated floor-click → she turns to face the point, plays the `walking` clip, translates the root at 1.1 m/s (y glued to floor), stops short of walls/props via real `THREE.Raycaster` collision (floor-pick + forward capsule sweep), settles to idle, camera target follows. `viewer.html` WalkController + `setWalkMode`/`walkTo`/`stopWalk`/`getAvatarPose` postMessage handlers + drag-vs-click guard; `viewerStore.ts` `dispatchSetWalkMode`/`dispatchWalkTo`/`dispatchStopWalk`; `ModelPanel.tsx` dev-mode-only 🚶 Walk toggle beside the environment picker. Scope is bounded: straight-line walk only — **pathfinding AROUND obstacles, run/turn clips, and Kokoro-driven destinations are deferred to a future Phase 2 plan**. New render-gate `tools/verify/render_walk.mjs` PASS (grounding y==0 at start/mid/arrival, on-target arrival, collision stop). +11 vitest. Caught + fixed a TDZ crash via the render-gate (`_walk` declared after the animate loop → hoisted to module scope).
- **`b5c8857` fix(stage2b-P1): BalanceLayer root-relative CoG + posture investigation.** The headless render-gate showed a forward hunch; investigated under the hypothesis limit and confirmed it's a **headless swiftshader artifact** — at native 60fps (`tools/verify/render_walk_headed.mjs`, real GPU) the walk posture is upright/natural (`docs/testing/screenshots/2026-06-14-stage2b-p1/headed/h2-t240ms.png`). Kept one real latent fix: `BalanceLayer.calculateCoG()` measured CoG in absolute world space → walking the root to (x,z) triggered a bogus ~9cm hip shift; now root-relative (zero change at origin).
- **Known minor (Phase 2 tuning, not a bug):** camera-follow keeps the orbit target on her, so walking *toward* the camera brings her close enough to near-plane clip. Acceptable for the dev tool.

**Live status:** push gate clear (no active OPEN BUG/UNFIXED/BLOCKER markers). 3121 pytest + 498 vitest, tsc clean. **Pushed to origin/master `cd27227..140c3f8` — 0 commits unpushed** (2026-06-14).

---

**Session (2026-06-13) — Retarget Phase B (clip library) + backlog reconciliation + CC model-fallback config fix. Branch `master`, HEAD `4838386`.**

- **Retarget Phase B DONE** (`4838386`): Phase C (`f88fa90`) had wired `KOKORO_GESTURE_CLIPS` to fetch `/files/animations/vrm-baked/<stem>.normalized.glb`, but only 5 stale normalized clips were on disk and 3 of the 6 mapped gestures had no normalized file — half of Kokoro's gestures 404'd. Ran `tools/convert_to_normalized.py --in-dir` over the 28 raw bakes → full 28-clip normalized library (22 humanoid nodes each). Render gate PASSED on the 3 previously-missing gestures (`hands_forward_gesture`, `blow_a_kiss`, `head_nod_yes`): 22/22 tracks, 4/4 distinct frames, arms track, grounded, zero eversion. convert pytest 10/10. Clips gitignored (per-machine runtime assets). Proof: `docs/testing/screenshots/2026-06-13-phaseB-gestures/`.
- **Backlog reconciliation** — stale "pending" items confirmed already DONE in code: M6 item 22 (`/api/characters/{id}/nsfw-eligibility` endpoint live, session 43 `d5c1e48`), bond burn-down finishing pass (zero `setPendingAchievement`/`setPendingLevelUp` writes remain), M8 marketing docs (`docs/marketing/eu-ai-act-compliance.md` + `privacy-comparison.md` both exist). MEMORY.md NEXT SESSION TASKS were stale.
- **CC install fix** (global `~/.claude/settings.json`, not repo): Fable 5 was pinned as a specific default model; Anthropic disabled it → forced manual model reselect every session. Set `"model": "opus[1m]"` (tier alias, auto-resolves, never dangles) + `"fallbackModel": ["sonnet","haiku"]` (auto-switch on unavailability). Survives future model add/remove.
- **Stage 2a DONE (avatar in a real 3D location) — P1–P6 core, 9 commits (`61f0eea`→`7f97989`).** User chose "download a GLB scene" + "lofi cozy" aesthetic. Pipeline: schema v89 `characters.environment_url` → viewer `loadEnvironment` (room GLB behind avatar + ShadowMaterial grounding floor + X/Z centring + leak-safe dispose, camera stays on avatar) → `viewerStore.dispatchLoadEnvironment` → `GET/PUT /api/characters/{id}/environment` + `GET /api/environments` + api.ts mirror → ModelPanel renders the room on character load. Shipped asset: **"Living Room" by Alex Safayan, CC-BY 3.0** (`backend/storage/environments/lofi_room.glb`), attribution in `environments/CREDITS.md`. Render-gate verified (avatar grounded on the rug, room around her, dispose restores void): `docs/testing/screenshots/2026-06-14-stage2a-lofiroom/`. New tool `tools/verify/render_environment.mjs`. **First asset pick was an exterior diorama (sealed box) — lesson logged: preview `static.poly.pizza/<uuid>.jpg` thumbnails before downloading.**
- **Stage 2a P6 picker DONE + browser-verified** (`eeffa9c`): 🏠 environment dropdown in the Model-panel toolbar (user chose Model panel over Settings). Live verification (backend restarted, Vite dev server, headless Chrome): dropdown renders + lists `["No room","lofi room","test room"]`, selecting "lofi room" loaded it and Raine renders standing in the room. Backend endpoints curl-verified live. Screenshots `/tmp/picker_03_room.png` (avatar in room). NOTE: Rin (char 1) was set to lofi_room during testing — clear via the picker's "No room" if undesired.
- **Other avatar-motion stages still gated:** Stage 2b character navigation (separate multi-month plan), Stage 3 AI motion (needs RTX box, not M2 Pro), Stage 4 Blender pipeline (as-needed).

**Live status:** push gate clear (no active OPEN BUG/UNFIXED/BLOCKER markers). 3121 pytest + 487 vitest, tsc clean. Backend running on OLD code (v5.34.0) — restart to pick up v89 + environment endpoints. 11 local commits unpushed (`4838386`→`7f97989`).

---

**Session (2026-06-03) — CI pipeline fix + useTwoPhaseChips extraction, branch `master` (CI GREEN). See `docs/SESSION_HANDOFF.md`.**

Master CI was red across runs #54→#75. A pasted plan blamed "unpinned deps/caching" but `test.yml` already pinned 3.12 / used `npm ci` / cached. Real causes (from actual run logs + a throwaway CI-matching venv):
- **Python:** `advanced_sentiment.py` imported `transformers`/`torch` at module top → conftest import died. Made lazy (`934ce22`). Then `numpy`+`PIL` missing from CI's hand-curated pip list (`a7d9407`). Then `sentence_transformers` heavy-dep patch target → lightweight stub guard in `test_embedding_provider.py` (`a7d9407`).
- **Lint:** dead `neon` job (no lockfile, lints nothing) removed (`934ce22`).
- **Vitest:** `FeedbackButtons` toggle flake — 2nd click hit the `pending` re-entry guard under CI timing; test waits for re-enable now (`8b50c56`).
- **tsc:** completed the in-flight `isMountedRef` wiring (`e6de28d`).
- Fast-forwarded `master` 42 commits → caught up to `feat/avatar-motion` (user approved). Verified by 3 green CI runs.
- **Separately:** extracted `useTwoPhaseChips` hook in `ChatThread.tsx` on branch `claude/continue-prepared-plan-6CHFX` (`70811de`) — NOT on master (different chip lineage).

CI dependency philosophy reaffirmed: heavy ML libs (torch/transformers/sentence-transformers/chromadb) stay OUT of CI — tests mock/stub them.

**Live status:** push gate clear (no active OPEN BUG/UNFIXED/BLOCKER markers). 3104 pytest + 479 vitest, tsc clean, CI green. Heads-up: GitHub Node-20 action deprecation auto-migrates 2026-06-16 (warning only).

---

**Session (2026-05-31) — Avatar Realistic Motion, branch `feat/avatar-motion` (10 commits, LOCAL/unpushed). See `docs/SESSION_HANDOFF.md` + plan `docs/plans/2026-05-31-avatar-motion-staged.md` ("Follow-up Execution Plan").**

Turned "can avatar movement look real / is Three.js the only option / Claude-drives-Blender-and-my-browser" into a working pipeline:
- **Clip→VRM retarget proven** — fixed a silent no-op bug (three.js strips the colon from track bone names; `MIXAMO_BONE_MAP` kept it). Rotation-only retarget; Xbot walk renders grounded + cycling. `322f630` `45cb483` `17f71e0`.
- **Headless Blender FBX→GLB bake** (`tools/blender/`, `tools/bake_animation.py`) — unlocks the Mixamo FBX library. `ec42dd6`.
- **Browser-drove Chrome over CDP** → downloaded 28/28 Mixamo clips to `~/Downloads/mixamo-fbx/` (`tools/mixamo_grab.mjs`). `68560d0`.
- **Headless render harness** with motion-burst (`tools/verify/render_clip.mjs --frames N`).
- **VRM-rig retarget WIP** (`tools/blender/retarget_to_vrm.py`) — validated upright walk; blocked by ONE depsgraph bug (per-frame Mixamo pose reads static → all clips bake identical). `a642a99`. Fix + batch + Kokoro wiring = next session (Phase A/B/C in the plan).

Decisions: stay Three.js (renderer ≠ bottleneck); VRM+GLB formats; Mixamo→VRM MUST retarget onto the VRM rig in Blender. Nothing pushed — push is the user's call.

**Live status:** push gate clear (no active OPEN BUG/UNFIXED/BLOCKER markers). 3104 pytest, tsc clean.

---

**Session 48 (2026-05-25) — Kokoro v2 Phase 1: parse_ok rate tracking infrastructure, identity fix, settings drawer clipping fix, AIE TTL cache. 7 parallel agent dispatches, ~50 new tests. All pushed.**

| Theme | Commits |
|---|---|
| Identity fix: `## Kokoro Mind State` → `## Current Emotional State` (prompt_fragment.py) | `5e5d321` |
| `_fix_identity_slip()` post-process guard + `_log_parse_result()` in service.py | `d892475` `d0c47ee` |
| 10 tests for `_fix_identity_slip` / `finalize_turn` | `83a096b` |
| AIE TTL cache (5-min in-process cache for profile/behavior DB reads) | `2d59579` |
| `adaptive/milestones.py` deprecation notice → `bond.milestones` | `c73b017` |
| AIE research doc updated (3 recommendations marked DONE) | `cac43a1` |
| Settings drawer clipping: `visibility: hidden` on all viewer iframes when overlay active | `a3334e1` |
| Schema v86: `kokoro_parse_log` table + index | `33d0918` |
| `_log_parse_result` + 10 integration tests | `c703e52` |
| `KokoroDebugPanel`: `ParseOkBadge` (green/yellow/red) + `KokoroQaResponse` type | `ba1ef49` |
| QA endpoint extended + `api.ts kokoroQa()` + `App.tsx` wired | `e43035c` |
| 13 backend tests for `/api/kokoro/qa` endpoint | `a979c16` |
| 8 frontend tests for `KokoroDebugPanel` parse_ok badge | `8e2e043` |
| 20 frontend tests for `useVoiceMode` hook state machine | `7c72752` |
| Fix chatStore.pin tests: add `grantAchievement` mock (silent TypeError was reverting optimistic update) | `2fe8abe` |

**Live status at session end:** Kokoro v2 Phase 1 infrastructure complete. parse_ok rate visible in dev HUD (green ≥80%, yellow 50-79%, red <50%). Rin identity confusion fully mitigated (header rename + post-process regex). Settings drawer no longer clips behind viewer iframe. AIE expensive DB reads cached for 5 min.

**Remaining open queue:**
1. **Kokoro v2 Phase 2 (Emotional RAG)** — schema v87, mind_state_snapshot on memories, dial-vector cosine retrieval re-ranking. Not started.
2. **Live parse_ok validation** — run Chrome against LM Studio, confirm rate ≥ 80% on user's local model. Chrome extension was not connected this session.
3. **Memory Browser QA** — Chrome hands-on, Ctrl+M overlay, all 4 tabs vs real backend.
4. **#14 server.py refactor** — 17K-line split into domain modules. Multi-session.
5. **#13 NSFW endpoint cleanup** — blocked by CLAUDE.md rule (need explicit override).

**Push state:** clean. All commits on origin/master.

---

**Session 46 (2026-05-25) — v1-Lite declutter pass. 13 commits. User feedback marathon. See `docs/SESSION_HANDOFF.md` for the full context.**

User opened with a `/goal` to ship the app, did a multi-persona test session, then went hard: *"junk. unusable. never enjoyed it past 5 chat turns."* The rest of the session was a strategic declutter — cutting feature accretion that buried the chat surface.

| Theme | Commits |
|---|---|
| qwen3 / reasoning-model compatibility (non-stream fallback, SSE fallback, /no_think, Kokoro auto-bypass, timeout 35→60s, /api/llm/probe endpoint) | `f915264` `c7c0ab5` `f0a81d6` `c2b00d2` `6fc9de5` |
| Multi-persona test report | `db9f191` |
| Bracket annotation strip (`[emotional expression:…]`, `[gesture:…]`, un-bracketed `EMOTION:` footer); proactive popup → chat message | `05a4377` |
| v1-Lite UI cuts: bond pill, achievement toast, frontend switcher, quick-chips off, NSFW 8 overlays, Kokoro 22→3 contract, emoji thumbs, Pin/Bookmark, baseline asterisks instruction, GreetingCard popup, BondLevelUp + MilestoneCelebration popups, 5-emoji reaction bar, Brain "Remember" button, Rin-chan identity guardrail | `2b57283` `c874436` `9439d68` `d2a4a4d` `bea83ed` `7f662b4` |

**Live status at session end:** chat surface is dramatically simpler. No gamification chrome in header. No popups. Italic actions render consistently. The qwen3 empty-bubble P0 is fully fixed across both streaming + non-streaming paths. Kokoro contract is ~70 tokens/turn (down from ~150).

**Runtime drift in working tree:** `backend/config/app.json` swapped to `localhost:1234`/`llama-3.2-1b-instruct` for persona testing (chat actually works at this model size). User's intended config is `10.0.0.17:1234`/`qwen3.5-9b` — they routinely revert. Action for next session: confirm.

**Push gate:** clear (no active OPEN BUG / UNFIXED / BLOCKER markers). 13 commits await user-authorized push.

**Open queue (full list in `docs/SESSION_HANDOFF.md`):** AIE 12-module feature flag · Bond XP grant disable · footer chrome strip · settings collapse · settings clipping fix · settings + memory mutex · theme picker 27→4 · LLM probe wire-up · Rin-chan post-process regex (if needed) · bond burn-down · AIE rethink · Girly/Neon archive · NSFW endpoint cleanup · server.py refactor.

---

**Session 45 (2026-05-24) — Kokoro Engine v1 (tiered mind state + structured embodiment).**

| Item | Commits |
|---|---|
| Phase 1: backend module + frontend types + debug HUD (schema v82→v84) | `9e83855` |
| Phase 2: chat-stream injection + finalize/state endpoints + viewer wiring | `cb1b1e7` |
| Phase 3: ChatThread SSE → finalize → avatar embodiment + HUD live polling | `d01d860` |
| Phase 4-9: drift, traits seeder, memory writes, voice params, safety counter (schema v85) | `60fb3ab` |
| Phase 10-11: Vitest coverage (23 new) + Settings toggle (pending commit) | — |

**Kokoro architecture summary:**
- Tier A (per-turn) + Tier B (slow drift) + Tier C (identity, bible-seeded) + Tier E (per-thread scene) + Tier F (NSFW, auto-gated by content_filter_level + M6 bond ≥ 20)
- LLM contract: structured JSON with reply + face + gesture + gaze + voiceStyle + memoryWrite + stateDelta + (NSFW: innerArousalShift, suggestiveBid, selfConsentCheck, boundaryReinforcement)
- Graceful plain-text fallback if model ignores the contract — chat never breaks
- Memory writes hook into existing tiered_memory (role="knowledge"), 24h dedup window
- Boundary reinforcement events logged for regression detection (`/api/kokoro/qa/{char_id}`)
- Lazy drift on next turn (no background cron); 6h cap per turn
- Debug HUD at `?debug=kokoro` or dev_mode

**Flag state:** `kokoro_enabled` flipped to **true** at end of session for immediate validation.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers.

**Next priorities:**
1. Run the 5-test Chrome script (Dracula recall, frustration tone-shift, hacker-girl style shift) against live LM Studio. Tune the prompt fragment if parse_ok rate is low on the user's model.
2. Memory architecture v2 research lands at `docs/research/2026-05-24-memory-architectures.md` (agent dispatched this session). Decide what to adopt.
3. Optional v2 ideas surfaced this session: per-character Tier C trait sliders, mood-snapshot-tagged memories, voiceStyle test coverage.

---

**Session 44 (2026-05-24) — cleanup pass + Ctrl+M regression coverage.**

| Item | Commits |
|---|---|
| Cleanup: revert abandoned Memory Browser scaffolding (trashed `useMemoryBrowserOverlay.tsx` ×2 variants, `useMemoryBrowser.tsx`, `MemoryBrowserOverlay.tsx`, `App.tsx.new`, `App.memory-browser-integration.patch`, stray `e2e/memory-browser/hotkey.spec.ts`, `smoke-test.spec.ts.bak`), revert destructive App.tsx duplicate imports, revert gutted `smoke-test.spec.ts` (743→16 lines), revert background-process stub of `MemoryBrowser.tsx` (1284→25 lines), gitignore stray runtime files, drop 2 unused portrait PNGs | `ca274a2` |
| Regression test: `useKeyboardShortcuts.memoryBrowser.test.tsx` — 4 cases locking in Ctrl+M / Cmd+M wiring so future sessions stop re-implementing it | `1fe562a` |
| Pushed 18 commits (sessions 41-44) to origin/master | `1fe562a` |

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers.

**⚠ Session-44 finding — background-process interference:** while this session was working, an unrelated background `claude --dangerously-skip-permissions` process (PID 45201, started 05:07 AM) was independently editing the same files. It twice re-injected broken `useMemoryBrowserOverlay` imports into `App.tsx` and once replaced the full 1284-line `MemoryBrowser.tsx` with a 25-line stub. All damage was reverted via `git checkout`. **Recommendation:** kill stray background sessions targeting this repo before next /go.

**Next priorities (unchanged):**
1. Memory Browser QA — Chrome hands-on, Ctrl+M overlay, all 4 tabs vs real backend. Needs server running. *(Ctrl+M wiring now has regression coverage — feel free to QA without fear of re-breaking it.)*
2. M5 AIE Phase C — gated by tier decision (see `docs/plans/2026-05-06-opus-planning-roadmap.md`).
3. Address pre-existing `chatStore.pin.test.ts` flake (`togglePin > optimistically flips pinned=true` returns 500 from mocked API).

---

**Session 43 (2026-05-22) — M6 item 22 bond gate enforcement complete.**

| Item | Commits |
|---|---|
| M6-item22: GET /api/characters/{id}/nsfw-eligibility + PUT /api/content-gate bond enforcement + SafetyTab fresh bond fetch | `d5c1e48` |

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers.

**Next priorities:**
1. Memory Browser QA — Chrome hands-on, Ctrl+M overlay, all 4 tabs vs real backend. Needs server running.
2. M5 AIE Phase C — gated by tier decision (see `docs/plans/2026-05-06-opus-planning-roadmap.md`).
3. M8 Distribution — `docs/marketing/eu-ai-act-compliance.md` + `privacy-comparison.md` both written (2026-05-06). Done.

---

**Session 41–42 (2026-05-09/10) — ALL COMPLETE.**

M6 achievements (session 41): streak_3/7/30 ✅, first_voice ✅, shared_secret ✅, BondPanel gallery ✅
M7 Humanoid Motion Phases A-E (session 42): all shipped. Phase F deferred (GPU server required, 60-100h).

All 4 polish plans complete (session 40/41):
- Animation P1-P4, HUD PA-PD, Chat PA-PD, Voice P1-P4

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers.

---

**Session 38/39 (2026-05-08) — Bug fixes + UX polish. All 8 plan items complete.**

| Item | Status | Commit |
|---|---|---|
| BUG-3: Italic text invisible (var(--color-action) → var(--color-text-secondary)) | ✅ | `6fed8c2` |
| BUG-4: 3D idle animation smoothing (weight_shift, shoulder_roll, look_around) | ✅ | `3bfe893` |
| PART-2: Remove 9 bloat overlays (universes, relweb, moodboard, portfolio, arena, memorialscene, bondstory, schedule, games) | ✅ | `1a9cfa2` |
| Phase A: Message reactions + scroll-to-bottom on session resume | ✅ | `fb7e162` |
| Phase B: Character bibles, TTS providers, VRM assignments, Brittney prompt | ✅ | `391cc9f` |
| Phase D: About overlay, dev-mode gating, Electron icons + tray | ✅ | `894c609` |
| BUG-1: Chat history loads on character select (schema v80 backfill) | ✅ | `9b07e86` |
| BUG-2: LLM timeout configurable via Settings > Brain slider | ✅ | `2504b5b` |

**Push gate:** 8 commits unpushed. No known blockers — safe to push when ready.

**Next priorities:**
1. Apply character styles (`scripts/apply_character_styles.py` — run draft script first, review JSON, then apply)
2. Visual Content Phase 2 (lightbox / imagePrompt / regenerateImage)
3. AIE Phase C: Advanced (LoRA training + DSPy — tier pick needed)

---

**Session 33 (2026-05-06) — M2 + M3 COMPLETE. 16/16 items shipped.**

M3 Voice Cloning Onramp (items 13-16):

| # | Item | Status | Commit |
|---|---|---|---|
| 13 | Voxtral TTS adapter (Mistral cloud TTS) | ✅ | `000282d` |
| 14 | Voice Cloning section in Settings VoiceTab (wand + sample pointer) | ✅ | `000282d` |
| 15 | Voice wand endpoint (LLM → Parler-style voice description) | ✅ | `000282d` |
| 16 | voice_message_url (schema v74) + inline audio player + generate-voice button | ✅ | `000282d` |

M2 Memory Transparency (items 9-12):

| # | Item | Status | Commit |
|---|---|---|---|
| 9  | Memory capacity meter (tier breakdown in Overview tab) | ✅ | `b6970d7` |
| 10 | "Remember this" pin button → saves message as T3 memory | ✅ | `175e99d` |
| 11 | Memory Browser graph view (SVG radial mind map) | ✅ | `d256e41` |
| 12 | Memory tier filter pills + promoted_at display | ✅ | `b6970d7` |

M6 Gamification (items 20-22):

| # | Item | Status | Commit |
|---|---|---|---|
| 20 | Daily streaks UI (🔥 counter) | ✅ pre-existing | `BondPill.tsx` |
| 21 | Achievement/badge system (schema v75 + 11 defs + AchievementToast) | ✅ | `31492ef` |
| 22 | Affinity-gated NSFW override toggle | ✅ | `5384c77` |

M4 Visual Content MVP Closeout (items 17-19):

| # | Item | Status | Commit |
|---|---|---|---|
| 17 | PATCH /messages/{id}/image-url + chatStore persist | ✅ | `dc8d45e` |
| 18 | Stuck-gen indicator (image_regen_started_at) | ⏸ deferred — needs re-spec |  |
| 19 | Settings retention slider | ✅ pre-existing | `SettingsView.tsx:4411` |

**Next: M5 AIE Phase C (gated by tier decision) or M8 Distribution & Marketing.**

---

**Session 34 (2026-05-06) — Backlog quick items + preflight bug fix.**

| Item | Status | Commit |
|---|---|---|
| Item-35: Continue generation ("Continue response" hover button) | ✅ | `a4d34b5` |
| Item-37: Chat history Markdown export | ✅ pre-existing | `handleExportMarkdown` already wired |
| Item-46: Memory Browser tab overflow + backdrop close | ✅ pre-existing | `4d95d7c` |
| Item-47: Avatar URLs pointing to VRM files | ✅ pre-existing | DB already fixed |
| Item-50: v72 character_relationships dedupe verification | ✅ | migration applied — 24,576→11 rows |
| fix: preflight v70+v71 migrations used UPDATE instead of INSERT | ✅ | `41d79b6` |

**Next: Item-30 (apply_character_styles.py), Item-42 (voice preset gallery), or M5 AIE Phase C.**

---

**Session 32 (2026-05-06) — M1 Wave-2 Bug Cleanup: ALL 8 ITEMS SHIPPED.**

| # | Item | Status | Commit |
|---|---|---|---|
| 1 | Header overflow at narrow widths | ✅ | `5b7df25` |
| 2 | Retry/Regenerate AI response | ✅ | (session 31 wave) |
| 3 | Message editing — schema v73 + UI | ✅ | (session 31 wave) |
| 4 | Previous-generations browser hardening | ✅ | (session 31 wave) |
| 5 | image_url + image_prompt persisted — schema v73 | ✅ | `7f2f563` |
| 6 | 3D viewer 0 FPS / black canvas on first open | ✅ | (session 31 wave) |
| 7 | 3D viewer narrow-panel grounding (ResizeObserver fix) | ✅ browser-verify needed | `c9f6bbf` |
| 8 | Animation packs — procedural clips now functional | ✅ | `c9f6bbf` |

**Item 7 note:** ResizeObserver approach ships; requires visual browser verification in narrow-panel mode before calling fully closed (sensitive area).

---

**Session 31 (2026-05-06) — Q1-Q7 answered. Roadmap locked. `/go` M1 unblocked.**

All 7 open questions from the master roadmap resolved (see `docs/plans/2026-05-06-opus-planning-roadmap.md` Decisions section).

**Execution order locked: M1 → M2 → M3 → M4 → M6 → M8 → M5 → M7.**

---

**Session 30 (2026-05-06) — Pure planning sprint. 1 commit (`cb5f8aa`), zero production code touched. Master roadmap doc + 4 PRDs + 6 bug docs + competitor refresh delta.**

- `cb5f8aa` docs(session-30): planning sprint — 6 bug docs + 4 PRDs + competitor refresh + master roadmap. 12 files, +3140 / -0.
- **6 bug docs filed in `docs/bugs/2026-05-06-*.md`:** header occlusion (P1), retry/regen+edit+prev-gens scaffolded-not-wired (P1, renamed), animation packs dead URLs (P2), image_url not persisted (P2), viewer 0 FPS first-open (P3), viewer narrow-panel grounding (P3, sensitive area).
- **Competitor refresh** `docs/research/2026-05-06-competitor-refresh-delta.md` — ~395 lines, 40 sources.
- **4 PRDs:** `prd-header-overflow.md`, `prd-retry-regenerate.md`, `prd-message-editing.md`, `prd-previous-generations-browser.md`.
- **Master roadmap** `docs/plans/2026-05-06-opus-planning-roadmap.md` — 8 milestones, 54 items. M1-M6+M8 ≈ 74h calibrated AI-assisted.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere. 2 local commits await user-authorized push.

---

**Session 29 wave 2 (2026-05-06) — Browser QA sweep + AnimationBrowser crash fix.**
- `10519fa` fix(animation-browser): optional-chain `clip.emotions?.join(', ') ?? ''` — crash on clips with no emotion tags caused full black screen (React tree kill). `AnimationBrowser.tsx:215`.
- QA report: `docs/testing/qa-sweep-2026-05-06-wave1.md` — 14 features tested, all PASS except animation packs (dead URLs).
- **4 open bugs filed this wave:**
  - **P1** `docs/bugs/` — Header UI occlusion: elements overlap at narrow widths when 3D viewer open (context pill, settings gear, bond XP text compete for same space)
  - **P1** — Retry/Resend feature missing: no way to regenerate AI response or browse previous generations at a conversation point; message editing also absent
  - **P2** — Animation packs: `tools/download_animation_packs.py` URLs all dead (SillyTavern repo 404, CDN 404); 0/36 clips on disk
  - **P2** — `image_url`/`image_prompt` not persisted to messages table; regenerated images vanish on reload
  - **P3** — 3D viewer shows 0 FPS / black canvas on first open until user clicks a camera preset
- **Next session: New Opus planning session** — 32-64+ item roadmap with milestones, PRDs, research on NSFW roleplay app competitors, and feature specs for header fix + retry/regenerate + message editing + previous-generations browser.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers in tracked files. Local `10519fa` commit unpushed.

---

**Session 29 (2026-05-06) — Visual Content MVP complete + bugs cleared. 7 commits, all pushed.**
- `5349b42` feat(viz-mvp-p2): chat image lightbox + regenerateImage. `ChatImageLightbox.tsx` (URL-shaped, distinct from gallery's item-shaped `ImageLightbox`). `DialogueBubble` `<img>` click → fullscreen with Save/Copy URL/Regenerate. `chatStore.regenerateImage(messageId)` reads stored `imagePrompt`, hits `/api/image-gen/portrait`, patches `imageUrl` in place. `tool_result` SSE handler captures `data.data.prompt` → `imagePrompt`. `onRegenerateImage` prop wired through ChatThread. 7 Vitest cases (`ChatImageLightbox.test.tsx`). Frontend 215 → 222.
- `05bf460` feat(viz-mvp-p3): image retention cleanup + apply-styles script + Settings slider. `_run_image_retention_cleanup(cfg)` in `backend/server.py` + called from `_run_scheduler_tick` (24h gate, skips `*_expr_*.png`, `retention_days=0` = unlimited). Settings → Image Generation: SliderField for retention (0–365d, persists `image_gen.retention_days`). `scripts/apply_character_styles.py` — reads approved draft JSON, bulk-writes `characters.image_style`, supports `--dry-run`.
- `4d95d7c` fix(memory-browser): tab strip overflow + backdrop close-on-click guard. Fixes both P2 bugs from session-28 QA (`docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md`).
- `c7342b5` fix(bond-pill): clarify XP display format. "138/12 XP" → "138/150 · 12 to next". Resolves P3 bug (`docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`).
- `9aea9d2` test(bond-pill): regression tests for XP display format. Locks in the fix.
- `87b380f` fix(seed-data): repoint Shiori + Luna avatar_url to portrait images.
- `7367280` fix(seed-data): apply 6 user-confirmed avatar picks (session 29 wave 2).

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere. All session-29 work externally visible.

**Deferred (needs re-spec):** stuck-gen indicator on `DialogueBubble` — planned signal (`imagePrompt` set + `imageUrl` absent) doesn't match either gen path; needs `regenStartedAt` field redesign before implementation. Low-value relative to other work.

---

**Session 27 (2026-05-06) — Memory Browser API unification closed + Viz MVP Phase 3 partial + README hygiene + session-24 WIP shipped. 7 commits local, all unpushed.**
- `1ae41b1` feat(sakura): quick-replies piggyback architecture + thinking-indicator stages mode. Two interlinked features shipped together because they share `DialogueBubble.tsx`, `types.ts`, `chatStore.ts`, `ChatThread.tsx` (splitting would need hunk-level surgery). **A. Quick-replies piggyback:** replaces deprecated 2-phase chip generation (regex heuristic + post-hoc `/api/llm/generate` call). Backend instructs the model to emit `<quick_replies>...</quick_replies>` after every reply; `_parse_quick_replies` extracts the 3 user-perspective suggestions, strips the block before persistence, ships the cleaned list via a new `quick_replies` SSE event. Frontend renders chips on the assistant bubble. 9 new pytest cases (`backend/tests/test_quick_replies_parser.py`) — canonical, no-block, bullets, quoted lines, overlong filter, 3-cap, case-insensitive, empty fallback, blank-line tolerance. Old `quickChips.llm.test.ts` deleted (covered the deprecated 2-phase path). `ChatThread.tsx` -212 lines (deleted `generateChips`/`generateChipsLLM`/`TypingIndicator`). **B. Thinking-indicator stages mode:** new Settings toggle (skeleton vs stages). Skeleton (default) is the existing shimmer + dots + elapsed counter. Stages renders three labelled rows (Reading context / Thinking / Generating) driven by an SSE-event-derived `stage` field on `ChatMessage`. Net: 10 files changed, +467/-407.
- `201f465` refactor(memory-browser): migrate `FactRow` inline edit to `api.updateUserFact`. Closes the last raw-fetch gap from MEMORY.md NEXT TASK item 2 — adds `api.updateUserFact(charId, factId, factText)` wrapper to `frontends/sakura/src/lib/api.ts` (mirrors `createUserFact`/`deleteUserFact` shape), replaces the raw `fetch()` call at `MemoryBrowser.tsx:542`, drops the now-redundant `if (res.ok)` guard since `patch<T>` throws on 4xx/5xx. Adds one Vitest case under `Facts (About You) tab` describe block exercising the edit-and-save flow via `getByTitle('Edit this fact')` + Enter-key save. MemoryBrowser test suite 36 → **37** passing, 0 raw `fetch(` calls remain in the component. Plan status lines appended to `docs/plans/2026-05-06-memory-browser-api-unification.md`.
- `e253a35` docs(readme): bump test badge 2678 → 2703 + schema badge v70 → v71 + extend "Image generation" agent-tool bullet to mention per-character `image_style` (positive/negative prompt prefixes, optional LoRA) auto-applied. Tracks session 26's Phase 1 ship.
- `47da798` feat(viz-mvp-p3): scripts/draft_character_styles.py + .gitignore for draft output. Read-only-against-characters-table script that calls the configured LLM adapter once per character with a module-level `STYLE_DRAFT_PROMPT`, parses the JSON reply tolerantly (regex-extract → json.loads, returns sentinel on bad rows so the batch keeps going), writes `backend/characters/builtin_image_styles.draft.json` (gitignored) for human review. Flags: `--char-id N` (single character), `--dry-run` (no LLM call), `--output PATH`. WAIFU_DB_PATH env override. Smoke-tested with --dry-run → 14 entries written without LLM contact. Backend suite still 2703/2703.
- `f9db148` docs(research): persist 2026-05-01 settings dedup audit (orphan untracked since May 1). 5 hard duplicates, 6 soft duplicates, 3 orphan store fields, 3 orphan UI controls, 19 live backend unknown-key warnings, 4 double-persisted config keys — read-only inventory for a future settings refactor pass.
- `7d3634e` chore(27): handoff CURRENT_STATUS.md sync.
- `27e7635` docs(plan): append status section to Visual Content MVP execution plan (Phase 1 ✓ session 26, Phase 3 partial ✓ session 27, Phase 2 ⏸ blocked by Ultraplan PR).
- `ae82afe` chore(27): update CURRENT_STATUS for WIP ship + push-blocked note.
- `dfa2181` docs(qa): session 27 browser QA report + 2 bug filings. Playwright sweep validated `api.updateUserFact` end-to-end (commit 201f465 PASSES — backend curl confirms persistence after FactRow edit), Memory Browser pagination + semantic search (151 memories, 13 pages, 7 relevance-ranked search results), Settings stages-mode toggle (UI flips state + persists across page reload via `localStorage.sakura-app.state.thinkingIndicatorMode`). LLM offline error handling renders cleanly (no crash). Two pre-existing bugs surfaced: **P1 character_relationships table has 24,508 dupe rows for 11 chars** (Rin alone: 23,291 dupes; schema lacks UNIQUE on char_id; suggested v72 migration drafted in `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md`), **P3 BondPill display format** ("138/12 XP" reads as "138 out of 12" but is actually "138 earned / 12 to next"; `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`).
- `99f4043` refactor(viz-mvp-p2): extract `downloadFile` helper from ChatThread blob-anchor pattern. **Phase 2 STARTED.** New `frontends/sakura/src/lib/downloadFile.ts` exposes `downloadBlob(blob, filename)` and `downloadUrl(url, filename)`. Three ChatThread sites refactored (txt + md + JSON exports). The `downloadUrl` helper is in place ahead of the `ImageLightbox.tsx` extraction so the upcoming Save button can call it directly.
- `201f465` refactor(memory-browser): migrate `FactRow` inline edit to `api.updateUserFact`. Closes the last raw-fetch gap from MEMORY.md NEXT TASK item 2 — adds `api.updateUserFact(charId, factId, factText)` wrapper to `frontends/sakura/src/lib/api.ts` (mirrors `createUserFact`/`deleteUserFact` shape), replaces the raw `fetch()` call at `MemoryBrowser.tsx:542`, drops the now-redundant `if (res.ok)` guard since `patch<T>` throws on 4xx/5xx. Adds one Vitest case under `Facts (About You) tab` describe block exercising the edit-and-save flow via `getByTitle('Edit this fact')` + Enter-key save. MemoryBrowser test suite 36 → **37** passing, 0 raw `fetch(` calls remain in the component. Plan status lines appended to `docs/plans/2026-05-06-memory-browser-api-unification.md`.
- `e253a35` docs(readme): bump test badge 2678 → 2703 + schema badge v70 → v71 + extend "Image generation" agent-tool bullet to mention per-character `image_style` (positive/negative prompt prefixes, optional LoRA) auto-applied. Tracks session 26's Phase 1 ship.
- `47da798` feat(viz-mvp-p3): scripts/draft_character_styles.py + .gitignore for draft output. Read-only-against-characters-table script that calls the configured LLM adapter once per character with a module-level `STYLE_DRAFT_PROMPT`, parses the JSON reply tolerantly (regex-extract → json.loads, returns sentinel on bad rows so the batch keeps going), writes `backend/characters/builtin_image_styles.draft.json` (gitignored) for human review. Flags: `--char-id N` (single character), `--dry-run` (no LLM call), `--output PATH`. WAIFU_DB_PATH env override. Smoke-tested with --dry-run → 14 entries written without LLM contact. Backend suite still 2703/2703.
- `f9db148` docs(research): persist 2026-05-01 settings dedup audit (orphan untracked since May 1). 5 hard duplicates, 6 soft duplicates, 3 orphan store fields, 3 orphan UI controls, 19 live backend unknown-key warnings, 4 double-persisted config keys — read-only inventory for a future settings refactor pass.

**Outstanding Visual Content MVP work — now unblocked since session-24 WIP shipped (`1ae41b1`):**
- Phase 2: extract `ImageLightbox` shared component from `GalleryOverlay.tsx` lines 320-474 (~150 LOC, includes Heart/Download/Trash/Close action buttons). Wire chat `<img>` click → fullscreen at `DialogueBubble.tsx:696-709`. Extract blob-anchor download pattern from `ChatThread.tsx` to `lib/downloadFile.ts`. Add `regenerateImage` action to `chatStore` reusing `patchAssistant` for in-place mutation. Patch `imagePrompt` from `data.data.prompt` in the `tool_result` SSE handler.
- Phase 3 finishers: stuck-gen indicator on `DialogueBubble` (30s "still cooking", 60s "try again" button — depends on Phase 2's `imagePrompt` field). Retention slider on `SettingsView` Image Gen tab. Once-per-day retention cleanup in `_run_scheduler_tick` at `backend/server.py:13012` (90d default, 24h gate via module-level `_last_retention_run` timestamp; skip `*_expr_*.png` expression portraits).

**Untracked cruft (no destructive ops without user confirm):** Empty 0-byte `app.db` at repo root, today's 60KB `backend/storage/waifu.db.bak.20260506132609`, plus working-tree mods on `backend/config/app.json` + `backend/storage/app.db` (runtime dev state — LLM endpoint, TTS provider, content_filter — user routinely reverts these).

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere. Local commits only.

---

**Session 26 (2026-05-06) — Visual Content MVP Phase 1 shipped. 1 commit local (`d34f86f`), backend-only.**
- `d34f86f` feat(viz-mvp-p1): per-character `image_style` + style resolver (schema v71). 6 files, +414/-16. Schema v70 → v71 (`characters.image_style` JSON column, idempotent migration). New `resolve_character_style(char_id, db_path)` helper in `backend/image_gen/registry.py` — fail-soft read-only sqlite, returns `("", "")` on every error path. Wired into `generate_portrait` + `generate_background` (server.py) and the agent `generate_image` tool (`backend/agent/tools/image_gen.py`). `ToolResult.data["prompt"]` now carries the resolved full prompt for Phase 2's `imagePrompt` field. 10 new tests in `backend/tests/test_image_gen_style.py` (8 helper branches + 2 endpoint integration). Backend suite: 2693 → **2703** passing, zero regressions.
- **Surgical commit maneuver:** session-24's RichComposer follow-up working-tree mods on `backend/server.py` were intermingled with Phase 1 edits. Used `git show HEAD: + git hash-object -w + git update-index --cacheinfo` to stage only the Phase 1 hunks without touching the working tree. Session-24 WIP preserved verbatim — confirmed via post-commit `git diff HEAD backend/server.py` showing only session-24 hunks (lines 1231 + 5524–6126).
- Phase 2 (lightbox / downloadFile / regenerateImage / `imagePrompt` on ChatMessage) remains gated on the in-flight Ultraplan PR which touches `DialogueBubble.tsx` + `ChatThread.tsx`. Phase 3 (AI-drafted character styles + retention cleanup) is unblocked by this commit's helper but deferred per plan.
- `CURRENT_STATUS.md` + `MEMORY.md` schema badges bumped v70 → v71, test count → 2703.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere. Local commit only — schema migration committed → CLAUDE.md "Suggestion Triggers" recommends `/qa-sweep` at handoff.

---

**Session 25 (2026-05-06) — Planning-heavy sprint. 1 commit local (`16006a0`), 4 plan docs, 2 remote Ultraplan sessions kicked off.**
- `16006a0` docs(plan): 4 new plan docs in `docs/plans/`, 1648 insertions. (a) Visual Content scoping (4 decisions locked: MVP-only, AI-drafted styles, NSFW=SFW, 90-day retention); (b) Visual Content MVP execution plan (52KB, ready for `/go`, schema v71); (c) AIE Phase C scoping (3 decisions locked: single base model, Mac-served-everywhere, hybrid-feedback signal subsystem with 4 user-controlled privacy modes); (d) Memory Browser API unification (stale-backlog correction — sessions 16-17 already shipped 95%, only `updateUserFact` PATCH wrapper at `MemoryBrowser.tsx:542` remains).
- **Beta-test MVP plan** authored locally + teleported to Ultraplan (https://claude.ai/code/session_018ZzrXgcHRkgKqsAtpxKbKJ) — executing remotely, will land as a PR. Scope: backend `clock.py` chokepoint + `/api/test/time-travel` endpoint, Phase 0 testid batch on critical UI surfaces, Phase 1 `/beta-test` skill with 5 personas (Alex/Sam/Morgan/Jordan/Reese).
- **Plan-check session** at https://claude.ai/code/session_01RABmNEjrciKcoRcmrrvmf9 — read-only diagnostic on the beta-test PR.
- New feedback memory: `feedback_ultraplan_workflow.md` documents the teleport workflow.
- `MEMORY.md` NEXT SESSION TASKS items 2/3/4 updated with plan-doc cross-links + scope corrections.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere. (Per CLAUDE.md, do not push session-24's pre-existing working-tree mods on behalf of session 25.)

---

**Session 24 (2026-05-01) — RichComposer wire-up + push. 2 commits, all pushed.**
- `e94384c` feat(sakura): wire RichComposer into ChatThread — closes session-23 WIP item. textareaRef retyped to `RichComposerHandle`, auto-resize `useEffect` dropped (RichComposer caps via inline `max-height: 120px` + `overflow-y: auto`), `wrapSelectionWithAction` collapsed to one-line delegate to `wrapSelection()` imperative handle, `<textarea>` JSX swapped for `<RichComposer>` with `rich-composer` className. ChatThread.tsx -32 net. Browser-verified via Playwright on Rin character: live italic during typing (gold `rgb(249,226,175)` on dark sakura, amber `rgb(196,137,45)` on light sakura — `--color-action` token resolves correctly), wrap toolbar button works on selection, send-clear returns to 41.6px placeholder state, multi-line growth caps at 120px and engages scroll. 2 screenshots at `docs/testing/screenshots/2026-05-01-richcomposer-wireup/`.
- `88d78bd` docs(plan): append wire-up status line to `docs/plans/2026-04-29-user-reply-assist.md`.

**Pushed in this session (carried from session 23):** `badee27` HUD Tier 5 · `a29bf69` composer height fix · `8213ad6` reply-assist plan · `fbe6eaf` Tier 1 italic syntax · `65b9533` `--color-action` token + RichComposer scaffold. All 6 (sessions 22-24) reached `origin/master` via single push (`4654ba8..e94384c`).

**Empty-LLM-reply bug:** user reverted `backend/config/app.json` endpoint back to `10.0.0.17:1234` after the localhost swap was tested (intentional — runtime state not committed). Bug doc remains at `docs/bugs/2026-04-29-empty-llm-reply.md` with 5 fix options. Verified path: localhost:1234 with `max_tokens: 300` returned `content: "OK"` finish=stop — endpoint healthy when unreachable host issue resolved.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere.

**Session 22 (2026-04-29) — HUD Tier 5 + composer height fix + reply-assist plan. 3 commits LOCAL (not pushed per user).**
- `8213ad6` docs(plan): user reply assist (pills + full draft + action syntax) — `docs/plans/2026-04-29-user-reply-assist.md`. 3 sub-features, ranked above Visual Content in Chat by user. NOT started — 4 open questions (persona storage, pill count, auto-fill vs auto-send, Tier 3 model) need user answers.
- `a29bf69` fix(sakura): composer textarea stuck at tall height when empty. Auto-resize useEffect re-pinned inline height because Chrome reported scrollHeight = inline height when no overflow. Fix: clear inline height when draft empty. Composer dropped 125 → 67px in user's tab.
- `badee27` feat(sakura): HUD Tier 5 — sidebar consolidate (6→4 cells, More popover). Memory + Lore stay always-visible; Games · Stats · Context collapsed into MoreToolsDropdown (`⋯ More`, mirrors HelpDropdown pattern). Browser-verified at light + dark themes via Playwright. 8 screenshots committed at `docs/testing/screenshots/2026-04-29-hud-tier5/`. Plan log entry appended.

**Investigation surfaced** (no commit, conversation-only): chat empty-state visually right-shifted ~120px because `chat-area max-w-3xl mx-auto` centers in chat parent (which spans sidebar→edge) but sidebar (240w) has no right-side counterweight. Pre-existing layout choice. 4 fix options surfaced (anchor LEFT / drop max-width / phantom right pad / absolute positioning) — user did not pick one. Filed as next-session item #4.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere.

**Session 21 (2026-04-29) — Pre-session audit + cleanup + bond pill bump. 4 commits, all pushed.**
- `1534155` feat(sakura): bond pill size bump (~15%) — closes Tier 4 evaluate gate. Bumps `BondPill.tsx` collapsed-row sizes (font 12/11/10 → 13/12/11, icons 12/14 → 14/16, bar 60×5 → 80×6, padding/gap +1px). Verified via Playwright at 1280 + 800 + expanded panel. Pure cosmetic — no var/logic/theme contract change.
- `6bb69f4` build(sakura): rebuild dist — Session 20 verification `vite build` artifacts (28 files, SW cache token + BackendErrorBanner chunk).
- `39dbdae` chore(21): relocate Session 19 Tier 4 screenshots — 9 PNGs + 1 .md moved from repo root → `docs/testing/screenshots/2026-04-28-tier4/`.
- `18224cb` chore(21): sync stale paperwork — pruned `CURRENT_STATUS.md` Next Tasks, replaced stale Session 14 `RESUME_PROMPT.md` with pointer stub, marked FD-leak bug ✅ FIXED (closed in Session 19 commit `3bb8cce`), captured Session 20 handoff.

**Verified-not-bugs:** the Session 20 handoff's "right-cluster `..` → `⋯`" claim was misdiagnosed — `MoreHorizontal` Lucide icon already renders correctly at every width. The actual narrow-width issues at <1024px (header title CSS-truncates, bond bar overlaps right cluster, composer placeholder line-wraps) are layout bugs unrelated to the overflow icon. Folded into next-task #3.

**Push gate:** clear. No active OPEN BUG / UNFIXED / BLOCKER markers anywhere.

**Session 20 (2026-04-29) — Tier 4 layout regression FIXED. 2 commits, pushed in Session 21.**
- `f8e4ef0` fix(sakura): SW cache name now includes build id — Vite plugin replaces `'__SAKURA_BUILD_ID__'` in `public/sw.js` with `sakura-<version>-<ts>` per dev-serve request and per prod build. Existing activate-purge handler evicts the old `sakura-v1` cache automatically. Resolves Session 19's `OPEN BUG`. Also added `frontends/sakura/dev-tools/layout-debug.js` paste-into-console diagnostic for future user-environment-specific bugs.
- `a2ac04a` feat(sakura): boot retry + backend-unreachable banner — `loadCharacters` retries 3× w/ 200ms/600ms backoff. After exhaustion, `bootError` populated and `BackendErrorBanner` (fixed-position pill, Lucide WifiOff icon, Retry button) renders. Built after the user reloaded post-SW-fix, found backend was off, saw empty sidebar and thought their data was deleted (DB was intact: 14 chars / 302 sessions / 188 messages).

**Next session priority:** HUD Tier 5 (sidebar) / Tier 6 (3D viewer) only if user wants more pruning; otherwise start Visual Content in Chat (~4–8h, multi-session) or fix narrow-width layout bugs (~1–2h).

**Session 19 (2026-04-28) — 10 commits, all pushed to origin/master.**
Pre-restart: `aef220a` Tier 0 audit · `3a1c60f` Tier 1 deletes · `b6485d8` db autocommit · `af39c53` handoff.
Post-restart: `5ccf89a` date test fix · `62923e4` HUD Tier 2 (top toolbar 9→4 + ⋯ overflow) · `3bb8cce` `db_ctx` migration of 193 sites (**FD leak CLOSED**) · `fb77235` FD-leak regression test · `cc93e88` HUD Tier 3 (bottom toolbar 3 rows → 1) · `c4fadc5` HUD Tier 1b (sidebar 5-col → 6-col, fixes Help-orphan-row) · `fc3588a` mid-session handoff · `6120377` HUD Tier 4 (bond strip 4 rows → 1-line click-to-expand pill, +469/-180 lines).

## Completed This Session (Session 18 — Memory Browser unification + 3D viewer crash fix + HUD redesign plan)

| What | Details |
|------|---------|
| **MemoryBrowser raw-fetch → `api.*` unification** | Added `MemoryItem` interface + 4 typed methods to `api.ts` (`listMemories`/`searchMemories`/`deleteMemory`/`promoteMemory`). Refactored `MemoryBrowser.tsx` Memories tab — 4 raw `fetch()` calls replaced. Test suite collapsed: removed `makeFetchStub` URL+method router (~50 lines); 7 Memories cases now use Pattern 2. Commit `7b7bce1`. |
| **db-lock 500s on `/api/characters/{id}/relationship`** | `db()` helper now sets `PRAGMA busy_timeout = 30000` per connection — fixes the *class* of WAL-writer-contention bug across all `db()` users. `get_relationship` switched to SELECT-first / INSERT-on-miss. `reset_relationship` wrapped in `with conn:`. New regression test `test_relationship_endpoint.py` (5 tests). Commit `8a1f3f5`. |
| **3D viewer crash + greeting endpoint chain** | THE viewer crash: `BlinkController` constructor in `viewer.html` called `_poissonDelay()` BEFORE initializing `_emotionMod` → `TypeError: Cannot read properties of undefined (reading 'rateMul')` *inside* GLTFLoader success callback. Crash happened AFTER VRM downloaded — viewer never sent `modelLoaded`, parent React stuck on "Loading 3D model..." forever. Fixed by reordering. Bumped `?v=7`→`?v=8`. Also fixed three phantom-column SQL bugs in `get_character_greeting` (`greeting_message` → `greeting_text`, `sessions.updated_at` → `MAX(messages.ts) WHERE char_id`, `sessions.character_id` → `messages.session_id WHERE char_id`). Same `sessions.character_id` bug in diary endpoint fixed in passing. New regression `viewer.blinkController.test.ts` (3 tests). Verification: Playwright drove app → VRM (Panicandy) renders at 118 FPS with `motion_neutral` animation playing. Commit `643bd24`. |
| **HUD redesign plan written (deferred)** | `docs/plans/2026-04-27-hud-redesign-staged.md` (262 lines). 8-tier intensity ladder, escalate only when previous tier is judged insufficient. Recommended order: 0 → 1 → 2 → pause → 4 → pause → 3 → 6 → 5 → 7 → 8. Hard constraints baked in: no new chrome, theme test per tier, one commit per tier, 10-min real-use evaluation gates. Commit `6255578`. |
| **4 bug docs filed in `docs/bugs/`** | `2026-04-27-character-relationship-db-lock.md` ✅FIXED · `2026-04-27-viewer-or-model-assignment-broken.md` ✅FIXED · `2026-04-27-model-picker-no-preview-images.md` (open, P2) · `2026-04-27-hud-cramped-overcrowded.md` (open, P1, has plan above) |
| **Verification** | pytest 2683 passed (+5 new) · vitest 203 passed (+3 new BlinkController structural tests) · tsc clean. Live verification via Playwright agentic drive — 3D viewer renders the avatar successfully. |

## Completed This Session (Session 17 — MemoryBrowser test closeout + 4 pre-existing failures cleared)

| What | Details |
|------|---------|
| **MemoryBrowser Memories + Journal + integration coverage** | +16 Vitest cases in `frontends/sakura/src/test/MemoryBrowser.test.tsx`. Memories tab (7): list with `char_id`, role/tier badges, empty, 500 error, search→Go, DELETE, PATCH `/promote`, pagination. Journal tab (5): entries render, count singularization, empty, expand/collapse, session#. Integration (3): close button, tab persistence, Overview-reset on reopen. Used a per-suite `makeFetchStub()` URL+method router for raw-fetch endpoints. Commit `bc71397`. |
| **Cleared 4 pre-existing frontend test failures** | OnboardingWizard "Get started → System Scan" was multi-matching `getByText` on the h2 + WizardProgress label — scoped to `getByRole('heading')`. SettingsView export/import × 3 were crashing because `FormatRulesEditor` mounted with an unstubbed `api.getFormatRules` — added the missing CRUD methods to the api mock. Test-only changes, zero production code touched. Commit `9c17540`. |
| **Verification** | pytest 2678 passed (backend untouched) · vitest 196 → 200 passed (+16 new + 4 unbroken) · tsc clean. The "4 pre-existing failures" footnote that has been carried forward since session 13 is now retired. |

## Completed This Session (Session 16 — Memory Browser audit + Vitest coverage + token-budget prune)

| What | Details |
|------|---------|
| **Audit discovery** | `MemoryBrowser.tsx` (commit `9592dcf`, 1197 lines, 4 tabs) was already shipped — prior handoff's "backend ready, needs React UI" claim was stale memory. Actual gap = zero test coverage. |
| **Vitest coverage** | 20 new cases in `frontends/sakura/src/test/MemoryBrowser.test.tsx`. Covers top-level overlay (open/close, tab switching, no-character guard), Overview tab (stats, category breakdown, journal preview, error fallback), and Facts tab (add/create/delete, source badges, category grouping). Memories + Journal tabs deferred to session 17. |
| **CURRENT_STATUS.md prune** | 290 → 153 lines. Sessions 1-11 + Mar 29 research expansion relocated to new `docs/sessions/ARCHIVE.md`. Saves ~2k tokens per `/pre-session` cold start. |
| **Stale-claim fixes** | `MEMORY.md` + `SESSION_HANDOFF.md` updated to reflect shipped-but-untested Memory Browser status. |
| **New feedback memory** | `feedback_pre_session_token_budget.md` — user directive: prune CURRENT_STATUS/MEMORY/CLAUDE.md aggressively; additions should land with equivalent prune in same commit. |
| **Verification** | pytest 2678 passed (backend untouched) · vitest 180 passed (+20) · 4 pre-existing failures unchanged · tsc clean. |

## Completed This Session (Apr 19–20, session 15 — CC Harness Hygiene Sweep)

Meta-work only — no product code or tests touched. Mirror-applied to AnimeGirly.

| What | Details |
|------|---------|
| **Permission mode** | `.claude/settings.local.json` `bypassPermissions` → `auto`. Dropped `skipDangerousModePermissionPrompt` from `~/.claude/settings.json`. |
| **Env flag** | Added `CLAUDE_CODE_NO_FLICKER=1` to `.claude/settings.json` env block. Restart CC to activate. |
| **Skill deletions** | `/dashboard` (subset of `/pre-session`), `/sprint` (→ `/go --preset=sprint`), `/review` renamed → `/ui-review` (disambiguate from `/audit`). |
| **Skill refactor** | `/handoff` rewritten as thin wrapper around `/checkpoint` — names shared status-sync steps instead of duplicating them. |
| **Skill flag** | `/go` gained `--preset=sprint`; `/go` agent roster updated to include `frontend-tester` + `advisor` + `regression-guard`, orchestrator row removed. |
| **Agent deletion** | `orchestrator.md` — phantom role (main Claude IS the orchestrator during /go). |
| **Agent demotion** | `production-readiness-auditor.md` moved from `~/.claude/agents/` → `.claude/agents/` (repo-local). |
| **Agent descriptions** | `advisor` vs `prd-writer` boundary clarified (light vs formal PRDs); `qa-hunter` scoped to backend-only (vs `frontend-tester`). |
| **Repo CLAUDE.md** | New "Suggestion Triggers" section — risk-signal mode for `/qa-sweep` + `/verify-servers` with 4 alternative modes documented inline. |
| **Global ~/.claude/CLAUDE.md** | New "Preference Forks — Offer Options, Don't Pick Silently" rule — extends AskUserQuestion with preference/aesthetic/layout fork coverage. |
| **Global new-repo ritual** | Wrote `~/.claude/docs/new-repo-setup.md` — manual decision-tree reference for future repos. NOT auto-applied. |
| **Statusline** | Fixed cumulative-vs-current-tokens bug ([CC #13783](https://github.com/anthropics/claude-code/issues/13783)). Added `SEP_PAD` tunable, dynamic model-suffix shortening, balanced separator spacing. |
| **AGENTS.md** | Full rewrite — 12 agents, orchestrator removed, role boundaries spelled out. |
| **AnimeGirly mirror** | Same cleanups applied in AG working tree (deleted /dashboard, /implement-feature, orchestrator; /go got --mode=roadmap; Suggestion Triggers section appended, AG-tailored). |
| **New feedback memory** | `feedback_no_qa_sweep_in_go.md`, `feedback_new_repo_setup_manual.md`, `feedback_tool_per_repo_no_mixing.md`, `project_statusline_review_due.md` (2026-05-19 rebuild reminder). |
| **Verification** | pytest 2678 passed · tsc clean — no product-code or test changes, all green baseline preserved. |

## Completed This Session (Apr 18, session 14 — Harness Upgrades, Tier 1+2)

Meta-work on the dev workflow itself. Repo-local-only.

| What | Details |
|------|---------|
| **14.1 CLAUDE.md verification gates** | Added `## Verification Before Claiming Success` (work-type → required evidence) and `## Agent Dispatch Policy`. Expanded `## Known Sensitive Areas` with context-provider mock drift + Pydantic↔TS type drift. Commit `0b08397`. |
| **14.2 Biome hook upgrade** | PostToolUse hook swapped `biome format --write` → `biome check --write` (format + safe-autofix lint). |
| **14.3 /verify-servers skill** | New `.claude/skills/verify-servers/SKILL.md` — probes backend 8080, sakura 5175, dashboard 3333, viewer iframe. Curl + body-content sanity + log scan for ABI/ImportError/segfault keywords. |
| **14.4 /go phase gates** | `/go` gained `Phase-End Gates`: test-subset tail paste, `/verify-servers` when phase starts a service, one-line plan status append. |
| **14.5 /qa-sweep chunked mode** | `/qa-sweep --chunked`: batches of 50, per-batch commit to `docs/testing/qa-findings-*.md`, P0/P1/P2 categorization. |
| **14.6 regression-guard agent** | New `.claude/agents/regression-guard.md` — scans `git log --grep='fix'` for repeat patterns, writes locked-in tests citing commit hashes. |
| **14.7 verification** | pytest 2678 passed, tsc clean, vitest 160 passed + 4 pre-existing failures unchanged. |
| **New feedback memory** | `feedback_batch_work_prefer_momentum.md`, `feedback_no_global_config_changes.md`, `feedback_scope_definitions.md`. |

## Completed This Session (Apr 14, session 13 — Bond Phases 5+6)

| What | Details |
|------|---------|
| **Bond Phase 5: Memorial Scenes** | 39 tier-transition vignettes (13 chars × 3 tier boundaries). `bond_scenes_seen` table (schema v70). 5 backend endpoints. `MemorialScene.tsx` overlay + `useMemorialScene` hook. |
| **Bond Phase 6: Analytics** | `GET /api/characters/{id}/bond/analytics` — XP source breakdown, session counts, tier history. DevConsole Bond tab. |
| **Tests** | +32 new (2678 backend total, 160 frontend total). |

## Completed This Session (Apr 14, session 12 — Per-Character Scenarios)

| What | Details |
|------|---------|
| **Per-Character Scenario Templates** | schema v69 seeds 65 builtin templates (13 chars × 5). 6 REST endpoints under `/api/scenarios/templates`. |
| **ScenarioPicker UI** | `ScenarioPicker.tsx` (497 lines) — modal with mood-grouped list, activate/random/create-custom. `useScenarios.ts` hook (186 lines). |
| **Tests** | +46 new (2650 total): 29 backend + 17 vitest. |

## Previous Sessions (detail in [ARCHIVE.md](docs/sessions/ARCHIVE.md))

| Session | Date | Key work |
|---------|------|----------|
| 11 | Apr 7 | AI Quick Replies + CHARA V2 Compliance (v68) + Competitor Gap Analysis |
| 10 | Apr 7 | QA Fixes (4) + Bond P1-2 (v67, BondProgressBar, LevelUpCelebration, +82 tests) |
| 9 | Apr 6 | AIE Phase B (6 modules: trend, decay, memory→behavior, critique, topic graph, milestones; v66, +114 tests) |
| 8 | Apr 6 | /release-test skill + 31 automation recs + 4 hooks + FastMCP bridge + SQLite MCP + 3 skills + 2 agents + 2 rules + Biome |
| 7 | Apr 4 | 14 CC improvements (/handoff, /pre-session, /qa-sweep, perf-reviewer, pre-commit hook, CLAUDE.md sections) |
| 5 | Apr 1 | AIE Phase A (4 modules: classifier, tuner, user model, gate; v65, +165 tests) |
| 4 | Mar 31 | 12 NSFW frontend components + Intimacy tab + 11 overlays + +3 toolbar buttons + 3 shortcuts |
| 3 | Mar 28 | NSFW Phases 1-3 (Foundation + State Machines + Scene Architecture) |
| 2 | Mar 30 | NSFW Phases 5-10 (Emotional, Voice, Visual, Personalization, Polish, Advanced; +318 tests) |
| 1 | Mar 30 | NSFW Phase 4 (Milestones, Intimate Memory, Aftercare, Pillow Talk; v62, +120 tests) |

## NSFW Mega-Sprint Summary (detail per phase in ARCHIVE.md)

| Phase | Status | Features | Tests Added |
|-------|--------|----------|-------------|
| **Phase 1: Foundation** | ✅ COMPLETE | F40, F13, F15, F30 | +146 |
| **Phase 2: State Machines** | ✅ COMPLETE | F17, F6, F16, F10 | +113 |
| **Phase 3: Scene Architecture** | ✅ COMPLETE | F32, F38, F8, F25 | +112 |
| **Phase 4: Memory & Milestones** | ✅ COMPLETE | F1, F2, F5, F12 | +120 |
| **Phase 5: Emotional Continuity** | ✅ COMPLETE | F3, F34, F43, F45, F11, F39 | +126 |
| **Phase 6: Voice & Audio** | ✅ COMPLETE | F4, F33, F36, F46 | +70 |
| **Phase 7: Visual & Image Gen** | ✅ COMPLETE | F29, F42, F28, F19, F27 | +34 |
| **Phase 8: Deep Personalization** | ✅ COMPLETE | F35, F37, F47, F31, F41, F44, F22 | +37 |
| **Phase 9: Polish & Extras** | ✅ COMPLETE | F24, F26, F20, F48 | +14 |
| **Phase 10: Advanced Features** | ✅ COMPLETE | F49–F56 (8 features) | +37 |

## Next Tasks (Priority Order — updated Session 21, 2026-04-29)

Completed since the last refresh: AIE Phase B · Bond Phases 1-6 · Per-Character Scenarios · Memory Browser (UI shipped session 16, test coverage session 16-17, raw-fetch→`api.*` unification session 18) · 4 pre-existing frontend test failures cleared session 17 · DB connection FD leak closed session 19 (commit `3bb8cce`) · HUD Tier 0/1/1b/2/3/4 + SW cache fix + backend-unreachable banner.

**Active queue:**

1. **Push 2 local commits** (`f8e4ef0`, `a2ac04a`) to `origin/master` — push gate clear. Plus the cleanup commits from this session.
2. **HUD Tier 4 evaluate** per `docs/plans/2026-04-27-hud-redesign-staged.md`. User just had a real-use window during the SW-cache debug. Decision: stop / Tier 5 (sidebar consolidate) / Tier 6 (3D viewer overlay rethink) / pill size bump. Each tier ~1.5–4h.
3. **Verify or drop the right-cluster `..` claim** from Session 20 handoff. `StatusBar.tsx:350` already uses Lucide `MoreHorizontal` (renders as `⋯`). The `..` is probably a clipped label elsewhere. Browser-repro at narrow widths needed. ~10 min.
4. **Bond pill size bump** (Tier 4 follow-up alternative). Single-line cosmetic. ~30 min.
5. **`docs/bugs/2026-04-27-model-picker-no-preview-images.md`** (P2, OPEN) — model picker shows no preview thumbnails. Untriaged.
6. **Visual Content in Chat** — "Character sends you a picture" UX. Image-gen pipeline exists in backend. ~4–8h, multi-session.
7. **HUD Tier 7 (density toggle)** + **Tier 8 (full IA redesign)** — only if Tier 5/6 don't satisfy.
8. **Humanoid Motion Quality** — `docs/plans/2026-03-29-humanoid-motion-spec.md` (83-130h).
9. **Spring Bones 3D** — `docs/plans/2026-03-29-spring-bones-spec.md` (16.5h).
10. **Jiggle Physics** — `docs/plans/2026-03-29-jiggle-physics-spec.md` (15-21h).
11. **Model Marketplace Expansion** — `docs/plans/2026-03-29-model-marketplace-spec.md` (25-32h).
12. **Privacy-First Sync** — `docs/plans/2026-03-29-privacy-sync-spec.md` (~6h).
13. **AIE Phase C: Advanced** — LoRA training pipeline, DSPy prompt optimization. Heavy, independent.

## Browser Test Sweep Checklist

| Feature | Area | What to verify |
|---------|------|---------------|
| NSFW Phase 1-3 panels | Settings/Chat | Boundaries panel, writing style picker, sensory vocab, pet names |
| **Memory Browser (session 17)** | Ctrl+M overlay | All 4 tabs render, Facts CRUD works, Memory search returns, Promote/Delete update UI, Journal expand/collapse |
| P2 Context Assembly Viewer | Dev panel | Token counts, color-coded sections |
| Phase 2-3 frontend (new) | Settings/Chat | Pacing mode picker, scenario templates, power dynamics |
| Director Mode commands | Chat input | `/direct` commands parse and execute |
| Scenario Templates | Chat picker | Template browser, selection, generation |
| Relationship State display | Sidebar | Bond level, mood, affinity rendering |
| Voice Pipeline (VoiceOrb) | Chat area | Record, send, playback, barge-in |
| Live2D model picker | Viewer | Browse, select, load Live2D models |
| Expression Portraits | Chat/sidebar | AI-generated portraits display correctly |
| Character Card Import/Export | Settings | SillyTavern card import + export |
| Model Browser (avatar download) | Overlay | Browse, download, manage VRM avatars |
| Settings modal (all tabs) | Modal | Every tab renders, saves, persists |
| 18 themes switching | Global | All 9 light + 9 dark themes apply correctly |

## Quick Reference

| Resource | Path |
|----------|------|
| Session Archive | `docs/sessions/ARCHIVE.md` |
| NSFW plan | `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` |
| Adaptive intelligence spec | `docs/plans/2026-03-29-adaptive-intelligence-spec.md` |
| Bond progression spec | `docs/plans/2026-03-29-bond-progression-spec.md` |
| Spring bones spec | `docs/plans/2026-03-29-spring-bones-spec.md` |
| Model marketplace spec | `docs/plans/2026-03-29-model-marketplace-spec.md` |
| Privacy sync spec | `docs/plans/2026-03-29-privacy-sync-spec.md` |
| Humanoid motion spec | `docs/plans/2026-03-29-humanoid-motion-spec.md` |
| Jiggle physics spec | `docs/plans/2026-03-29-jiggle-physics-spec.md` |
| Research docs (26 files, ~142k words) | `docs/research/2026-03-29-*-part-*.md` |
| NSFW Phase 4 research | `docs/research/2026-03-29-nsfw-phase4-research-part-*.md` |
| NSFW Frontend UX research | `docs/research/2026-03-29-nsfw-frontend-ux-research-part-*.md` |
| Dev dashboard | `http://localhost:3333/dashboard.html` |
| Quickstart cheatsheet | `docs/QUICKSTART.md` |
| Convention guides | `docs/conventions/*.md` |
| v1.0 roadmap (uncommitted) | `docs/ROADMAP.md` |
| **Master Q2 2026 roadmap (session 30)** | **`docs/plans/2026-05-06-opus-planning-roadmap.md`** |
| Session 30 PRDs (4) | `docs/plans/2026-05-06-prd-{header-overflow,retry-regenerate,message-editing,previous-generations-browser}.md` |
| Competitor refresh delta (May 6) | `docs/research/2026-05-06-competitor-refresh-delta.md` |
