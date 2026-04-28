# HUD Redesign — Staged Intensity Plan

**Created:** 2026-04-27 (session 18, deferred to session 19+)
**Owner:** chris + claude
**Origin:** Bug `docs/bugs/2026-04-27-hud-cramped-overcrowded.md` confirmed
hand-on. User reaction during browser QA: "the HUD is so cramped now i
hate it lik why have we added sooooo much clutter bro".

## Why staged?

User directive (verbatim 2026-04-27):

> "i think it would make sense to do this in multiple steps of how
> aggressive we are. start with small changes and see how far we can
> get with that. if its not good enough to edit what we have then a
> larger and bigger pass will be needed."

The risk of a big-bang HUD redesign in this codebase is real: it touches
sensitive areas (column resize, theme inheritance, no-surprise-UI rule)
that have regressed 10+ times. So we ratchet up only when the previous
tier is judged insufficient. After each tier, **stop**, use the app
normally for a few minutes, and decide: ship it, or escalate.

## Inventory snapshot (the problem space)

Counted from screenshot taken 2026-04-27 (Rin (Akane), 3D viewer open):

| Zone | Visible elements | Notes |
|---|---|---|
| Top right toolbar | 8 icons + version | chat-threads · thread-search · global-search · export · soundscape · model-browser · settings · 3D-toggle |
| Bond strip (chat header) | 6 + 1 floating | avatar · level · tier · 3 colored bars · 48× · Close pill · "Next: Character uses your name (Lv 1)" tooltip *overlapping chat content* |
| Context budget | 1 floating | "1.7k / 262.1k (0.6%)" pill — overlaps conversation starters |
| Conversation starters | 3 buttons | OK in isolation, fight with budget pill |
| Chat-area mid toolbar | 2 + 5 + 3 = 10 | whisper · quickfire · book · sparkle · TV · drama · emoji · `Len` · `Filter` · `Style` |
| Sidebar bottom | 6 icons | Memory · Lore · Games · Stats · Ctx · Help |
| Composer | 1 textbox + 4 voice + 1 send | mic · mic-alt · voice-mode · phone · send |
| 3D viewer overlay | 12+ | Full · Bust · Face · 3/4 · Side · Low · L-Drag · Scroll · Close · Models · Photo · 2 corner buttons · 3 collapsible (Spring/VFX/Anim) |

Total: **~45+ interactive elements visible at once** in normal chat
view. That is the source of "cluttered."

Root cause: every recent feature wave (Bond, AIE, NSFW, Scenarios,
Memory Browser, Quick Replies, Voice, Director, Spring Bones,
Animation Library) added a button or pill *somewhere*. Each was a fine
local decision; together they're saturation.

## Design principles (apply at every tier)

1. **Three-tier visibility:** Always-visible / one-click-away / settings-buried.
   Default to "always" only for the top 5–7 controls per zone.
2. **Group by intent, not feature.** Five "modes" (chat / voice / view /
   compose / status) instead of five vendor-style feature buttons.
3. **Status-as-text-not-icon when both work.** `Style: 18+RP` as a
   text pill is fine. `🎭` icon for Director Mode steals more attention
   per pixel and conveys less.
4. **No surprise additions.** Per CLAUDE.md sensitive-area rule, every
   tier is "remove or hide", never "add a new button" — even for the
   overflow menu trigger. Use existing space (a `⋯` glyph).
5. **Theme test at each tier.** Verify against 1 light + 1 dark theme.
6. **Reversible.** Every tier ships as a single commit so revert is one
   `git revert`. No mass refactors that can't be unwound.

## The Ladder

Each tier has:
- **Scope** — what changes
- **Effort** — claude-assisted hours
- **Gate** — what user verifies before deciding to escalate
- **Stop condition** — what "good enough" looks like

### Tier 0 — Audit + decision board (prerequisite, ~1h)

Build the spreadsheet. Every HUD element across all 7 zones, with:
- Feature it belongs to
- Session it was added (from git log)
- Importance ranking (essential / common / occasional / never)
- Proposed visibility tier (always / one-click / buried)

