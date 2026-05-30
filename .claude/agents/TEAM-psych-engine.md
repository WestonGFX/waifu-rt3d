# Agent Team — Persistent Psychology & Memory Engine

A domain-specialized team for the embodied-AI-girlfriend psychology/memory/embodiment
work (the engine mapped in `docs/research/2026-05-30-psychology-memory-engine-as-built.md`).
These carry deep Kokoro/memory/viewer knowledge that the generic agents
(`senior-dev`, `schema-architect`, `qa-hunter`) lack — dispatch the specialists for this
domain, fall back to generics elsewhere.

## The team

| Agent | Owns | Dispatch for |
|---|---|---|
| `kokoro-mind-engineer` | Kokoro tiers A–F, dials, drift, traits, response contract, prompt fragment | mood/personality/per-turn-embodiment changes |
| `memory-architect` | tiered memory, retrieval/rerank, decay, rituals, vocab, facts, forget/privacy, context assembly | what she remembers/recalls/forgets/keeps private |
| `embodiment-director` | viewerStore↔viewer.html contract, AnimationDirector, gaze/expression/listening cues, lipsync | making the avatar look/react/attend/perform |
| `companion-safety-reviewer` | consent gate, privacy routing, no-resurrection, no-parasocial, adult validation | **after** any Kokoro/memory/NSFW/proactive change (read-only) |
| `psych-qa-hunter` | pytest for every hard guarantee | locking forget/privacy/decay/ritual/clamp/parser behavior |

Supporting generics: `schema-architect` (shares migration work with the specialists),
`frontend-tester` (vitest), `ux-architect` (panels/overlays), `regression-guard`,
`advisor`/`prd-writer` (planning), `theme-auditor` (18-theme CSS), `perf-reviewer` (render loop).

## How they work together (the wave pattern)

This engine ships in **bundles**, each a clean PR. A typical bundle:

1. **Design** — `advisor`/`prd-writer` (or main Claude) maps the change onto the as-built
   doc. **Verify a gap is real before building** — exploration over-claims; vocab injection,
   voice-state emission, etc. already existed. Don't build parallel systems.
2. **Schema** (if needed) — `kokoro-mind-engineer` or `memory-architect` (with
   `schema-architect`) writes one `migrate_to_vN`.
3. **Implement** — the relevant specialist owns the backend module + injection; a frontend
   owner handles stores/UI.
4. **Test** — `psych-qa-hunter` (backend) + `frontend-tester` (frontend).
5. **Review** — `companion-safety-reviewer` audits the safety/privacy lines.
6. **Gate + commit** — pytest + tsc green; atomic commit per bundle.

## Hard orchestration constraints (learned the hard way)

- **`backend/preflight.py` migrations are SERIAL & append-only.** Only ONE schema-bearing
  bundle edits it at a time (v87 → v88 → …). Never dispatch two migration agents in parallel.
- **`viewer.html` + `viewerStore.ts` are a coupled pair — SINGLE OWNER.** Never parallel-edit.
  `embodiment-director` is risk-last and owes manual visual QA (no headless avatar test).
- **`server.py` + `frontends/sakura/src/lib/api.ts` are shared integration points** — main
  Claude (or one owner) wires them; Pydantic↔TS mirrors land in the same change.
- **Parallelize only disjoint file trees.** e.g. a backend memory bundle ∥ a debug-panel
  bundle is safe; two bundles both touching `context_assembler.py` or `server.py` are not.
- **Test + tsc gate between every wave.** Compounding regressions are the #1 pain here.

## Reference
- As-built map + gaps: `docs/research/2026-05-30-psychology-memory-engine-as-built.md`
- Trust-spine + cues: `docs/2026-05-30-embodied-listening-cue.md`, schema v87 (rituals),
  v88 (forget/privacy).
