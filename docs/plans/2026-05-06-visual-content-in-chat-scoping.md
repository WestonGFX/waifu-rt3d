# Visual Content in Chat — Scoping Document

**Date:** 2026-05-06
**Status:** Scoping with 4 locked decisions (2026-05-06). MVP scope approved. Sister plan to `docs/plans/2026-05-05-ai-beta-test-mvp.md` (different concern; both reference shared frontend surfaces).

## Locked decisions (2026-05-06)

| Decision | Pick | Applies to |
|---|---|---|
| Scope tier | **MVP only** (~2-3 days) — validate before committing to Standard/Full | All work below the "MVP" header |
| NSFW proactive policy | **Same policy as SFW** — if proactive sends are on for the character and the content tier permits, NSFW images are eligible to fire on the same triggers | Standard tier only (MVP is user-request, no proactive — policy is dormant until Standard) |
| `image_style` authoring for 13 builtins | **AI-drafted from existing system prompts, user reviews** | MVP |
| Default retention for chat-generated images | **90 days with user override in Settings** | MVP |

Standard and Full tiers remain in this doc as forward-looking scope; they are NOT approved for execution. Re-confirm after MVP lands and beta-test signal arrives.
**Effort estimate:** MVP 2-3 days · Standard 4-6 days · Full 10-14 days (AI-assisted; ~12× human equivalent per project's time-tracking convention)
**Backlog rank:** #3 in `MEMORY.md` "NEXT SESSION TASKS" (after Memory Browser browser QA + raw-fetch unification)

---

## Context

Memory and competitor research consistently surface "Visual Content in Chat" — i.e., the character sends or shares pictures inside the conversation surface — as the #3 closeable competitor gap (after message swipe/regeneration, which we have, and memory transparency UI, which we have). Per `docs/research/2026-04-07-competitor-gap-analysis.md`, the strongest implementation is Candy AI's "crown jewel" in-chat selfie feature; weaker imitators (DreamGF, Kindroid) struggle with character consistency. The unique unmet angle for our app is **3D-context-aware visual content** — the picture matches what the character is wearing/doing in the live VRM viewer, and major bond-milestone visuals unlock as the relationship progresses. No competitor does either.

**Why now:** the underlying image generation infrastructure is already ~80% built (ComfyUI/EasyDiffusion adapters, REST endpoints, agent tool, storage). The frontend message model already has an `imageUrl` field that the agent's `generate_image` tool already populates via SSE. The remaining ~20% is mostly UX polish + new trigger pathways. Cost-per-feature ratio is high right now.

**Intended outcome:** within ~2-3 days of work, the user can ask "send me a picture" and receive a contextually appropriate image inline in the chat bubble that they can tap to enlarge, save, or share. Within ~5-6 days total, the character can also initiate sends proactively (mood-based, idle-based, milestone-based) with bond-aware variety.

## What we already have (do NOT rebuild)

### Backend — substantially complete

| Component | Path | Status |
|---|---|---|
| Image-gen adapter registry | `backend/image_gen/registry.py:57-106` | ✅ ComfyUI + EasyDiffusion + disabled fallback |
| ComfyUI REST adapter | `backend/image_gen/adapters/comfyui.py` | ✅ stdlib urllib only, no external deps |
| Agent tool wiring | `backend/agent/tools/image_gen.py:79-97` | ✅ `generate_image` tool registered, runs in threadpool |
| Status endpoint | `backend/server.py:14105` | ✅ `GET /api/image-gen/status` |
| Background gen | `backend/server.py:14134` | ✅ `POST /api/image-gen/background` |
| Portrait gen | `backend/server.py:14203` | ✅ `POST /api/image-gen/portrait` |
| Expression batch | `backend/server.py:14273` | ✅ `POST /api/image-gen/expressions/{char_id}` |
| Storage dir | `backend/storage/images/` | ✅ resolved at `image_gen/registry.py:29` |
| Static serving | `backend/server.py` `app.mount("/files", ...)` | ✅ URLs land at `/files/images/{filename}` |
| DB schema for portraits | `backend/preflight.py:726` (v12) | ✅ `expr_portraits` JSON column on characters |
| Intimate gallery table | `backend/preflight.py:4186` (v19) | ✅ for NSFW image collection |

### Frontend — substantially complete

| Component | Path | Status |
|---|---|---|
| Message model | `frontends/sakura/src/lib/types.ts:196` | ✅ `imageUrl?: string` field on `ChatMessage` |
| Inline image render | `frontends/sakura/src/components/DialogueBubble.tsx:695-709` | ✅ `<img>` post-text, `maxHeight: 360px`, `objectFit: contain` |
| SSE → message patch | `frontends/sakura/src/stores/chatStore.ts` | ✅ `tool_call_response` w/ `display: 'image'` → `patchAssistant({ imageUrl })` |
| Setup wizard | `frontends/sakura/src/components/wizards/ImageGenSetupWizard.tsx` | ✅ provider/endpoint/model config |
| Settings UI | `frontends/sakura/src/views/SettingsView.tsx` | ✅ image-gen tab |
| Portrait URL pattern | `DialogueBubble.tsx:51-82` | ✅ `/files/images/{name}_expr_{emotion}.png` |
| Gallery lightbox | `frontends/sakura/src/components/GalleryOverlay.tsx:1-477` | ✅ but NOT extracted — chat reuses none of it |

### Gaps (the actual work)

| Gap | Severity | Notes |
|---|---|---|
| **No lightbox for chat images** | High | Tap inline image → no fullscreen view. GalleryOverlay has the modal pattern but it's not reusable. |
| **No proactive image-send trigger** | High (differentiator) | Backend `proactive/triggers.py` fires text-only milestones. No `image_send` trigger type. |
| **No per-character art-style metadata** | Medium | Each character generates with generic prompt. No style hints (anime/realistic/chibi/palette). Causes character drift across images. |
| **No bond-milestone visual unlocks** | Medium (differentiator) | Bond level-up celebration shows memorial scenes (text/3D) but no special-pose / special-outfit picture. |
| **No 3D-context-aware generation** | Medium-High (moat) | VRM viewer state (current outfit, current pose, current expression) is not piped into image-gen prompts or ControlNet. |
| **No download utility for chat images** | Low | Inline image has no save button. Blob-anchor pattern duplicated elsewhere — extract to `lib/downloadFile.ts`. |
| **Mobile sizing not tested** | Low | 360px hard cap may stack awkwardly on portrait phones < 600px. Per project: desktop-only, low priority. |
| **No "regenerate this picture" affordance** | Low | If image is bad, user can only ask again in plain text. Could add a regenerate button on the image. |

## Strategic differentiation (vs competitors)

Per `docs/research/2026-04-07-competitor-gap-analysis.md`:

- **Candy AI** (gold standard): user-request selfies, V2 engine for consistency, no proactive sends, no 3D context.
- **Kindroid**: "Tableau engine" + voice-call integrated photos. No 3D.
- **DreamGF**: Appearance sliders, character consistency "struggles."
- **Character.AI**: text-only — massive open lane.

**Our differentiating angles** (none replicated by any competitor):

1. **VRM outfit sync**: image generation prompt includes the current 3D viewer outfit. "Picture of {char} in {current_outfit_in_viewer}" → consistency between live 3D and shared image.
2. **Bond-tied unlocks**: a "level 50 anniversary selfie" persona variant only available after the bond milestone fires. Memorial-scene grade visuals.
3. **Mood/scene context**: `mood/engine.py` already tracks time-of-day + 7-day-gap returning state — image prompts can reflect that ("morning coffee selfie", "missed-you reunion picture").
4. **ControlNet pose-guided** (Full tier only): current VRM pose → ControlNet OpenPose preprocessor → guided generation. Visually proves "she's actually doing what she said in the 3D scene."

These align with the project's "warmth over efficiency, intimacy over scale" soul-of-the-app principle.

## Scope tiers

### MVP — User-request selfies, polished (2-3 days)

**Goal:** when the user asks for a picture, generation is fast, framed nicely, tappable, savable, and the character looks roughly like themselves across multiple requests.

Deliverables:
- **Lightbox component** — extract Framer Motion modal from GalleryOverlay into `frontends/sakura/src/components/ImageLightbox.tsx`. Tap inline chat image → fullscreen 90vw/90vh, close on outside click, Esc to dismiss. Save + share buttons. Reuse for chat AND gallery.
- **Per-character style metadata** — add `image_style: { positive_prompt: string, negative_prompt: string, lora?: string, palette?: string[] }` JSON column to `characters` table (preflight.py v71 migration). Surface in character settings UI under a new "Visual Style" subsection. Populate defaults for the 13 builtin characters.
- **Style injection at generation time** — modify `backend/image_gen/registry.py:get_image_gen` callsites to load the active character's `image_style` and prepend to user's prompt before adapter call.
- **Download utility** — `frontends/sakura/src/lib/downloadFile.ts` (blob-anchor extracted from ChatThread). Wire into lightbox save button.
- **Regenerate affordance** — small "🔄 try again" button on image hover; calls `generate_image` tool with same prompt.
- **Stuck-generation handling** — if generation > 30s, show "still cooking..." indicator; > 60s, fail with retry option. Backend already has timeout in adapters; surface it.

Files to create/modify:
- `frontends/sakura/src/components/ImageLightbox.tsx` (new)
- `frontends/sakura/src/lib/downloadFile.ts` (new)
- `frontends/sakura/src/components/DialogueBubble.tsx` (wrap `<img>` in click handler → opens lightbox)
- `frontends/sakura/src/components/GalleryOverlay.tsx` (refactor to use shared `<ImageLightbox>`)
- `backend/preflight.py` (v71 migration: add `image_style` JSON column)
- `backend/image_gen/registry.py` (resolve character style at generation time)
- `backend/server.py` (modify `/api/image-gen/portrait` + agent `generate_image` tool to load char style)
- `backend/characters/builtin/*.json` or wherever char defaults live (populate `image_style` for 13 builtins)
- `frontends/sakura/src/views/SettingsView.tsx` (Visual Style subsection in character settings)

Verification:
- Manually: ask 3 different characters for "send me a picture of yourself" → 3 visually distinguishable styles. Tap each → lightbox. Save → file lands in Downloads.
- Backend test: pytest case that verifies character style metadata is included in the generation prompt sent to the adapter.
- Schema: `pytest backend/tests/test_preflight.py` confirms v70 → v71 migration.

### Standard — Proactive sends (4-6 days, builds on MVP)

**Goal:** the character occasionally sends a picture without being asked — when it makes sense, never spammily.

Deliverables on top of MVP:
- **New trigger type: `image_send`** — added to `backend/proactive/triggers.py`. Fires on:
  - Idle return ("haven't talked in 3 days" → "hi, here's a selfie I took"), gated by mood-engine 7-day detector.
  - Bond milestone (level 25/50/75/100) — see Bond integration below.
  - Mood transitions (morning wake, night sleep) — opt-in, user can disable per-character.
  - User-initiated proactive (rare): if user message says "what are you doing right now" → ~30% chance of picture reply.
- **Image-send budget** — `daily_image_send_limit` per character (default 3) to prevent feeling like a chatbot dispenser. Configurable in Settings.
- **Bond integration** — at level 25/50/75/100, unlock special "milestone visuals" with art prompts written into bond-milestone records. Reuses existing `BondPanel` / memorial-scene UI for first-time reveal; subsequent appearances are normal chat images.
- **Notification badge for missed image** — if the user wasn't looking, the unread chip on the character in the sidebar shows a small `📸` icon to signal "new picture from her."
- **User can disable proactive sends** — global toggle in Settings → Privacy + per-character override.

Files to create/modify (in addition to MVP):
- `backend/proactive/triggers.py` (add `image_send` trigger evaluation)
- `backend/proactive/generator.py` (add `generate_image_send` paired with text caption)
- `backend/preflight.py` (v72 migration: add `daily_image_send_count`, `last_image_send_at`, `image_send_enabled` columns to characters)
- `backend/server.py` (settings endpoint accepts the new fields)
- `backend/characters/bond_milestones.py` or wherever bond config lives (add `image_prompt` field)
- `frontends/sakura/src/views/SettingsView.tsx` (proactive image toggle)
- `frontends/sakura/src/components/Sidebar.tsx` (camera-icon badge for unread image)

Verification:
- Backend: pytest case that simulates 7-day gap → confirms `image_send` trigger fires on first message back.
- Backend: pytest case that confirms `daily_image_send_limit` is respected.
- Manually: bond level-up at 25 fires a special image with a milestone caption, displayed once with celebration UI.
- Privacy: toggle off → backend never produces image-send proactive triggers (assert via integration test).

### Full — 3D-context-aware (10-14 days, builds on Standard)

**Goal:** the picture genuinely shows what the character is currently doing in the 3D viewer — same outfit, similar pose, same scene mood. The visual moat no competitor can replicate.

Deliverables on top of Standard:
- **VRM state piping** — frontend captures current VRM state (active outfit ID, current emotion, current animation/pose name, current background) via `viewerStore.ts` and sends it to `/api/image-gen/portrait` in the request body.
- **Outfit prompt mapping** — `backend/visuals/outfit_prompts.json` maps each VRM outfit asset to a prompt fragment ("school uniform, navy skirt, white shirt"). Backend resolves at generation time.
- **ControlNet integration** — for ComfyUI: add an OpenPose preprocessor + ControlNet apply node to the workflow. Frontend captures a low-res VRM screenshot via `viewer.html` postMessage → backend uses it as ControlNet image input. Workflow JSON in `backend/config/comfyui_pose_workflow.json`.
- **Scene/background sync** — current 3D background → backdrop prompt fragment. "She's in front of {current_background}".
- **Performance budget** — first picture under 10s on RTX 3070, under 5s on RTX 5080. If user is on Mac M2 Pro (no NVIDIA), fall back to non-ControlNet path with a warning.
- **Beta-test integration** (cross-link with `2026-05-05-ai-beta-test-mvp.md`) — Phase 2+ of beta-test should exercise the proactive image triggers under simulated returning-user time-travel; confirms 7-day-gap → image-send fires.

Files to create/modify (in addition to Standard):
- `backend/visuals/outfit_prompts.json` (new)
- `backend/visuals/scene_prompts.json` (new)
- `backend/config/comfyui_pose_workflow.json` (new)
- `backend/image_gen/adapters/comfyui.py` (extend to support pose ControlNet workflow)
- `backend/server.py` (extend portrait endpoint with `vrm_state` request field)
- `frontends/sakura/src/stores/viewerStore.ts` (export `getCurrentVrmState()` snapshot helper)
- `frontends/shared/viewer/viewer.html` (postMessage handler for `request_pose_screenshot`)
- `frontends/sakura/src/lib/api.ts` (extend `generateImage` request type)

Verification:
- Manual: change VRM outfit in viewer → ask for picture → image shows the new outfit.
- Manual: trigger ControlNet path → picture pose roughly matches VRM pose at request time.
- Performance: capture RTX-3070 latency over 10 sequential requests; assert p95 < 12s.
- Hardware fallback: run on Mac M2 Pro → assert non-ControlNet path activates and warning appears.

## Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Character drift across images (same char looks different each time) | High | Per-character LoRA is the gold-standard fix but expensive (4-6h training per char); MVP uses per-char `image_style` prompts as cheap-and-good-enough first pass; revisit LoRAs in Phase C of AIE roadmap. |
| ComfyUI not running on user's machine | Medium | Status endpoint already returns `available: false`; surface this in chat UI ("image gen offline — start ComfyUI to enable"). MVP must NOT crash if image gen unavailable. |
| Generation latency breaks conversational flow | Medium | Stream a "she's taking a picture..." typing indicator immediately when generation starts; fall back gracefully if > 30s. |
| Proactive sends feel spammy | Medium | Hard cap at 3/day per character + opt-in toggle for non-essential triggers + soft cap (no two image sends within 4 hours). |
| NSFW filter conflicts with content tier | Medium | Existing `intimate_gallery` table (v19) provides separate channel; gate NSFW image-send triggers on user's content-tier setting. |
| 3D-context piping leaks VRM screenshot to disk | Low | ControlNet input image written to a tempfile that's deleted post-generation; never under `/files/`. |
| Storage bloat from generated images | Low | Add a Settings option for "auto-delete chat images older than N days"; defaults to 90 days. Manual gallery export available before deletion. |
| Bond-milestone visuals fail to generate at celebration moment | Medium | Pre-generate milestone images on bond level-up (background job), cache the result; celebration UI displays from cache. If pre-gen failed, fall back to text-only memorial scene. |
| Time-travel beta-test (per sister plan) generates real images, fills disk | Low | Beta-test runs default to MVP scope (no proactive sends); if Standard tier image triggers fire under time-travel, snapshot-restore mechanism in beta-test Phase 2 cleans them. |

## Resolved questions

1. ✅ **Tier** — MVP only (~2-3 days). Validate before Standard/Full.
2. ✅ **`image_style` authoring** — AI-drafted from each character's existing system prompt; user reviews + tweaks before committing.
3. ✅ **NSFW proactive policy** — same policy as SFW. Dormant in MVP; activates with Standard tier.
4. ✅ **Storage retention** — 90 days default, user-overridable in Settings.
5. **Open** — Full tier (3D-context / ControlNet) commitment. Deferred to post-MVP review.

## Recommended path

1. **MVP scope is approved.** Begin Phase 0 (preflight v71 + style metadata column) once the AI beta-test MVP (`2026-05-05-ai-beta-test-mvp.md`) lands — that gives us a way to *measure* whether visual content actually moves engagement signals, before committing to Standard.
2. AI-draft the 13 builtin `image_style` blocks during MVP build; queue them for user review as a single batch (one PR, one review pass).
3. After 1-2 beta-test runs against MVP image content, decide on Standard tier.
4. Full tier evaluated separately as a ControlNet-ambitious sprint, likely after AIE Phase C.

## Research & documentation references

- `docs/research/2026-04-07-competitor-gap-analysis.md` (lines 48, 52, 137-157, 175-188, 397, 415, 486-492, 536-538) — competitor breakdown, scope sprint estimates
- `docs/design/competitive-research-2026-03-18.md` — original 34-source deep dive, broader market context
- `docs/research/2026-03-25-emotional-connection-features.md` (Wave 3: Rich Content) — emotional impact framing for visual content features
- `docs/plans/2026-05-05-ai-beta-test-mvp.md` — sister plan; this scoping doc references its time-travel mechanism for testing proactive triggers
- `MEMORY.md` (NEXT SESSION TASKS line 3) — backlog rank
- `MEMORY.md` (Bond Progression Phases 5-6 complete) — bond milestone hooks for Standard tier
- `backend/image_gen/registry.py:29` — image storage chokepoint
- `frontends/sakura/src/lib/types.ts:196` — `imageUrl` field already in message model
- `docs/conventions/backend-and-api.md` + `docs/conventions/frontend-and-ui.md` — patterns to follow

## Notes

- This document is a *scoping draft* — implementation has not started. After user approval of a tier, convert to numbered phase plan + dispatch via `/go`.
- Cross-reference with `2026-05-05-ai-beta-test-mvp.md` so the beta-test system is aware of new image-send code paths (Phase 2 of beta-test could simulate user-asks-for-picture flow as part of Sam/Morgan personas).
- No schema changes in MVP touch existing tables non-additively. Migrations v71 (MVP) and v72 (Standard) follow the project's append-only migration rule.
