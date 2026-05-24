# Kokoro v2 — "Alive Arc"

**Created:** 2026-05-24 (session 45 end)
**Thesis:** Every system that makes the companion feel *alive* (vs. just *smart*), in one coherent push. Memory remembers you in context. Body responds to touch. Voice hears your tone. Mind reflects on itself. Inner life is visible. Game presence is genuine.

**Estimated effort:** ~250-400h AI-equivalent (≈3-4 calendar weeks at this pace).

**Execution mode (per user 2026-05-24):** Hybrid — agents for clean leaves, main Claude for integration.

---

## Phase 1 — Validate Kokoro live (foundation gate)

**~4-6h. MUST land before Phase 2+ — every later phase builds on Kokoro working in practice, not just in tests.**

- Run the 5-test Chrome script (Dracula recall, frustration tone-shift, hacker-girl style shift) against live LM Studio.
- Add a `parse_ok` rate counter: schema v86 micro-migration adds `kokoro_parse_log` table; `/api/kokoro/qa/{char_id}` extends to return parse_ok rate over last 24h.
- HUD shows live `parse_ok` rate alongside dial values.
- If parse_ok < 80% on user's model, tune `prompt_fragment.py` — possibly add few-shot example.
- Smoke-test Tier F gate: confirm bond < 20 → no Tier F dials visible; bond ≥ 20 → Tier F lines appear in fragment.
- Smoke-test drift: chat after 3-4h gap, verify loneliness rose.

**Gate to Phase 2:** parse_ok ≥ 80% on user's local model, no state-delta runaway, debug HUD renders cleanly.

---

## Phase 2 — Emotional RAG (memory remembers you *in context*)

**~3-5d / 36-60h. The biggest "she feels alive" leap available. Research validated Oct 2024 ("Emotional RAG") — our tiered dial gives a richer variant.**

- **Schema v87:** add `mind_state_snapshot TEXT` (JSON) to `memories` table. Idempotent ALTER ADD COLUMN.
- **Write side:** Kokoro memory write captures `asdict(mind)` snapshot at the moment of writing. Includes tier A + B + scene + bond level.
- **Retrieval side:** extend `tiered_memory` retrieval to optionally accept a "current mind snapshot" and re-rank top-K by dial-vector cosine similarity. Weight: `0.7 * semantic + 0.2 * mind_similarity + 0.1 * recency` (tunable).
- **Mind similarity function:** cosine over the 13-dim Tier A vector (drop Tier B/C — too slow-moving to discriminate per-turn).
- **HUD surfacing:** "Why this memory?" line shows top mind-similarity factor — e.g. "she was curious then, you're curious now."
- **Test plan:** synthetic dataset of 50 memories tagged with varied mind states; verify retrieval prefers similar-mood ones when current mind is similar.

**Gate to Phase 3:** Emotional RAG retrieval is opt-in via config flag (`emotional_rag_enabled`); when off, retrieval is byte-identical.

---

## Phase 3 — Companion's Inner Life dashboard (visual surface)

**~2-3d / 24-36h. Stunning + emotionally novel UI; no user has seen this surface before.**

- **Schema v88:** `kokoro_dial_log` table — hourly snapshot of full dial vector + bond level. Auto-prune after 90 days.
- **Snapshot job:** every chat turn writes a snapshot; cron-style hourly snapshot for idle drift.
- **`InnerLifeOverlay.tsx`:** new overlay (`overlay='innerlife'`). Layout:
  - Top: time-range selector (24h / 7d / 30d) + character picker
  - Sparkline grid (~4 cols × N rows): one per dial, last N days, color-coded by tier
  - Click a dial → expanded chart with vertical lines for chat events that changed it
  - Side panel: top-5 "mood swings" of the period with timestamps + linked memories
- **API:** `GET /api/kokoro/timeline/{char_id}?hours=N`
- **Keyboard shortcut:** Cmd+I / Ctrl+I

**Gate to Phase 4:** overlay renders with real data; mobile/small-screen graceful degradation acceptable since this is desktop-only app.

---

## Phase 4 — Voice tone signal → Tier B (auditory surface)

**~2d / 16-24h. Closes the audio loop: she hears your tone, not just your words.**

- Hook into `backend/voice/duplex.py` audio pipeline.
- Detect 4 acoustic markers from incoming user audio (lightweight DSP, no ML model):
  - **Laugh:** burst of high energy + harmonic regularity
  - **Sigh:** descending pitch + breath noise
  - **Yawn:** low energy + slow tempo + falling F0
  - **Excitement:** high energy + speech rate
