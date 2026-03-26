# Character Card Import/Export Manager Plan

## Phase 0: Set Up Tracking System

Before implementation, create the `docs/plans/` tracking system:

1. **Create `docs/plans/ROADMAP.md`** — Master index with status table of all features
2. **Create `docs/plans/001-psychology-engine.md`** — Archive the completed psychology engine plan (status: DONE)
3. **Create `docs/plans/002-character-cards.md`** — This plan (status: IN PROGRESS)
4. **Populate ROADMAP.md** with all known features from the masterlist with their current status (DONE / IN PROGRESS / PLANNED / IDEA)

---

## Competitor Research

### Character Card Repository Sites (import sources)
| Site | URL | Format | Notes |
|------|-----|--------|-------|
| **Chub.ai** | chub.ai/characters | PNG (V2), JSON | Largest repo. Tag/filter system. One-click import via path. |
| **Character Tavern** | character-tavern.com | PNG, JSON | Cleaner visual browsing. Detailed previews. |
| **AI Character Cards (AICC)** | aicharactercards.com | PNG, JSON | Community-driven, moderated. Hidden gems. |
| **Venus Chub AI** | venuschub.ai | Same as Chub | Zero-signup access. Large anime/waifu community. |
| **Pygmalion AI** | pygmalion.chat | PNG cards + lorebooks | Creator tools. Community sharing. |
| **JanitorAI** | janitorai.com | Custom format | Largest community library. Multiple AI backends. |

### Compatible Platforms (use same V2 card format)
SillyTavern, Agnai (agn.ai), KoboldAI, Backyard AI, Moemate, Faraday.dev

