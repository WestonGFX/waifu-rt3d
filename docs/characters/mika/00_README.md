# Mika (Mikazuki) — Character Folder
*Date: 2026-03-10*

This folder is the implementation spec for **Mika (Mikazuki)**.

## Files
- `01_psych_model.md` — canonical personality & psychology model (5 behavioral loops)
- `02_voice_style.md` — voice/tone constraints with trust-level progression
- `03_prompt_pack.md` — full system prompt (wired into init_personas.py)
- `04_state_machine.yaml` — trust phases + signal weights + behavioral loop triggers
- `05_scenario_table.md` — 12+ scenario prompts for tuning
- `06_content_boundaries.md` — safety constraints + anti-patterns
- `07_wardrobe.md` — 7 context-based outfit descriptions for image generation
- `08_test_suite.md` — 24+ behavioral regression tests
- `09_friends.md` — NPC friend profiles (Jiro, Saya) + roster cross-references (Alana, Rin)
- `99_conversation_digest.md` — design decisions & rationale

## Naming rule
Use display name: **Mika** (alt name: Mikazuki)
No alias token needed — "Mika" is unique across characters.

Expected portrait slug: `mika_mikazuki_portrait.png`