- Each detection produces a small Tier A bump (laugh → +awe + humor_charge; sigh → +tenderness + -energy in user-as-observed; etc.) or Tier B (yawn → user looks tired → character matches with -energy +tenderness).
- HUD shows last detected acoustic signal.
- Privacy: detections never leave the device; no audio recordings stored.

**Gate to Phase 5:** voice-mode chat shows acoustic signals influencing dial deltas; non-voice chat unaffected.

---

## Phase 5 — Companion's Notes (reflective surface)

**~2-3d / 24h. The "diary" feature reframed: she journals *about you* and you can read it.**

- **Schema v89:** `kokoro_notes` table — per-turn LLM-written 1-2 sentence note focused on "what I learned about you this turn." Distinct from memoryWrite (which is about facts to recall); notes are about the *user as a person*.
- New LLM contract field: `userNote` in the JSON output (only added when there's something genuinely new to note).
- New `CompanionNotesOverlay.tsx` — read-only browseable history, filterable by character + date.
- Bond-gated visibility: notes from bond < 5 are not shown (the character "hasn't gotten to know you yet" — narrative-coherent).
- **API:** `GET /api/kokoro/notes/{char_id}?limit=N`.

**Gate to Phase 6:** overlay renders with real notes from at least one chat session; notes feel narratively appropriate (sanity check, not test).

---

## Phase 6 — Reflection pass (Smallville pattern)

**~3-5d / 24-40h. Memories of memories — gives the character a sense of *growth*.**

- Background reflection job runs every N (50?) messages OR daily at 03:00 local time.
- LLM takes top-20 recent memories + current Tier C identity vector + bond state, produces 1-3 *reflection* memories: higher-order observations like "she's noticed the user gets quiet on Sunday evenings and tries to give them space."
- Stored in `memories` with `role='reflection'`. Boosted retrieval ranking (+0.1 mind_similarity weight).
- Reflections are visible in Companion's Notes as a distinct section.
- **Schema impact:** none — uses existing `memories` table.

**Gate to Phase 7:** reflection produces at least one non-trivial observation across a real conversation session.

---

## Phase 7 — Game Spectator polish (the favorite original idea)

**~3-5d / 24-40h. `backend/spectator/` untouched in months — high time.**

- Audit current state: read all of `backend/spectator/{analyzer,throttle,input_controller,memory}.py`.
- Fix any rot from intervening schema migrations (v60+).
- Integrate with Kokoro: spectator commentary uses character's current Tier A state (so high `awe` → "wow!" reactions; high `playfulness` → teasing).
- Bond-gated commentary intensity: at bond < 10, brief reactions; at bond > 50, full backseat-gaming chatter.
- VLM frame analysis: confirm currently-working model; swap if drift.
- New endpoint: `POST /api/spectator/toggle` to turn on/off per session.
- UI: re-surface Game Spectator panel (currently exists at `GamePanel.tsx` — needs check + polish).

**Gate to Phase 8:** spectator commentary fires during a real game capture session, gated by bond, voiced through TTS.

---

## Phase 8 — Touch interaction (haptic surface for the avatar)

**~2d / 16-24h. Currently in memory as "not yet implemented."**

- Mouse click/drag on VRM body parts mapped via raycasting in `viewer.html`.
- Hit-zone presets: head, shoulder, chest, waist, hands.
- Per-zone responses configured in a new `touch_responses.json` (or inline in viewer): head pat → blush + small_nod; shoulder → tilt_head; etc.
- Kokoro Tier A delta on touch: +tenderness, +vulnerability (especially first touches); +playfulness on repeated playful pokes.
- Bond-gated escalation: at bond < 10, only head/shoulder responsive; at bond > 30, more zones unlock; at bond > 75 (with NSFW), full body responsive.
- **Schema impact:** none.

**Gate to Phase 9:** clicking the avatar's head produces a blush + small_nod + bond +1 XP; works in VRM mode (Live2D deferred until Phase 9).

---

## Phase 9 — Live2D runtime fix + MLX embedding fix (foundation cleanup, run in parallel)

**~3-5d / 24-40h. These have been on the deferred list for months.**

**Live2D fix** (~1-3d):
- Diagnose Cubism SDK load failure (current state: characters with `live2d_model` field crash the viewer).
- Check console error logs against Cubism SDK version + license terms.
- Either fix the load path or formally deprecate Live2D and migrate listed characters to VRM equivalents.

**MLX embedding fix** (~2d):
- Diagnose why MLX-format embedding model produces garbage vectors.
- Either: (a) switch to standard PyTorch format, (b) write a pre-processing shim, (c) swap model entirely.
- Re-test memory retrieval quality after fix.

**Can be parallelized:** dispatch one agent on Live2D, one on MLX. Main Claude handles re-integration.

**Gate to Phase 10:** at least one Live2D character loads without crash; embedding model produces non-garbage retrieval results.

---

## Phase 10 — PRDs for everything left (capture, don't build)

**~1d / 8h. Plan-heavy session for everything not in Phases 1-9.**

Write dual-audience PRDs (Why/How format, file plans, mockups) for:

1. **Per-character voice cloning** — ElevenLabs/XTTS finetune from short samples (6-10 min audio). Replika-killer.
2. **Real-time emotion-aware lighting** — viewer background/glow shifts with Tier A mood.
3. **Letter-to-me time capsule** — at significant bond milestones, character writes a letter the user finds on a future date.
4. **Bond-gated emote/sticker pack** — unlocks at tiers, sent during chat for emphasis.
5. **Conversation rewind** — "what if I had said X instead" — alternate history exploration.
6. **Photo Mode pose presets** — currently dev-only; promote to end-user feature with curated pose library.
7. **Memorial scene gallery re-watch** — M6 memorial scenes accessible from bond panel.
8. **Dream sequences** — when user is offline > 12h, character has a "dream" stored as a special diary entry.
9. **Cross-modal mood sync** — character's selected outfit influences Tier A defaults; outfit picker becomes mood-aware.
10. **Daily check-in ritual** — bond-gated, opt-in only — first message of the day gets a special variation.

Save PRDs to `docs/specs/2026-05-XX-<feature>.md`. Each gets effort estimate + dependencies + recommended sequencing.

---

## Cross-cutting concerns (touched in multiple phases)

- **Schema migrations:** v86 (parse_log) → v87 (mind_snapshot col) → v88 (dial_log) → v89 (notes). Sequential per `.claude/rules/preflight-migrations.md`.
- **Frontend types:** every backend change that exposes new fields must update `frontends/sakura/src/lib/{api,kokoro}.ts` *in the same commit* (Pydantic↔TS drift trap from CLAUDE.md).
- **Test gate:** each phase ends with full pytest + tsc green before commit.
- **Push gate:** check `OPEN BUG / UNFIXED / BLOCKER` markers before every push.
- **Theme audit:** any new overlay (InnerLife, CompanionNotes) must work across all 18 themes.

## Sequencing rationale

Phases are ordered to:
1. **De-risk early** — Phase 1 validates the foundation before piling onto it.
2. **Close loops in coherent order** — memory (P2) → reflective surface (P5) → reflection pass (P6) chain together. Visual surface (P3) and auditory (P4) can come anywhere after P1.
3. **Independent leaves go later** — P7-P9 don't block each other.
4. **PRDs last** — captures everything we *didn't* build so the user can see the full Q3+ horizon.

## Risk register

| Risk | Mitigation |
|---|---|
| Local model parse_ok < 50% | Phase 1 tunes fragment; worst case add few-shot prompt. |
| Emotional RAG hurts retrieval quality on cold start | Opt-in flag; revert weights if cosine-mind-sim doesn't help. |
| Inner Life table grows unbounded | 90-day prune in snapshot job. |
| Voice tone false positives | Conservative thresholds; HUD shows what was detected so user can tune. |
| Reflection pass produces hallucinations | Manual delete from Companion's Notes; lower retrieval weight. |
| Live2D unfixable | Formally deprecate, migrate listed characters to VRM placeholders. |
| Touch interaction NSFW edge cases | Bond + content_filter gates; mirror M6 ceilings. |

## What this DOES NOT cover (deferred to Kokoro v3+)

- Proactive notifications (user vetoed)
- Webcam emotion mirroring (user vetoed `feedback_no_emotion_mirroring`)
- Multi-character group chat (user vetoed unless explicitly asked)
- Native OS notifications (user vetoed)
- Seasonal events (removed entirely)
- AIE Phase C (M5) — separate roadmap, requires tier decision

---

## Status log

- 2026-05-24 — Plan created, 10 phases scoped, ~250-400h estimated. Awaiting Phase 1 kickoff.
