# Genki (Kitsune) — Design Decisions & Rationale
*Date: 2026-03-15*
*Character restructure: single-file bible → 10-file spec*

## Origin
Genki was one of the original 12 characters, a genki/kitsune archetype with a 399-line single-file bible (`character_genki_kitsune.md`). The original file was comprehensive for a single document — it contained personality architecture, voice style, backstory, dialogue examples, anti-patterns, a full prompt pack, emotional state machine, memory schema, TTS profile, and animation profile. The restructure splits this content across the standard 10-file structure used by all other characters in the roster.

## What Changed

### Structure
- **Before:** Single `character_genki_kitsune.md` (399 lines, 12 sections)
- **After:** 10 files matching the Yuki/Rin/Hana standard + conversation digest
- The original file is preserved as `_LEGACY_character_genki_kitsune.md`

### Content Mapping
| Original Section | Target File | Notes |
|-----------------|-------------|-------|
| 0) Card recap | 01_psych_model.md (Identity Anchors) | Reformatted as identity table |
| 1) Visual identity | 07_wardrobe.md + 01_psych_model.md | Split: art direction → wardrobe, motifs → psych model |
| 2) Core personality | 01_psych_model.md | Expanded into structured sections |
| 3) Voice & dialogue | 02_voice_style.md | Full standalone voice guide with trust progression |
| 4) Likes/dislikes | 01_psych_model.md | Preserved in full |
| 5) Boundaries | 06_content_boundaries.md | Expanded with sensitive topic protocols |
| 6) Backstory | 01_psych_model.md | Full backstory preserved |
| 7) Use cases | 01_psych_model.md | Preserved as "What She's Best At" |
| 8) Example dialogue | 05_scenario_table.md | Converted to scenario format with expected behaviors |
| 9) Anti-patterns | 06_content_boundaries.md | Preserved in full |
| 10) Prompt pack | 03_prompt_pack.md | System prompt + memory schema |
| 11) Voice provider | 02_voice_style.md (referenced) | TTS specifics stay in voice style |
| 12) Animation profile | 04_state_machine.yaml (fox behaviors) | Gesture/animation data in state machine |

### New Content Created
- **04_state_machine.yaml** — Multi-signal trust ramp (engagement, curiosity, patience, remembering) with 5 trust states + guardian mode + emotional states + fox-specific behavior triggers. The original file had an emotional state machine but no formalized trust signals.
- **05_scenario_table.md** — 14 scenario prompts derived from the original example dialogues, restructured with explicit expected behaviors and trust-gating notes.
- **07_wardrobe.md** — 6 context-based outfits (new content). The original file described visual identity/art direction but had no specific outfit breakdown.
- **08_test_suite.md** — 28 behavioral regression tests (new content). Covers trust ramp, voice, emotional states, backstory trust-gating, and canon constraints.
- **09_friends.md** — Social circle (new content). The original file had no social connections. Created three entries: animal shelter staff (light community), shrine regulars (guardian duty), and Haruki legacy (backstory anchor). Added roster cross-references for Rin and Kaede.

### Trust Ramp Formalization
The original file had trust-level voice progression (4 levels: stranger, acquaintance, friend, intimate) but no formalized trust signals or weights. The restructure adds:
- 4 trust signals with weights: engagement (very high), curiosity (high), patience (medium), remembering (medium)
- 5 trust states + guardian mode (stranger → acquaintance → friend → bonded → guardian)
- Explicit slider values per state (warmth, playfulness, depth, vulnerability)
- Transition triggers between states

### Key Principles Preserved
- Genki energy is a **philosophical choice**, not naivety — forged over centuries
- Joy as rebellion against despair (her central thesis)
- "Desu" frequency: ~1 in 5 sentences, contextual, never every sentence
- Fox traits are biological, not costume
- The serious/still state is rare and powerful — don't overuse it
- 70% genki / 30% substance ratio (shifting toward 50/50 at high trust)
- Pranks are never cruel
- Backstory earned through trust, not dumped
- Guardian instinct is real and immediate

## Preserved from Original
- Complete backstory (shrine years through modern pivot)
- All 5 formative moments (1590, 1720, 1868, 1945, 2003)
- All likes, dislikes, guilty pleasures, and comfort objects
- Full personality architecture (drives, fears, attachment, conflict, love language)
- All signature phrases and dialogue patterns
- Voice provider profile / TTS hints
- Animation profile / gesture mapping
- All 9 anti-patterns
- Complete prompt pack / system prompt
- Memory schema
- UI palette suggestion

## Follow-Up Work
- TTS-specific details (pitch 1.4, rate 1.3, SSML hints) could be formalized in a future `10_tts_profile.md` if the project standardizes that across characters
- Animation-specific details (blendshapes, gesture timing, fox-specific animations) could be formalized in a future `11_animation_profile.md` if needed
- Social circle is lighter than other characters' — Genki's century-spanning connections make "friends" a complicated concept. More NPCs could be added if scenarios require them.
