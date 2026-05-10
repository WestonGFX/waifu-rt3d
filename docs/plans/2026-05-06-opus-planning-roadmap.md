# Opus Planning Roadmap — May 6, 2026

**Authored:** session 30, 2026-05-06
**Owner:** Claude (Opus 4.7) + Christopher Lord
**Span:** ~3 months (May 2026 → August 2026), ~8 milestones, 50+ items
**Status:** ✅ Plan ready · awaiting answers to 7 open questions before `/go`

---

## Why this exists

Session 29 wave 2 closed with the explicit handoff: *"New Opus planning session — 32-64+ item roadmap with milestones, PRDs, research on NSFW roleplay app competitors, and feature specs for header fix + retry/regenerate + message editing + previous-generations browser."* This doc is that planning session.

It synthesizes four streams of work that landed today (session 30) into one prioritized backlog:

1. **6 wave-2 bug docs** filed in `docs/bugs/2026-05-06-*.md` — turning CURRENT_STATUS list-items into formal tracked bugs with repro + suggested fix.
2. **NSFW competitor research refresh** (`docs/research/2026-05-06-competitor-refresh-delta.md`, ~395 lines, 40 sources) — what shifted in the 4-week window since the April 7 gap analysis.
3. **4 feature PRDs** in `docs/plans/2026-05-06-prd-*.md` — header overflow, retry/regenerate, message editing, previous-generations browser. Each dual-audience Why/How.
4. **Synthesis layer (this doc)** — milestones, prioritized backlog, open questions.

---

## Top-5 deltas this roadmap reacts to (from competitor refresh)

These are the strategic forcing functions. Every milestone below either answers one of them or remains valid in spite of them.

| # | Delta | Roadmap implication |
|---|---|---|
| 1 | Char.AI shipped Memory Visualization meter + "Remember this" + Lorebook on April 14, 2026 | **Memory transparency went from differentiator to table stakes.** Promote Memory Browser graph view + capacity meter ahead of other AIE work. New Milestone 2. |
| 2 | OSS voice cloning hit ElevenLabs parity (Voxtral, Fish S2 Pro, Chatterbox, Voicebox 22K stars) | T2-13 voice cloning drops from "future research" to "1-2 day integration." Promote to Milestone 3. |
| 3 | Local-first moat dramatically stronger (Char.AI face-scan lockouts, Replika 2.0 personality drift, Aura breach, Oversecured 17-app audit, EU AI Act effective Aug 2 2026) | **Marketing-side win.** Privacy comparison page (no engineering) belongs in Milestone 8. Strengthens our pitch without us shipping anything. |
| 4 | VRM desktop-companion category got crowded (HoloWaifu, MateEngine, CielChan, Oshikoi, etc.) | "We use VRM" is no longer a moat. Our differentiator is the **tiered memory + bond system + emotion engine** layered on top of VRM. Roadmap should defend that surface, not the VRM substrate. |
| 5 | SpicyChat shipped 2-10 character group chats; xAI Grok ships unlock-NSFW-by-affinity | Two re-litigation candidates (group chat: still NO per soul-of-app; affinity-gated NSFW: open question — steal it?). Surfaced as Open Questions #2 and #4. |

---

## Surprise findings during PRD authoring

Three of the four "missing" features in the wave-2 bug doc are actually 70-90% scaffolded already. The bug doc was written from a UI-tester perspective and missed code that exists but isn't wired. Concretely:

- **Retry/Regenerate:** `DialogueBubble.tsx` lines 95-107 already declare `onRegenerate` + `isRegenerating` props. They are never wired in `ChatThread.tsx`. ~3h to wire vs ~1d if greenfield.
- **Message Editing:** Backend `PUT /api/messages/{id}` already exists at `server.py:6848-6870`. `DialogueBubble.tsx` already has `onEdit` prop, `editing` state, textarea block at lines 322 / 413-432 / 519-543. Schema v73 + audit history + assistant-side editability + streaming guard remain. ~8h.
- **Previous-Generations Browser:** Almost entirely shipped — `messages` table has `parent_id` + `is_active`; `/api/messages/{id}/regenerate`, `/branches`, `/activate` all exist; `api.ts` mirrors them; `DialogueBubble.tsx:769-812` already renders the `◀ N/M ▶` pager. Real work is hardening (orphan-grouping bug, sibling_group_id complement, downstream-drift toast, test coverage). ~10h.