### Feature Learnings from Competitors
| Feature | Leader | What to learn |
|---------|--------|---------------|
| **Memory retention** | Feelin (78% @ turn 40), SillyTavern (75%) | We need embedding-based retrieval (planned #16) |
| **Multi-character scenes** | DreamGen | Multiple personas in one thread (planned #13) |
| **Voice interaction** | Xoul AI, Kindroid | We have TTS/STT — add voice call mode polish |
| **Lorebook/World Info** | NovelAI (128K context, keyword triggers) | Our lorebook is scaffolded — wire it next |
| **Zero-friction start** | Venus Chub, Perchance | Our setup wizard auto-dismisses — good |
| **Emotional continuity** | Replika (relationship tracking) | Our psychology engine now handles this |
| **Scene Cards** | Crushon.AI | Visual novel aesthetics — planned #14 |
| **Trait tuning** | Kindroid, Nomi.ai | Our dere weight system covers this |

### Full Site List (from rushchat.ai article + research)
**Fast NSFW:** rushchat.ai, CrushOn.AI, SpicyChat AI, Janitor AI, Chai AI, Botify AI, Talkie AI, RolePlai
**Companion style:** Replika, Kindroid, Nomi.ai, Anima AI, Eva AI, Romantic AI, DreamGF
**Story-driven:** Character.AI, AI Dungeon, NovelAI, Inworld AI, Kajiwoto, SillyTavern, Faraday.dev
**Power-user:** Janitor AI (advanced), Kajiwoto, Kindroid, Nomi.ai, SillyTavern + local models
**Casual/niche:** FantasyGF, AI Lover, WaifuChat, Virtual Lover AI, Yandere AI, MyVirtualCompanion, Lover AI
**Additional:** Poe (multi-model), DreamGen, Xoul AI, Storychat, Perchance, Feelin, Candy AI, DRT.fm, NoShame, YumeAI

---

## Character Creation UX Research

### How the best platforms do it:

**Kindroid** (best personality system):
- **Backstory** is the primary personality source (natural language, concise, 3rd person)
- **Response Directive** = highest-priority behavioral override ("Be reserved, use slang, be concise")
- **5 memory layers**: backstory, response directive, key memories, journal entries, additional context
- **Model Flairs**: Companion, Roleplay, Narrative, Minimal — changes how AI interprets backstory
- **Conversation Dynamism** slider (0-1) controls response variety
- **Example Message** sets tone/format expectations
- Key insight: *Personality emerges from layered composition, not template selection*

**DreamGen** (best scenario system):
- Two modes: Roleplay (Character AI-like) + Storywriting (multi-character)
- **Pre-made scenario library** ranging from companion to sci-fi to fantasy
- Multi-character scenes: define each character's behavior, speech, and interaction style
- Detailed backstories + writing style + tone + personality all configurable
- Key insight: *Scenarios are first-class citizens, not afterthoughts*

**JanitorAI** (largest community):
- Fields: avatar, name, short name, description/backstory, appearance, personality, initial message, scenario, example dialogues
- Personality requires 500+ chars with contradictions, speech patterns, emotional range, boundaries
- Community sharing is core — templates posted as public characters
- Key insight: *Write personality guidelines as behavioral rules, not trait lists*

**SillyTavern V2 Character Card** (industry standard spec):
- **description**: Core character identity (200-2000 tokens)
- **personality**: Brief personality summary
- **scenario**: Circumstances of the interaction
- **first_mes**: Critical — AI mirrors its style/length in responses
- **alternate_greetings[]**: Multiple scenario starters (swipeable)
- **mes_example**: Example dialogues with `<START>` delimiters
- **system_prompt**: Overrides user's system prompt (supports `{{original}}`)
- **post_history_instructions**: Injected after chat history (jailbreak position)
- **character_book**: Embedded lorebook with keyword-triggered entries
- **extensions**: Namespaced metadata (e.g., `animegirly/psychologyConfig`)
- Key insight: *first_mes sets the AI's tone more than anything else*

### Our approach (synthesis):

**Quick Mode** (AI-authored with guidance):
1. User gives loose concept → AI generates 3 permutations
2. Each permutation has: full backstory, personality, 3-5 scenarios, example dialogue
3. User picks one, refines, saves

**Advanced Mode** (guided builder):
1. Step-by-step: name → appearance → personality → backstory → setting
2. AI writes prose fields from structured input
3. User reviews, edits each field

**Both modes generate:**
- Full V2-compatible character JSON
- Per-character behavioral rules (unique, not template-derived)
- Multiple scenario starters with first messages
- Psychology config with custom bonds/threats/canon constraints

**Dere types** become optional flavor tags, not structural drivers.

---

## Context

Feature #4 on the masterlist. The character card service layer is **~90% built** — `characterCardService.ts` (686 lines) handles PNG tEXt chunk extraction/injection, V1/V2 format detection, card↔persona field mapping, lorebook entry conversion, and import/export as PNG/JSON. A `CharacterGalleryPanel.tsx` (444 lines) already exists with search/filter/sort for a curated gallery of 12 built-in cards. What's missing: a **Card Manager UI** for user-uploaded cards, an **import preview dialog**, **export buttons**, **first_mes/alternate_greetings** handling, and **round-trip fidelity** for AnimeGirly extensions.

## Scope

**In scope:** Import UI (file upload + drag-drop), import preview dialog, export UI, first_mes thread seeding, lorebook re-embedding on export, round-trip extensions parsing, and the Card Manager settings panel.

**Deferred (not dropped — tracked in ROADMAP.md as ⏸️ DEFERRED):**
- Remote gallery adapters (chub.ai API) — needs API research
- Batch import — nice-to-have, do after single import works
- Card sharing/upload to community — needs community infra
- Avatar extraction from card PNGs — complex binary work, separate feature
- Character Data Model v2 migration — needs PRD first
- AI Character Creator — needs prompt engineering research

---

## Phase 1: Enhance Gallery Panel with Import/Export

**Goal:** Add import upload and export capabilities to the existing Gallery tab (`CharacterGalleryPanel.tsx`). No new tab needed — `gallery` already exists in the 'Social' settings group.

**File:** `src/components/settings/CharacterGalleryPanel.tsx` (444 lines, modify)

**Registration:** Already registered in `SettingsPanel.tsx` line 39 as `gallery` tab in the `Social` group. No changes needed.

### 1a. Add import upload section

Add above the existing gallery grid:

- **"Import Character Card" button** — opens file picker (accepts `.png`, `.json`)
- **Drag-and-drop zone** — dashed border, file-drop handler (reuse pattern from `EnvironmentUploader.tsx`)
- On file selected: detect extension → call `importCardFromPng()` or `importCardFromJson()` → show **Import Preview Dialog** (Phase 2)

### 1b. Add "My Characters" section

Add between the import section and curated gallery:

- List of user-imported/custom personas (filter `personas` where `id.startsWith('persona-card-')`)
- Each entry shows: name, archetype tag, dere types, import date
- Action buttons per entry: "Export PNG", "Export JSON", "Delete"
- Export calls `exportCardAsPng(persona)` / `exportCardAsJson(persona)` → `downloadBlob()`

### 1c. Add export to ALL personas

In the persona list, add small export icon buttons on each card so users can export **any** persona (not just imported ones) as a SillyTavern-compatible card.

**Key imports from existing code:**
- `importCardFromPng`, `importCardFromJson`, `exportCardAsPng`, `exportCardAsJson`, `downloadBlob` from `characterCardService.ts`
- `SETTINGS_PANEL_CARD`, `SettingsSectionHeader` from `SettingsPrimitives.tsx`
- `useCompanion()` for `savePersona`, `personas`
- `toast` from `sonner`

---

## Phase 2: Import Preview Dialog

**Goal:** Before committing an import, show the user what they're about to import and let them customize.

### 2a. Create ImportPreviewDialog

**New file:** `src/components/settings/ImportPreviewDialog.tsx`

**Uses:** Radix `Dialog` primitive (existing pattern in codebase)

**Content:**
- **Character info:** Name, creator, creator notes, tags, description preview (truncated)
- **Stats:** Lorebook entries count, whether `first_mes` exists, alternate greetings count
- **Options:**
  - "Create a new conversation with opening message" toggle (enabled if `first_mes` exists)
  - Alternate greeting selector (dropdown if multiple greetings exist)
  - Content rating selector (default: general, can set higher if card seems mature)
- **Actions:** "Import" (confirm) and "Cancel"

**Data flow:**
- Receives `CardImportResult` (already returned by the existing import functions)
- On confirm: calls `savePersona()`, optionally creates thread with first message
- The `CardImportResult` type already contains: `personaId`, `lorebookEntryCount`, `rawCard`, `creatorNotes`, `firstMessage`, `alternateGreetings`

---

## Phase 3: First Message & Alternate Greetings

**Goal:** When importing a card with `first_mes`, optionally seed a new thread with that message.

### 3a. Thread seeding on import

**File:** `src/components/settings/CardManagerPanel.tsx` (or ImportPreviewDialog)

After persona is saved:
1. If user opted for "create conversation with opening message":
   - Create new `ChatThread` with persona's ID
   - Create opening `ChatMessage` with role `'assistant'`, content = selected greeting
   - Persist via `putThread()` and `replaceMessagesForThread()`
   - Switch to that thread

### 3b. Store alternate greetings

**File:** `src/types/companion.ts` — `PersonaProfile`

- Add optional field: `alternateGreetings?: string[]`
- Populated from `CardImportResult.alternateGreetings` during import
- Used in a "New Conversation" flow to let user pick a starting greeting

### 3c. Preserve first_mes on export

**File:** `src/services/characterCardService.ts` — `personaToCardData()`

- Check if persona has `alternateGreetings` → write to `card.data.alternate_greetings`
- The first alternate greeting (or a stored `firstMessage` field) → write to `card.data.first_mes`

---

## Phase 4: Round-Trip Fidelity (Extensions)

**Goal:** When importing a card exported from AnimeGirly, restore the full psychology/content config.

### 4a. Parse extensions on import

**File:** `src/services/characterCardService.ts` — `cardDataToPersona()`

Currently ignores V2 extensions. Add:
```ts
if (card.extensions?.animegirly) {
  const ext = card.extensions.animegirly;
  // Restore archetype, levels, psychologyConfig, contentConfig, etc.
}
```

This means: export from AnimeGirly → share PNG → re-import → full config restored (archetype, dere weights, psychology rules, content settings).

### 4b. Embed lorebook entries on export

**File:** `src/services/characterCardService.ts` — `personaToCardData()` or `exportCardAsPng()`

Currently exports without `character_book`. Add:
1. Load lorebook entries for this persona from IndexedDB
2. Convert `LorebookEntry[]` → `CharacterBookEntry[]` (reverse of existing `characterBookEntryToLorebookEntry`)
3. Include in `card.data.character_book`

New helper: `lorebookEntryToCharacterBookEntry(entry: LorebookEntry): CharacterBookEntry`

---

## Phase 5: Wire Into Existing Gallery

**File:** `src/components/settings/CharacterGalleryPanel.tsx`

The existing gallery panel already has an import handler. Enhance it:
- Instead of directly importing on click, show the ImportPreviewDialog first
- After import, show the card in the CardManagerPanel's "Imported" section

---

## Phase 6: Tests

### 6a. Extend characterCardService tests

**File:** `src/services/characterCardService.test.ts`

- Test `cardDataToPersona` with extensions.animegirly round-trip
- Test lorebook re-embedding on export
- Test first_mes and alternate_greetings preservation

### 6b. New CardManagerPanel tests

- Test file upload handler (mock FileReader)
- Test export button triggers download

---

## Files to Modify/Create

| File | Action | Phase |
|------|--------|-------|
| `docs/plans/ROADMAP.md` | **Create** — Master feature tracking index | 0 |
| `docs/plans/001-psychology-engine.md` | **Create** — Archive completed plan | 0 |
| `docs/plans/002-character-cards.md` | **Create** — This plan | 0 |
| `src/components/settings/CharacterGalleryPanel.tsx` | Modify — Add import upload, "My Characters" section, export buttons | 1 |
| `src/components/settings/ImportPreviewDialog.tsx` | **Create** — Import preview + options dialog | 2 |
| `src/types/companion.ts` | Modify — Add `alternateGreetings?` to PersonaProfile | 3 |
| `src/services/characterCardService.ts` | Modify — Extensions parsing, lorebook embedding, first_mes handling | 3, 4 |
| `src/services/characterCardService.test.ts` | Modify — Round-trip + lorebook tests | 6 |

## Execution Order

```
Phase 0 (tracking system setup) — first, non-code
Phase 1 (enhance Gallery panel with import/export UI) — foundation
Phase 2 (ImportPreviewDialog) — depends on Phase 1
Phase 3 (first_mes + alternate greetings) — depends on Phase 2
Phase 4 (round-trip extensions + lorebook embedding) — independent of 2-3
Phase 5 (wire preview dialog into existing gallery import flow) — depends on Phase 2
Phase 6 (tests) — last
```

---

## Pre-Phase: Workflow System Setup

Before feature work, set up 3 things:

### A. `docs/plans/ROADMAP.md` — Master Dashboard

Status table with links, minimal notes. Scannable at a glance, drill into plan/research files for details.

**7 status badges:** ✅ DONE | 🔨 WIP | 📋 PLANNED | 📝 SPECCING | 🔬 RESEARCHING | 💡 IDEA | ⏸️ DEFERRED

### B. `docs/research/` — Saved Research

Loose markdown with sections (findings, platforms, sources). Two-stage system:
- **Quick pass**: Brain dump with links. Get something down fast. Tagged `> Status: Quick pass`
- **Full research**: Organized findings with analysis and sources. Tagged `> Status: Complete`

Default to 2-stage: quick pass first (can do multiple topics fast), full research later when needed.

**`docs/research/SOURCES.md`** — Master sources file. Every web search, article, or doc we reference gets logged here. Grouped by topic/research file. Grows indefinitely. Format:

```
## Character Creation UX
- [Kindroid: Customizing personality](https://docs.kindroid.ai/customizing-personality) — How Kindroid structures backstory + personality layers
- [SillyTavern V2 spec](https://github.com/malfoyslastname/character-card-spec-v2) — Official character card format specification
- ...

## Competitor Sites
- [SimilarLabs: 20 Best Character AI Alternatives](https://similarlabs.com/blog/best-character-ai-alternatives) — Feature comparison of 20 platforms
- ...
```

Use this as a go-to reference when asking "what can we add?" or "what inspired this feature?"

### C. Add to CLAUDE.md

Add one line: "Always save research to `docs/research/` — quick pass first, full research later."

**Rules:** Don't pre-create `.claude/rules/` files. Add them organically when a pattern keeps coming up.
**Skills:** Suggest new skills when a gap appears, don't auto-create. User decides.
**Memory:** Keep using as-is for cross-session learnings.

---

## Meta-Roadmap: What to Do Now vs. Later

### ACT NOW (this session)
1. **Catch-up: Convert ALL existing work into the tracking system** — Go through git history + existing code + FEATURE_MASTERLIST.md and create ROADMAP.md entries for every feature (done, scaffolded, planned, idea). This includes the ~6 done features, ~8 scaffolded ones, and all 40 masterlist items. Each gets proper status + links to any existing PRDs/plans. **Also: mine previous work for things that were likely out of scope at the time** — for each completed feature, think "what was probably cut or deferred?" and add those as 💡 IDEA entries. Populate the deferred/ideas backlog with retroactive insights from all prior implementation sessions.
2. **Save today's research as first research files:**
   - `docs/research/character-creation-ux.md` — Kindroid, DreamGen, JanitorAI, SillyTavern V2 spec findings
   - `docs/research/competitor-sites.md` — The 40+ sites list with features/capabilities
3. **Archive plans** — Psychology engine → `001-psychology-engine.md`, character cards → `002-character-cards.md`
4. **Deep feature mining pass** — Go back through competitor sites and extract actionable features we haven't thought of yet. Add to ROADMAP.md as 💡 IDEA entries. Target: find 10+ new features or improvements from the competitor research.
5. **Add instructions to CLAUDE.md** — "save research to docs/research/" + "log sources to docs/research/SOURCES.md"
6. **Update README.md** — Include an overview of this workflow system (tracking, research, plans, status badges)
7. **Create reusable workflow template** — `docs/workflow-template/` folder with a portable version of our system (ROADMAP.md template, research folder structure, CLAUDE.md additions, memory setup). Written so Claude can bootstrap it into any new project when you say "use our workflow system". Also serves as the README workflow section.
6. **Build import/export UI** — Enhance Gallery panel with file upload + export buttons (Phases 1-2)
7. **Build scenario picker** — Character-speaks-first with alternate greetings (Phase 3)

### PLAN NEXT (write PRDs, not code)
5. **Character Data Model v2 PRD** — Define the new V2-native JSON character format, field guidelines (how long each field should be, quality standards), migration plan from current PersonaProfile → V2 JSON
6. **AI Character Creator PRD** — Quick mode (concept → permutations) + Advanced mode (guided builder). Needs: prompt engineering research, LLM-as-creator workflow, UI mockups
7. **Character Manager Panel PRD** — Browse/edit/delete characters, search/filter, bulk operations

### RESEARCH LATER (save topics to investigate)
8. **Remote gallery adapters** — Chub.ai API, character-tavern.com browsing, AICC integration
9. **Character sharing/community** — How to let users share characters (export as PNG card, share link?)
10. **AI writing quality** — Test different LLMs for character generation (which model writes the best backstories?)
11. **Lorebook wiring completion** — How lorebook entries integrate with prompt assembly (scaffolded, not wired)
12. **Advanced memory system** — Embedding-based retrieval, episodic memory, consolidation (Feature #16)

### UNIFY AGENT/SKILL SYSTEMS (next session)
- Compare and unify `.claude/agents/` and `.claude/skills/` between AnimeGirly and waifu-rt3d
- waifu-rt3d has a clean `AGENTS.md` with: advisor (strategic partner), prd-writer, orchestrator, senior-dev, ux-architect, schema-architect, qa-hunter, codebase-analyst
- waifu-rt3d also has dispatch rules (small/medium/large feature → different agent combos) and a standard workflow (scope → PRD → orchestrate → validate → review)
- AnimeGirly has 9 agents + 11 skills but no AGENTS.md file and no dispatch rules
- **Action**: Create AGENTS.md for AnimeGirly, consider adding `advisor` agent, add dispatch rules, evaluate if any waifu-rt3d skills should come over, check for new agents/skills to add based on our workflow learnings

### REMEMBER FOR FUTURE
- Always save research to `docs/research/` as markdown
- Keep plan files in `docs/plans/` with ROADMAP.md index
- When rewriting character files, backup old versions first
- Dere types → flavor tags (don't use as structural templates)
- Characters stored as V2 JSON natively (file = export format)

## Verification

**Light check (default — use when code is straightforward):**
- `npx tsc --noEmit` — confirms compilation
- Quick manual test of the feature we just built

**Full check (only for complex/risky changes):**
- TypeScript + vitest + manual end-to-end test
- Only do this for: IndexedDB migrations, prompt assembly changes, binary file handling

**Skip entirely when:** Renaming, docs-only changes, research saves, ROADMAP updates.

## Skill Suggestions (propose as we go)

When we notice repetitive workflows, suggest a skill. Examples to consider:
- `/quick-check` — just `tsc --noEmit`, no tests (for when I'm confident)
- `/full-check` — tsc + vitest + lint (for complex changes)
- `/save-research <topic>` — save current findings to docs/research/

These are suggestions, not implemented yet. We'll create them when the need becomes clear.
