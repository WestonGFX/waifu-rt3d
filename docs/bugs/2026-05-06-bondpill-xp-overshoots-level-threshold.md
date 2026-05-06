# BondPill display format reads as "X out of Y" but actually shows "X earned / Y to next"

**Filed:** 2026-05-06 (session 27 browser QA)
**Severity:** P3 (display/UX, not a crash)
**Surface:** `frontends/sakura/src/components/BondPill.tsx` accessible-name and visible label
**Updated:** 2026-05-06 — root cause clarified after backend probe.

## Symptom

Bond pill on Rin (Akane) displays:

```
Lv 0 · Stranger ████████████ 138/12 XP
```

with accessible name "Bond level 0, Stranger, 138 of 12 XP. Click to expand
bond detail." A reader naturally parses this as "138 out of 12" which sounds
broken (XP > threshold but level didn't advance).

## Root cause

The format is **`{bond_xp}/{xp_to_next} XP`** — current XP earned over XP
*remaining* to reach the next level. Per `backend/bond/progression.py`:

- `_xp_required_for_level(0) == 150` (level-0 threshold)
- Rin's row in `character_relationships`: `bond_level=0, bond_xp=138`
- `xp_to_next = 150 - 138 = 12`

So **the math is correct**. The display is just confusingly formatted: the
denominator is "XP remaining to level up", not "level threshold". A reader
seeing "138/12" reasonably assumes the second number is the cap.

## Reproduction

1. Open the Sakura frontend, Rin (Akane) active.
2. Observe the bond pill in the chat header.

## Screenshot

`docs/testing/screenshots/2026-05-06-session27-qa/01-bondpill-138-of-12-xp-bug.png`

## Suggested fixes (one-line, pick one)

| Option | Format | Reads as |
|---|---|---|
| **A (recommended)** | `138/150 XP · 12 to next` | "138 of 150, 12 to next" — threshold + remaining both visible |
| B | `138 XP · 12 to Lv 1` | "138 XP earned, 12 more for Lv 1" |
| C | `138/150 XP` | drop the remaining count (matches typical RPG pattern) |
| D | `92% to Lv 1` | percentage only |

The fill bar is already correct (renders ratio of 138/150). Only the text
label needs updating. Likely a one-line change in `BondPill.tsx`.

## Why this matters

Bond progression is the **#1 retention driver** per the competitor gap
analysis (`docs/research/2026-04-07-competitor-gap-analysis.md`). A pill
that visually says "you're stuck at level 0 with XP overshooting" makes the
bond system feel broken even when it's working correctly. First-impression
critical.

## Related but separate

This investigation surfaced a much bigger DB-bloat bug — see
`docs/bugs/2026-05-06-character-relationships-duplicate-rows.md` (P1). The
two bugs are orthogonal: the display issue exists even with a clean DB.

## Not in scope for this bug

- The 7 portrait 404s in console (`shiori_portrait.png`,
  `mikazuki_portrait.png`, etc.) are a separate asset-gap issue.
- The `Connection refused @ 10.0.0.17:1234` error is the user's external
  LM Studio host being offline; not a frontend bug.