**Net effect:** the "4 missing features" milestone collapses from a multi-week build into **~24h of AI-assisted wiring + hardening + testing**. This is one of the bigger discoveries of the planning pass.

The retry/regen + message editing + previous-gens bug doc (`2026-05-06-retry-regenerate-and-message-edit-missing.md`) should be re-titled to reflect "scaffolded but unwired" — flagged as Open Question #7.

---

## Milestone Roadmap

```
M1  Wave-2 Bug Cleanup           ████████░░░  ~24h ai-assisted  ← start here
M2  Memory Transparency Parity   ███████░░░░  ~12h
M3  Voice Cloning Onramp         ███████░░░░  ~14h
M4  Visual Content MVP Closeout  ████░░░░░░░  ~6h
M5  AIE Phase C (gated by Q1)    ░░░░░░░░░░░  24-180h  (tier choice required)
M6  Gamification / Retention     █████░░░░░░  ~12h
M7  Animation Quality            ░░░░░░░░░░░  100h+    (multi-month)
M8  Distribution & Marketing     ███░░░░░░░░  ~6h + non-eng
```

### M1 — Wave-2 Bug Cleanup (~24h calibrated AI-assisted, target: 1-2 weeks)

The 8 items below close the entire wave-2 bug docket plus 2 carried-over P-bugs. Most have PRDs ready or are scaffolded — wiring + hardening, not greenfield.

| # | Item | Severity | Effort | PRD / Bug ref |
|---|---|---|---|---|
| 1 | Header UI occlusion fix at narrow widths | P1 | ~4h | [PRD](2026-05-06-prd-header-overflow.md), [bug](../bugs/2026-05-06-header-ui-occlusion-narrow-widths.md) |
| 2 | Retry/Regenerate AI response (text) — wire scaffolded code | P1 | ~3h | [PRD](2026-05-06-prd-retry-regenerate.md), [bug](../bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md) |
| 3 | Message editing — schema v73 + finish UI | P1 | ~8h | [PRD](2026-05-06-prd-message-editing.md), [bug](../bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md) |
| 4 | Previous-generations browser — harden orphan grouping + tests | P1 | ~10h | [PRD](2026-05-06-prd-previous-generations-browser.md), [bug](../bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md) |
| 5 | Image URL + image_prompt persisted to messages — schema v73 | P2 | ~3h | [bug](../bugs/2026-05-06-image-url-not-persisted-to-messages.md) |
| 6 | 3D viewer 0 FPS / black canvas on first open | P3 | ~1h | [bug](../bugs/2026-05-06-viewer-zero-fps-on-first-open.md) |
| 7 | 3D viewer narrow-panel grounding off (sensitive area) | P3 | ~3h | [bug](../bugs/2026-05-06-viewer-narrow-panel-grounding-off.md) |
| 8 | Animation packs — bundle CC0 set OR fix download URLs | P2 | ~2h | [bug](../bugs/2026-05-06-animation-packs-dead-urls.md) |

**v73 coordination:** items 3, 4, 5 all touch `messages` table. **Single migration v73** consolidates: `edited_at`, `edit_history`, `sibling_group_id`, `sibling_index`, `image_url`, `image_prompt`. Six columns, one preflight function, one round of validation.

**Suggested order:**
1. Item 5 (image url persistence) — simplest schema-touching item, validates v73 column-add path.
2. Items 3 + 4 (message editing + sibling hardening) — share v73, ship together if convenient.
3. Item 2 (retry/regen) — pure wiring; can ship before or after schema items.
4. Item 1 (header overflow) — frontend-only, parallel-safe with backend work.
5. Items 6 + 7 (viewer) — sensitive area, sequential, browser-test required.
6. Item 8 (animations) — independent, can slot anywhere.