Output: `docs/research/2026-XX-XX-hud-element-audit.md` with a single
big table + recommended tier per element. No code changes.

**Gate:** chris reviews the table. Mark green / yellow / red on each
proposed tier. This becomes the source of truth for tiers 1-6.

**Stop condition:** the audit alone might be enough — sometimes seeing
the list reveals "oh just kill these 5 buttons we never use." If chris
says "just delete X, Y, Z and we're done", we go straight to a small
delete-only commit and skip the rest of the ladder.

### Tier 1 — Layout bug fixes only (~30 min)

Pure bug fixes, no UX changes. Just stop the bleeding.

- Fix the floating "Next: Character uses your name (Lv 1)" tooltip
  overlapping chat content (it should anchor to the bond bar, not
  cover messages below).
- Fix the context-budget pill (`1.7k / 262.1k`) overlapping the
  conversation starters.
- Any other z-index / overflow regressions found during Tier 0.

**Gate:** Open the app. Is chat readable without elements stepping on
each other? If yes and the rest still feels too busy, continue.
**Stop condition:** "Looks fine now, just busy" — we already know it's
busy, but bug-free busy is liveable. Could ship and revisit later.

### Tier 2 — Top toolbar overflow (~1h)

The top-right 8-icon strip is the worst offender at the visual peak.

- Keep visible: search · settings · 3D-toggle (top 3 by usage; chris
  to confirm in Tier 0 audit).
- Move to `⋯` overflow popover: chat-threads · thread-search ·
  global-search merged into single search · export · soundscape ·
  model-browser. Popover renders as a 2-column grid with labels.
- Version text moves into settings → about.

**Gate:** Top of the chat now has bond strip + 4 buttons (3 + ⋯)
instead of 8 buttons + version. Still feel cluttered? Continue.
**Stop condition:** "That's a lot better." Single biggest visual
relief possible without behavior change.

### Tier 3 — Group chat-area mid toolbar (~2h)

Bottom of chat (above composer) currently has 8 elements: 2 toggles +
5 mode icons + 3 status pills.

- Collapse the 5 mode icons (book/lore · sparkle · TV/director ·
  drama · emoji) into a single `⚙ Modes` popover button. The popover
  is a vertical menu of mode toggles with current state shown.
- Status pills (`Len: Brief` / `Filter: Off` / `Style: 18+RP`) merge
  into a single compact `Brief · Off · 18+RP` segmented pill. Click
  opens the existing settings.
- Whisper / Quickfire stay visible as primary mode toggles.

**Gate:** Chat-area toolbar drops from 8 elements to 4. Composer area
is calmer. Mode toggles still discoverable?
**Stop condition:** "I can find what I need without thinking" + chat
is the visual focus.

### Tier 4 — Bond strip simplify (~2h)

The 7-element bond display is informationally dense but visually
busy. Keep info, reduce visual weight.

- Bond display shrinks to: `▮ Lv 0 · Stranger · 0/150 XP`. Single
  pill, single line.
- 3 colored bars (heart/sparkle/gem) move into a hover/click-to-expand
  detail panel.
- 48× streak indicator moves into the bond pill as a small inline
  badge: `▮ Lv 0 · Stranger · 0/150 XP · 48🔥`.
- Floating "Next: Character uses your name" tooltip becomes part of
  the expanded detail panel, not a permanent overlay.

**Gate:** Chat header is now 1 line instead of a 4-row block.
**Stop condition:** "I see who I'm talking to and their bond level
at a glance, the rest is one click away."

### Tier 5 — Sidebar bottom consolidate (~1.5h)

6 icons (Memory · Lore · Games · Stats · Ctx · Help) at the bottom of
the left sidebar.

- Keep visible top 3 by usage from Tier 0 audit (likely Memory · Lore
  · Help).
- Move secondary 3 (Games · Stats · Ctx) into a "More tools" expander.

**Gate:** Sidebar feels less competitive with the main chat.
**Stop condition:** Open if the user uses these often. May skip if
audit shows all 6 are common.

