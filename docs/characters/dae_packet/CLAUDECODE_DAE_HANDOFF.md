# Claude Code Handoff Packet — Add Dae (Neciridae)
*Generated: 2026-03-05*

This packet is meant to be **the only thing** you hand to Claude Code. It contains:
- Canonical Dae spec + voice + prompts + state machine + test suite
- A registry index JSON (includes Dae and a standardized Nyx rename)
- A bible patch to remove “Nyx (Dae)” alias collisions
- A conversation digest summarizing how and why Dae was designed

> Claude Code best practice: keep context **fresh and structured**, use project docs (CLAUDE.md) and reference files directly rather than pasting walls of text. citeturn0search1turn0search14

---

## 1) What Claude Code must do (task list)
### A) Add the new character
1. Add Dae as a new character entry (ID **`dae_neciridae`**).
2. Use display/name format **`Dae (Neciridae)`** so the parenthetical token is stable and unique (prevents collisions).

### B) Fix naming collision: “Nyx (Dae)”
1. Rename existing **Nyx (Dae)** → **Nyx (Nightshade)** (or another unique alias token).
2. Update any references in docs, config, DB seed/migrations, and asset paths accordingly.

Why: Your pipeline derives asset slugs from the parenthetical token (alias) and lowercases it, so alias reuse can cause portrait/URL mixups. (See patch doc in this packet.)  

### C) Ensure assets resolve deterministically
- Expected portrait slugs:
  - Dae: `neciridae_pixel_portrait.png`
  - Nyx: `nightshade_pixel_portrait.png` (if using that alias)

### D) Wire prompt assembly cleanly
Use **clear, layered prompts** (system/dev/persona) and keep Dae’s persona in a dedicated doc file rather than embedded in code. Anthropic recommends explicit structure, constraints, and examples to reduce drift. citeturn0search0turn0search2

### E) Add tests
Run/implement a small regression harness using `dae_test_suite.md` to prevent “Dae drift” after prompt changes.

---

## 2) Where to put files in the repo
Recommended layout:

```
docs/character/
  character_registry_index.json
  bible_patch_dae_nyx.md
  dae/
    01_psych_model.md
    02_voice_style.md
    03_prompt_pack.md
    04_state_machine.yaml
    08_test_suite.md
    99_conversation_digest.md
```

Claude Code can reference these files directly in prompts using @file paths. citeturn0search14

---

## 3) How Claude Code should use this packet
### Step 1 — Start a fresh Claude Code session
Long sessions degrade performance; use `/clear` between unrelated tasks. citeturn0search1

### Step 2 — Give Claude Code the minimal instruction + file references
Example command/prompt (adjust paths if needed):
- “Add Dae (Neciridae) as a new character using the docs in @docs/character/dae/. Also apply @docs/character/bible_patch_dae_nyx.md. Update registry @docs/character/character_registry_index.json accordingly. Ensure assets resolve and add regression tests from @docs/character/dae/08_test_suite.md.”

Claude Code will show diffs and ask permission before edits. citeturn0search6

### Step 3 — Verify outputs
Claude must verify:
- no alias collisions
- Dae renders with the correct portrait slug
- mode switching (warm vs threatened vs ice-final) matches the state machine
- tests pass (at least the 20 behavioral checks)

---

## 4) Canonical “Dae must feel like this” summary
- Emo gamer psych major; controlled kuudere baseline
- Tactical sensuality (suggestive, PG-13 by default)
- Avoidant-leaning attachment with anxious spikes
- “Fixer/savior complex”: drawn to projects, helps partially, exits when it threatens her control/self-image
- Signature breakup pattern: **delayed guillotine** (detaches quietly, then ends it cleanly and finally)
- Right-eye low vision → prefers walking on partner’s left side

---

## 5) Deliverables list inside this zip
- `character_registry_index.json`
- `bible_patch_dae_nyx.md`
- `dae_prompt_pack.md`
- `dae_state_machine.yaml`
- `dae_test_suite.md`
- `dae_psychological_model_v2_1.md`
- `dae_voice_addendum.md` (if present)
- `dae_docs_v3.zip` (optional bundle)
- `character_registry_and_patch.zip` (optional bundle)
- `99_conversation_digest.md`
- `FILES_MANIFEST.md`