### M2 — Memory Transparency Parity (~12h calibrated, react to Char.AI April 14)

Char.AI shipped Memory Visualization on April 14, 2026. We now need to *match or beat* it.

| # | Item | Effort | Notes |
|---|---|---|---|
| 9 | Memory capacity meter ("X memories stored / Y until compression") | ~2h | Surface existing tier counts in Memory Browser Overview tab. Backend already has the data. |
| 10 | "Remember this" pinnable user-action on any message | ~3h | New endpoint `POST /api/messages/{id}/pin-as-memory`; UI button on hover; persists to `user_memories` table with `source=manual_pin`. |
| 11 | Memory Browser graph view (Nomi-style mind map) | ~5h | `MemoryGraph.tsx` overlay tab — D3 or vis-network rendering of fact-relationship graph. Read-only initial. |
| 12 | Memory tier breakdown UI (CORE/EXTENDED/DEEP visualization) | ~2h | Beat Char.AI by exposing what they hide — show the user *which tier* a memory lives in + when it was last reinforced (Ebbinghaus decay timer). |

### M3 — Voice Cloning Onramp (~14h, react to OSS parity)

Voicebox / Voxtral / Fish S2 Pro / Chatterbox all hit ElevenLabs parity in the last month. T2-13 promotion candidate.

| # | Item | Effort | Notes |
|---|---|---|---|
| 13 | Multi-engine voice adapter (Voicebox-style) | ~6h | New `backend/voice/cloning_adapter.py`; adapters for Fish S2 Pro + Chatterbox + Voxtral. Pluggable like our LLM adapter. |
| 14 | Voice cloning UI in Settings (upload sample → generate) | ~3h | Settings → Voice tab gains "Clone a Voice" panel. Sample upload + 3-5s required + LLM-generated voice description. |
| 15 | Voice "wand" — generate voice from character backstory | ~2h | Steal from Kindroid. Read character `backstory` + `personality` → LLM prompt → voice description → adapter call. |
| 16 | Voice messages (async TTS playback in chat) | ~3h | Steal from Candy AI / Nomi. New `voice_message_url` field on assistant messages; renders as inline audio player. Reuses existing TTS pipeline. |

### M4 — Visual Content MVP Closeout (~6h)

Three deferred Phase 2/3 items remain from sessions 26-29.

| # | Item | Effort | Notes |
|---|---|---|---|
| 17 | Visual Content Phase 2: imagePrompt field + regenerateImage on history | ~2h | Closes once item 5 (M1) lands the schema. |
| 18 | Visual Content Phase 3: stuck-gen indicator on DialogueBubble (re-spec first) | ~3h | Original signal `imagePrompt set + imageUrl absent` insufficient — needs `image_regen_started_at` field. Re-spec before build. |
| 19 | Visual Content Phase 3: Settings retention slider | ~1h | Already partial in `Settings → Image Gen` tab per `05bf460`. Verify + finish. |

### M5 — AIE Phase C (gated by Open Question #1)

Adaptive Intelligence Engine Phase C — LoRA training pipeline + DSPy prompt optimization. Heavy independent track. Three sub-tiers; pick before /go:

- **MVP** (24-30h): Single LoRA per character, manual training trigger, Mac-served, basic DSPy on 3 prompts.
- **Standard** (56-80h): Per-character + per-mood LoRAs, automated retraining cadence, hybrid feedback signal subsystem with 4 privacy modes, expanded DSPy on full prompt library.
- **Full** (120-180h): All of Standard + cross-character transfer learning, online fine-tuning, full prompt-library DSPy + emergent prompt evolution.

Plan doc: `docs/plans/2026-05-06-aie-phase-c-scoping.md`. **7 open questions in that doc must be answered before `/go`.**

### M6 — Gamification / Retention (~12h)

The 4-week competitor refresh confirmed bond progression is *the* retention driver across every successful product. Three feature additions.