### Tier 6 — 3D viewer overlay rethink (~3-4h)

Currently 12+ controls visible at once *over* the avatar. The avatar
should be the focus; controls should hide unless touched.

- Camera presets (Full · Bust · Face · 3/4 · Side · Low) collapse to a
  floating "📷 Camera" button that opens a horizontal preset bar on
  hover/click.
- L-Drag/Scroll hints fade out after 5s of inactivity.
- Spring Bones · Visual Effects · Animation Library all collapsed by
  default into a single `⚙` settings popover.
- Photo · Models · Close stay as bottom-bar primary actions.

**Gate:** Open 3D viewer. See the avatar, not the chrome.
**Stop condition:** "It feels like a 3D viewer, not a Photoshop panel."

### Tier 7 — Density toggle (escape hatch, ~2h)

If after tiers 1–6 it's still busy, OR if chris has friends/devs who
want even more density:

- Add `Settings → Display → HUD density` with three options:
  - **Cozy** (current after tiers 1–6)
  - **Standard** (default — current after tiers 1–6 minus tier 4)
  - **Minimal** (additional aggressive hiding: no version pill, no
    streak badge, no status pills, viewer overlay 100% hidden until
    hover)

**Gate:** Density toggle persists across sessions. Themes still
correct in all three modes.
**Stop condition:** User has a one-click escape from clutter for any
character/session.

### Tier 8 — Full information-architecture redesign (~6-12h)

Only reach this if tiers 1–7 still feel wrong. Means the *placement*
of things — not just visibility — needs to change. Examples:

- Move Memory / Lore from sidebar bottom to chat-header companion strip
- Move bond display from chat header to sidebar (it's a per-char stat,
  not a per-conversation stat)
- Reorganize composer: voice icons stack vertically beside the
  textbox instead of horizontally below
- Sidebar becomes nav-only; "tools" go into a top-bar tab strip

This is a *real* redesign. Plan it as its own multi-day effort and
revisit only if tier 7 isn't enough.

## Escalation rules

After each tier ships:
1. Use the app normally for at least 10 minutes (not 5 — distractions
   matter).
2. Ask: "Does the busiest screen still feel busy?"
3. If **no** → stop. We're done. Document lessons learned.
4. If **yes** → escalate to next tier.
5. If a specific zone is still bad but rest is fine → jump straight
   to the targeted tier (e.g., skip 5, do only 6 if viewer is the
   remaining problem).

## Order of operations (recommended)

1. Tier 0 (audit) — always, prereq for everything else
2. Tier 1 (bug fixes) — always, free win
3. Tier 2 (top toolbar) — biggest single visual gain
4. **Pause and evaluate** — many users will stop here
5. Tier 4 (bond strip) — second-biggest visual gain at top of screen
6. **Pause and evaluate**
7. Tier 3 (chat-area toolbar) — middle-of-screen calm
8. Tier 6 (viewer overlay) — only if 3D viewer is a recurring "ugh"
9. Tier 5 (sidebar) — last because least visible / least daily impact
10. Tier 7 (density toggle) — only if we still want an escape hatch
11. Tier 8 (full IA) — only if everything above wasn't enough

## What I will NOT do

- **No surprise additions.** New buttons, badges, pills, dividers, or
  pull-tabs require explicit chris approval. Per CLAUDE.md sensitive
  area #4. The `⋯` overflow trigger and `⚙` settings glyph are reusing
  existing affordance language, not new chrome.
- **No theme regressions.** Every tier verified against at least 1
  light + 1 dark theme before commit. Per CLAUDE.md sensitive area #3.
- **No multi-tier mega-commits.** Each tier is one commit. Stop after
  each. Easy revert.
- **No new context providers without test updates.** Per the existing
  test mock drift rule.

## Linked

- Bug filed: `docs/bugs/2026-04-27-hud-cramped-overcrowded.md`
- Sensitive areas list: CLAUDE.md "Known Sensitive Areas"
- Theme verification skill: `theme-auditor` agent
