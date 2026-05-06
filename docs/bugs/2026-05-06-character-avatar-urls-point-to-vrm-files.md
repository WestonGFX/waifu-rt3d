# 7 characters have `avatar_url` pointing to .vrm files (3D model, not displayable as `<img>`)

**Filed:** 2026-05-06 (session 29 browser QA)
**Severity:** P3 (cosmetic — sidebar shows initial-letter fallback when `<img>` fails to decode)
**Component:** `characters.avatar_url` column in `backend/storage/app.db` + frontend sidebar avatar render
**Discovered via:** investigating the 7-portrait-404 footnote referenced in the BondPill bug doc.

## Symptom

Character sidebar in Sakura renders an initial-letter avatar (e.g. "S" for Shiori) instead of a portrait image for 8 of the 14 characters. The `<img>` errors silently because the URL points to a `.vrm` (binary 3D model) or a background JPG — both fail to decode as images.

## Inventory

```
 id  name                 avatar_url                                              status
---  -------------------- ------------------------------------------------------  ------------------
  1  Rin (Akane)          /files/images/rin_pixel_portrait.png                    OK (correct portrait)
  2  Tsundere (Raine)     /files/images/raine_portrait.png                        OK
  3  Ayane (Yuki)         /files/images/nyx_portrait.png                          OK
  4  Genki (Kitsune)      /files/images/kitsune_portrait.png                      OK
  5  Hana (Momoka)        /files/images/seraph_portrait.png                       OK
  6  Sable (Kuroha)       /files/images/viper_portrait.png                        OK (asset shared w/ #15)
  8  Shiori (Nana)        /files/avatars/Kitsune.vrm                              BROKEN (vrm)
  9  Mika (Mikazuki)      /files/avatars/Kitsune.vrm                              BROKEN (vrm)
 10  Kaede (Suzuha)       /files/avatars/Kitsune.vrm                              BROKEN (vrm)
 11  Luna (Tsukimi)       /files/avatars/Kitsune.vrm                              BROKEN (vrm)
 12  Yuki (Shirayuki)     /files/avatars/Kitsune.vrm                              BROKEN (vrm)
 13  Dae (Neciridae)      /files/images/kitsune_bedroom.jpeg                      WRONG (background, not portrait)
 14  Alana Calloway       /files/avatars/Kitsune.vrm                              BROKEN (vrm)
 15  Brittney             /files/images/viper_portrait.png                        OK (asset shared w/ #6)
```

7 .vrm-as-portrait + 1 background-as-portrait = 8 broken avatars.

## Root cause

The `avatar_url` column is overloaded — historically it stored a portrait image URL, but newer characters (added during VRM rollout) stored the VRM model URL there because they had no portrait yet. The frontend always renders `avatar_url` via an `<img>`, so a `.vrm` value silently fails decode.

## Available portrait assets (in `backend/storage/images/`)

Already used by other characters:
- `rin_pixel_portrait.png` (#1), `raine_portrait.png` (#2), `nyx_portrait.png` (#3), `kitsune_portrait.png` (#4), `seraph_portrait.png` (#5), `viper_portrait.png` (#6 + #15)

Unassigned and available:
- `shiori_pixel_portrait.png` — exact 1:1 match for **Shiori (Nana)** (#8)
- `tsuki_portrait.png` — moon-themed, fits **Luna (Tsukimi)** (#11) or **Mika (Mikazuki)** (#9)
- `seraph_pixel_portrait.png` — pixel-style angel, available
- `sable_pixel_portrait.png` — pixel-style of Sable, could be paired w/ Sable's #6 or used for a similar tone char
- `glitch_portrait.png` — generic, available
- `panicandy_portrait.png` — generic, available

## Suggested fix (taste call — needs user pick before applying)

Lossless inventory + obvious 1:1 matches:

| char id | char name | suggested avatar_url | reason |
|---|---|---|---|
| 8 | Shiori (Nana) | `/files/images/shiori_pixel_portrait.png` | exact name match |
| 11 | Luna (Tsukimi) | `/files/images/tsuki_portrait.png` | tsuki = moon = Luna |
| 9 | Mika (Mikazuki) | (needs new asset OR reuse glitch/panicandy) | mikazuki = crescent moon — could share tsuki w/ #11 |
| 10 | Kaede (Suzuha) | (needs new asset) | no obvious match |
| 12 | Yuki (Shirayuki) | (needs new asset) | no obvious match |
| 13 | Dae (Neciridae) | (needs new asset OR explicit null) | currently a background, not a portrait |
| 14 | Alana Calloway | (needs new asset) | no obvious match |
| 15 | Brittney | (already OK — sharing viper w/ Sable) | OK |

Two paths:

1. **Quick win:** apply the 2 obvious 1:1 matches (Shiori, Luna). 4 characters still broken but improvement is concrete. ~5 LOC SQL update.
2. **Full fix:** generate portraits for all 8 broken chars via `scripts/draft_character_styles.py` -> existing image generation pipeline (Phase 3 of the Visual Content MVP). Larger scope.

## Why this is P3 not P2

- Frontend already has a graceful fallback (initial-letter circle).
- No crash, no broken UX flow — just less polished.
- All listed characters are still functional in chat / 3D viewer.

## Repro

1. Open Sakura at `localhost:5175/sakura/`.
2. Scroll the character sidebar.
3. Observe characters 8/9/10/11/12/13/14 render the initial-letter fallback.

## Out of scope

- The `.vrm` files THEMSELVES are correct — they should remain in `vrm_model_url` (separate column). The bug is that `avatar_url` was incorrectly populated with the VRM path during character seeding for these 7 chars.
- Char #15 (Brittney) shares Sable's portrait — that's acceptable until a unique asset exists.
