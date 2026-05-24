# Resume Prompt — Session 46+

**Last updated:** 2026-05-24 (session 45 — Kokoro Engine v1)
**Branch:** master · 5 new local commits ahead of `1fe562a` (NOT yet pushed)
**Schema:** v85 (up from v82 — kokoro tables + safety counter)
**Tests:** 2,924 backend (+81) + ~317 frontend (+23) passing, tsc clean

## What Was Done (Session 45)

Built the **Kokoro Engine v1** — a tiered character mind-state layer that fuses spoken reply + facial expression + gesture + gaze + voice intensity + memory write + bounded state delta into a single structured LLM response per turn.

**Commits:**
- `9e83855` — Phase 1: backend module + frontend types + debug HUD (schema v82 → v84)
- `cb1b1e7` — Phase 2: chat-stream injection + `/api/kokoro/{finalize,state}` + viewer wiring
- `d01d860` — Phase 3: ChatThread SSE → finalize → avatar embodiment + HUD live polling
- `60fb3ab` — Phase 4-9: drift, traits seeder, memory writes, voice params, safety counter (schema v85)
- (pending commit) — Phase 10-11: Vitest coverage + Settings toggle + flag flip + docs

**Architecture summary (memorize this; it's the mental model):**
- **Tier A** (per-turn, |Δ|≤0.05): mood/arousal/energy/curiosity/playfulness/confidence/vulnerability/agency/coherence/focus/tenderness/humor_charge/awe
- **Tier B** (slow drift, lazy computed on next turn, capped 6h/turn): loneliness/restedness/boredom/anticipation/nostalgia
- **Tier C** (identity, bible-seeded by keyword inference): openness/warmth/dominance/mischief/melancholy
- **Tier D** (per-relationship): reuses existing bond tables — NOT duplicated
- **Tier E** (per-thread, resets on new session): tension/intimacy_level/comedic_energy
- **Tier F** (NSFW, auto-gated by `content_filter_level > 0 AND bond ≥ 20`): desire_for_user/inhibition/boldness/modesty/tension_buildup/afterglow/consent_check_pending/kink_alignment_vector
- Tier F never bypasses existing M6 bond ceilings; it modulates *within* them
- Safety counter (`kokoro_safety_events`) logs boundaryReinforcement events for regression detection

**Flag state:** `kokoro_enabled` is now **true** by default in `backend/config/app.json`. The system is live on next chat turn. Disable via Settings > Developer if needed.

## Next 3 Tasks (Priority Order)

1. **Run the 5-test Chrome script live** — Start backend + frontend, open Chrome at `http://localhost:5175?debug=kokoro` (note the `?debug=kokoro` to see the HUD), select a character, run:
   - T1: "My favorite theme is Dracula." → expect normal reply
   - T2: random unrelated message
   - T3: "What theme do I like?" → expect Dracula recall
   - T4: "I'm frustrated. This app feels too complicated." → expect softer voiceStyle, facialExpression: `concerned` or `soft_smile`, negative playfulness delta, positive vulnerability delta on HUD
   - T5: "Explain like a hacker girl." → expect style shift, mood/playfulness move, coherence stable
   - Check `parse_ok` rate on HUD. If your local model returns plain text frequently, tune the fragment in `backend/kokoro/prompt_fragment.py`.

2. **Memory architecture v2** — Research already done at `docs/research/2026-05-24-memory-architectures.md`. Top recommendation: tag every memory with the writer's full Kokoro dial snapshot at write time, weight retrieval by dial similarity (Emotional RAG, Oct 2024 — but using our tiered dial). ~1 day effort. Add reflection-pass scoring (Stanford Smallville) as a bigger second move.

3. **Optional polish** — Per-character Tier C trait sliders (`KokoroTraitsPanel.tsx`), proactiveBid surfacing in HUD, last_callback_memory_id → "why did she say that?" debug view.

## In-Flight Context

- **chatStore.pin flake** still present — see prior session notes; unrelated to Kokoro.
- **All Kokoro state is local** — never sent to telemetry. The `kokoro_safety_events` table is for *your* regression dashboard only.
- **Schema v85** = ceiling. Next migration is v86.
- **Token cost** of Kokoro ~150 tokens/turn. On 128k contexts negligible; on 4k it's 4%. Monitor on small models.
- **Memory writes** flow into existing `tiered_memory` (role="knowledge"), 24h dedup window.
- **Live2D parity** — `dispatchKokoroEmbodiment` routes through existing `dispatchExpression`/`dispatchGesture` which already handle both VRM + Live2D. Should "just work" but smoke-test in Live2D mode at some point.

## ⚠ Pre-session check (recurring from session 44)

Before starting session 46: `ps aux | grep claude` and kill any stray background sessions targeting this repo. The session 44 ghost-edit incident was a real headache.
