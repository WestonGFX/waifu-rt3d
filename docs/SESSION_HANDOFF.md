# Session Handoff — 2026-04-07 (session 11)

## Branch: master
## Test Status: 2571 passed, 0 failed | TSC: clean
## Schema: v68

## Completed This Session

### P0: AI Quick Reply Suggestions (commit f8b2551)
- Two-phase optimistic chip system: instant heuristic chips → async LLM upgrade
- `api.ts`: `generateQuickReplies()` wrapper using `/api/llm/generate` (120 max tokens)
- `ChatThread.tsx`: `generateChipsLLM()` helper with 6s timeout, JSON parse fallback, AbortController cleanup
- Modified chip useEffect for two-phase generation with `llmChipsAbortRef` + `llmChipsLoading` state
- `components.css`: `@keyframes pulse` for loading indicator
- 11 new vitest tests in `quickChips.llm.test.ts`
- No backend changes needed — reuses existing `/api/llm/generate` endpoint

### P1: CHARA Card V2 Compliance (commit 956a6a8)
- Schema v67 → v68: 7 new columns on `characters` table (scenario, chara_description, alternate_greetings, mes_example, post_history_instructions, chara_tags, creator_notes)
- `chara_card.py`: Reader preserves all V2 fields individually + legacy `background` join; Writer exports scenario/personality/alternate_greetings instead of empty strings
- `server.py`: Updated list_characters (indices 41-47), import/export/update endpoints, 3-tier SELECT fallback, defensive post_history_instructions queries
- `context_assembler.py`: `post_history_instructions` injection after chat history (SillyTavern standard position)
- `server.py`: Character-level scenario injection in `_build_prompt_sections()`
- `CardImportWizard.tsx`: JSON import extracts all V2 fields, handleCreate passes them to backend, review UI shows scenario + tags
- 15 new pytest tests in `test_chara_card_v2.py`

### P3: Competitor Gap Analysis (commit 4ee0688)
- 577-line research doc at `docs/research/2026-04-07-competitor-gap-analysis.md`
- 60+ features across 12 categories, 30+ platforms researched
- Top gaps: message swipe/regeneration, visual content in chat, memory transparency UI
- Confirmed our strong position: local-first + 3D viewer + bond system is unique

### Bug Fix
- Fixed time-dependent test flake in `test_bond_phase1.py` (UTC vs local date mismatch)

## Work In Progress
- None — all work committed and pushed

## Known Issues / Bugs
- Pre-existing: `SettingsView.exportImport.test.tsx` (3 failures) — `api.getFormatRules` not mocked
- Pre-existing: `OnboardingWizard.test.tsx` (1 failure) — same mock issue
- Live2D runtime still broken (Cubism SDK fails to load)
- Embedding model issue (MLX format produces garbage)

## Files Modified
```
frontends/sakura/src/lib/api.ts                    — generateQuickReplies method
frontends/sakura/src/views/ChatThread.tsx           — two-phase chip system
frontends/sakura/src/styles/components.css          — pulse keyframe
frontends/sakura/src/test/quickChips.llm.test.ts    — 11 new tests
frontends/sakura/src/components/wizards/CardImportWizard.tsx — V2 field handling
backend/preflight.py                               — migrate_to_v68
backend/characters/chara_card.py                    — V2 reader/writer fixes
backend/server.py                                  — V2 endpoints + context injection
backend/llm/context_assembler.py                   — post_history_instructions
backend/tests/test_chara_card_v2.py                — 15 new tests
backend/tests/test_bond_phase1.py                  — UTC date fix
docs/research/2026-04-07-competitor-gap-analysis.md — 577-line research
```

## Next Session Priorities
1. **Message Swipe/Regeneration** — Highest-impact gap from competitor research. Feature E frontend wiring exists. ~4hrs estimated.
2. **P2: Per-Character Scenarios** — Content authoring (65 scenarios for 13 characters) + scenario picker UI
3. **Bond Phase 3: Dialogue Gates** — Bond-gated system prompt injection per tier. Spec: `docs/plans/2026-03-29-bond-progression-spec.md` Phase 3
4. **Memory Browser UI (P5)** — React component for viewing/editing character memories. Backend ready.
5. **Visual Content in Chat** — "Character sends you a picture" UX flow. Image gen pipeline exists.

## Context for Next Session
- Plan file: `.claude/plans/nested-crafting-ullman.md` — P0+P1 done, P2-P4 remain
- Competitor research: `docs/research/2026-04-07-competitor-gap-analysis.md` — read Section 5 (Roadmap) for sprint ordering
- Feature E (choices inside DialogueBubble) is fully wired but never activated — good foundation for message swipe
- The `list_characters` endpoint now has 48-column positional indexing (row[0]-row[47]) — be careful adding more columns
- 4 pre-existing frontend test failures (mock gap for `api.getFormatRules`) — not blocking