| # | Item | Effort | Notes |
|---|---|---|---|
| 20 | Daily streaks UI (visible streak counter + flame icon) | ~3h | T1-8 specced. Bond XP already awards daily-first bonus — surfacing it in UI. |
| 21 | Achievement / badge system | ~6h | "First voice call," "100 messages," "shared a secret." Schema v74 (badges table). Modal celebration reuse from `LevelUpCelebration`. |
| 22 | Affinity-gated NSFW unlocks (Open Question #4 — steal from Grok?) | ~3h | Bond level gates which NSFW Phase content surfaces. Aligns with bond system; partly overlaps with existing tier flags. |

### M7 — Animation Quality (multi-month, 100h+)

Existing plan files cover this — no new work needed at the planning layer. List for visibility:

| # | Item | Plan |
|---|---|---|
| 23 | Bundle CC0 VRMA set (M1 item 8 partial credit) | inline |
| 24 | Spring bones 3D | `docs/plans/2026-03-29-spring-bones-spec.md` (16.5h) |
| 25 | Jiggle physics | `docs/plans/2026-03-29-jiggle-physics-spec.md` (15-21h) |
| 26 | Humanoid motion quality | `docs/plans/2026-03-29-humanoid-motion-spec.md` (83-130h) |

### M8 — Distribution & Marketing (~6h engineering + non-engineering)

| # | Item | Effort | Notes |
|---|---|---|---|
| 27 | Privacy comparison marketing page | non-eng | Cite Aura breach, Oversecured audit, Char.AI face-scan, Replika fine, EU AI Act. README-style page in `docs/marketing/`. |
| 28 | EU AI Act compliance prep documentation | ~2h | Doc-only; we're already compliant by virtue of local-first, but document the position before Aug 2, 2026. |
| 29 | Steam distribution evaluation (Open Question #3) | ~4h scope only | Decision doc. Build path is much more if we say yes. |

---

## Backlog (un-milestoned, surfaced for visibility)

These items are real but don't fit a Q2 milestone yet. They sit here so they're visible in `/pre-session` and roadmap reviews.

| # | Item | Source | Tier |
|---|---|---|---|
| 30 | Apply drafted character styles (apply script, companion to draft script `47da798`) | session 27 next-task | Quick |
| 31 | Choose-your-own-adventure mode (Char.AI Stories competitor) | competitor refresh | Big |
| 32 | Per-character scenario community sharing | competitor refresh | Big |
| 33 | World building tools | April 7 gap | Big |
| 34 | CCv3 / CHARX character card support | April 7 gap | Med |
| 35 | Continue generation ("extend" button) | SillyTavern parity | Quick |
| 36 | Conversation full-text search | April 7 gap | Med |
| 37 | Chat history Markdown export | April 7 gap | Quick |
| 38 | Visual Novel mode (portrait left, text right) | SillyTavern | Med |
| 39 | NSFW image generation pipeline + prompt templates | April 7 gap | Big |
| 40 | Consistent character appearance (IP-Adapter / reference image) | April 7 gap | Big |
| 41 | Image gallery / collection (browse, favorite history) | April 7 gap | Med |
| 42 | Multiple voice options per character (preset gallery) | April 7 gap | Quick |
| 43 | Live2D runtime broken (Cubism SDK fails to load) | known issue | Big |
| 44 | Embedding model issue (MLX format produces garbage) | known issue | Big |
| 45 | Settings dedup refactor (5 hard duplicates, 6 soft, audit `f9db148`) | session 27 | Med |
| 46 | Memory Browser tab overflow + close-on-click | filed session 28 | Quick |
| 47 | Character avatar URLs point to VRM files | filed session 29 | Quick |
| 48 | Model picker no preview images | filed April | Med |
| 49 | Live-DB v72 application (auto-applies on next backend boot) | session 28 | Trivial |
| 50 | character_relationships v72 dedupe verification | session 28 schema | Quick |
| 51 | Statusline review (Neon Glassline v2 rebuild, due ~2026-05-19) | scheduled | Med |
| 52 | Touch interaction feature (avatar poke/touch via mouse) | project memory | Med |
| 53 | Privacy-first sync | `docs/plans/2026-03-29-privacy-sync-spec.md` (~6h) | Med |
| 54 | Model marketplace expansion | `docs/plans/2026-03-29-model-marketplace-spec.md` (25-32h) | Big |

**Total tracked items:** 54. Wave-2 + competitor reactions cover items 1-29 (the eight milestones); items 30-54 sit in the backlog awaiting prioritization.

---

## Open Questions — answer before `/go`

Seven decisions block clean execution.

### Q1 — AIE Phase C tier
Pick MVP (24-30h) / Standard (56-80h) / Full (120-180h). Plan doc `docs/plans/2026-05-06-aie-phase-c-scoping.md` has 7 sub-questions inside this one.

### Q2 — Group chat re-evaluation
SpicyChat shipped 2-10 character group chats in April 2026. Project memory says we *do not plan to ship group chat* (`feedback_no_emotion_mirroring.md` adjacent — same "soul of app" file). Refresh confirms the decision is now a more expensive "no" than it was on April 7. **Re-litigate? Or hold?**

### Q3 — Steam distribution
CielChan, MateEngine, HoloWaifu all distribute via Steam. Lower friction than our current install path. But Steam = company / store relationship + content moderation = gives up some local-first / privacy pitch surface. **Yes / no / later?**

### Q4 — Affinity-gated NSFW unlocks (steal from Grok)
xAI Grok unlocks NSFW content at higher affinity levels. Cleaner than our current flat tier flags. Aligns naturally with bond system. **Steal it? Or keep flat tier model?**

### Q5 — Memory Browser graph view priority
Char.AI shipped Memory Visualization. Memory Browser is now table stakes, not a differentiator. Should the graph view (M2 item 11) jump ahead of M1 retry/regen as the *next* shipped feature, or is M1 still the better start? Argument for jumping: defensive against Char.AI defection. Argument against: M1 is mostly already-scaffolded wiring with quick visible wins.

### Q6 — Voice cloning timing
M3 voice cloning is unlocked from "future" to "ready now" by OSS releases. **Ship in this 3-month plan, or push to next?** Could displace M4 or M6.

### Q7 — Re-title bug doc 2026-05-06-retry-regenerate-and-message-edit-missing.md
The doc is wrong — features aren't missing, they're scaffolded but unwired. **Re-title to "...-scaffolded-not-wired.md" + add follow-up section noting the actual state?** OR replace the doc entirely with a redirect to the three PRDs?

---

## Cross-references

### PRDs (this session)
- `docs/plans/2026-05-06-prd-header-overflow.md`
- `docs/plans/2026-05-06-prd-retry-regenerate.md`
- `docs/plans/2026-05-06-prd-message-editing.md`
- `docs/plans/2026-05-06-prd-previous-generations-browser.md`

### Bug docs (this session)
- `docs/bugs/2026-05-06-header-ui-occlusion-narrow-widths.md`
- `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md` *(needs re-title — see Q7)*
- `docs/bugs/2026-05-06-animation-packs-dead-urls.md`
- `docs/bugs/2026-05-06-image-url-not-persisted-to-messages.md`
- `docs/bugs/2026-05-06-viewer-zero-fps-on-first-open.md`
- `docs/bugs/2026-05-06-viewer-narrow-panel-grounding-off.md`

### Pre-existing bug docs (still open)
- `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md` ✅ FIXED session 29 — close ticket
- `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md` ✅ FIXED session 28 (v72) — verify on live DB
- `docs/bugs/2026-05-06-character-avatar-urls-point-to-vrm-files.md` — open
- `docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md` — open
- `docs/bugs/2026-04-27-model-picker-no-preview-images.md` — open
- `docs/bugs/2026-04-27-hud-cramped-overcrowded.md` — partially addressed (HUD tiers 0-5 shipped); evaluate if still relevant

### Research
- `docs/research/2026-05-06-competitor-refresh-delta.md` (today)
- `docs/research/2026-04-07-competitor-gap-analysis.md` (April 7 baseline)
- `docs/research/2026-03-25-nsfw-roleplay-platforms.md` (March deep-dive)
- `docs/design/competitive-research-2026-03-18.md` (Cycle 1)

### Existing pre-Q2 plans
- `docs/plans/2026-05-06-aie-phase-c-scoping.md` (M5 source — 7 sub-questions)
- `docs/plans/2026-05-06-visual-content-mvp-execution.md` (M4 source)
- `docs/plans/2026-05-06-visual-content-in-chat-scoping.md` (M4 background)
- `docs/plans/2026-04-29-user-reply-assist.md` (overlaps M2)
- `docs/plans/2026-03-29-spring-bones-spec.md` (M7)
- `docs/plans/2026-03-29-jiggle-physics-spec.md` (M7)
- `docs/plans/2026-03-29-humanoid-motion-spec.md` (M7)
- `docs/plans/2026-03-29-model-marketplace-spec.md` (backlog)
- `docs/plans/2026-03-29-privacy-sync-spec.md` (backlog)

---

## Estimation methodology

All effort estimates above are in **calibrated AI-assisted hours**. Per project memory `feedback_time_tracking.md`, AI-assisted dev runs ~12× faster than calendar estimates. Multiply by 12 for solo-engineer calendar-day equivalent if needed for external comparisons.

Tier shorthand for the un-milestoned backlog: **Trivial** (<1h), **Quick** (1-3h), **Med** (3-10h), **Big** (10h+).

---

## Suggested execution order

If all 7 open questions resolve favorably, the cleanest sequence is:

```
M1 → M2 → M3 → M4 → M6 → M8 → M5 → M7
```

Rationale:
- **M1 first** — highest user-visible impact per hour, mostly wiring scaffolded code.
- **M2 second** — defensive vs Char.AI April 14 shipment; still memory-Browser-shaped quick wins.
- **M3 third** — voice cloning is a fresh competitive surface and integrates with character creator.
- **M4 fourth** — closes Visual Content MVP (started session 26).
- **M6 fifth** — gamification reinforces what M1+M2+M3+M4 unlocked.
- **M8 sixth** — non-engineering or light engineering; ships marketing surface around what we built.
- **M5 seventh** — Phase C is heavy + independent; doing it last lets us bring lessons from M1-M6 into the LoRA training pipeline.
- **M7 last / parallel** — animation quality is multi-month; should run as a parallel track once M1-M3 stabilize so it doesn't block visible product wins.

Calibrated total for M1-M6 + M8: **~74h AI-assisted = ~9.25 working days at 8h/day** (or ~3-4 calendar weeks at 60% planning/meeting overhead).

M5 + M7 add anywhere from 124h (MVP + spring bones only) to 360h+ (Full Phase C + all animation specs) depending on Q1.

---

## Status

Plan ready. **Next action:** Christopher answers Q1-Q7. Once answered, `/go` against M1 — start with item 5 (image url persistence, validates v73 schema-add path) and proceed in suggested order.

---

## Decisions — 2026-05-06 (session 31)

All 7 open questions answered. `/go` against M1 is now unblocked.

| Q | Decision | Notes |
|---|---|---|
| **Q1 AIE Phase C tier** | **MVP (24-30h)** | Single LoRA adapter per character, basic DSPy signature optimization. Ship fast, prove the loop. |
| **Q2 Group chat** | **Re-litigate** | User wants to revisit. Add scoping pass to M6/backlog — perhaps 2-char mode (user + 1 guest character) rather than full group. |
| **Q3 Steam distribution** | **Scope it this plan (~4h decision doc)** | Write decision doc only — no build commitment. Understand content moderation risk + review fees + competitor precedent. |
| **Q4 Affinity-gated NSFW** | **Ship it, but make it optional toggle** | Bond-level unlocks NSFW content tiers AND expose an explicit override so user can opt out of bond-gating (keeps user agency). ~3h + ~1h for the toggle. |
| **Q5 M1 vs M2 order** | **Keep M1 first** | Quick wins, closes P1 bugs, builds polish before defensive memory feature. |
| **Q6 Voice cloning** | **Ship in this plan (M3)** | Window is open — OSS tools ready. Don't wait. |
| **Q7 Bug doc re-title** | **Re-title + add note** | Renamed to `2026-05-06-retry-regenerate-and-message-edit-scaffolded-not-wired.md` + correction note prepended. |

**Updated execution order:** M1 → M2 → M3 → M4 → M6 → M8 → M5 → M7 (unchanged from suggestion). Group chat scoping folds into M6 backlog pass.

---
- 2026-05-06 M1 (items 1-8): ✓ All 8 items shipped across sessions 31-32. Schema v73 landed. Browser verify needed for item 7 (viewer narrow-panel ResizeObserver — sensitive area).
- 2026-05-06 M2 (items 9-12): ✓ All 4 items shipped in session 33. Memory tier capacity meter, "Remember this" pin→memory, SVG mind map tab, tier filter pills.
- 2026-05-06 M3 (items 13-16): ✓ All 4 items shipped in session 33. Voxtral TTS adapter, voice wand endpoint, schema v74 voice_message_url, inline audio player + generate-voice button in DialogueBubble, Voice Cloning section in SettingsView VoiceTab.
- 2026-05-06 M4 (items 17-19): ⚠ Item 17 ✓ (PATCH endpoint + persistence). Item 18 deferred (re-spec needed for image_regen_started_at). Item 19 ✓ (already implemented, verified).
- 2026-05-06 M6 (items 20-22): ✓ Item 20 already complete (BondPill streak counter). Item 21 ✓ (character_achievements v75 + 11 defs + AchievementToast). Item 22 ✓ (nsfw.skip_bond_gate config toggle + SafetyTab UI + 3 call sites in server.py).
- 2026-05-06 M8 (Distribution docs): ✓ privacy-comparison.md + eu-ai-act-compliance.md + steam-distribution-evaluation.md shipped in session 33.
- 2026-05-06 Backlog quick pass (session 34): ✓ item-35 Continue generation (chatStore.continueGeneration + DialogueBubble ChevronsRight button). fix(preflight): v70+v71 INSERT bug resolved — all migrations now applied to live DB at v75. item-50 character_relationships verified (24,576→11 rows + UNIQUE INDEX). items 37/46/47 pre-existing.

- 2026-05-10 M5 (AIE Phase C MVP integration): ✓ 4 wiring gaps closed — scorer.py column fix, explicit→score_and_save fire-and-forget, implicit signal scheduler sweep, peft_local in registry, Voice Fine-tuning UI in Brain tab. commit 880ba13.
- 2026-05-10 Backlog item-42 (voice gallery): ✓ Browse button + VoiceGallery added to Character tab > Voice section. commit a05463e.
- 2026-05-10 Backlog item-34 (CCv3/CHARX): ✓ chara_card.py read_charx_bytes + character_book→lore_entries; server.py import-card accepts .charx; CharacterCardImporter + CardImportWizard accept .charx.
- 2026-05-10 Backlog item-36 (full-text search): ✓ pre-existing — GlobalSearchPanel + /api/search/messages + FTS5 v45 all implemented.
- 2026-05-10 Backlog item-48 (model picker thumbnails): ✓ pre-existing — ModelBrowser shows thumbnails; avatar PNGs exist for all built-in VRMs in storage/avatars/.
- 2026-05-10 Backlog item-38 (Visual Novel mode): ✓ pre-existing — vnMode toggle + VNPortrait/VNTextBox fully implemented in ChatThread.tsx.
- 2026-05-10 Backlog item-52 (touch interaction): ✓ viewer.html raycasting + zone detection already complete; added characterTouch→sendMessage reaction in useCharacterAudio.ts (10s cooldown, zone→action mapping).
- 2026-05-10 Backlog item-30 (character image styles): ✓ applied 14 AI-drafted image_style prompts to characters table via apply_character_styles.py.
