# Character Bible Patch — Standardize Nyx + Add Dae

## Goal
Prevent alias collision between the old roster entry **Nyx (Dae)** and the new character **Dae (Neciridae)**, and ensure asset derivation stays deterministic (your schema fallback derives portrait slugs from the parenthetical alias).

---

## 1) Rename Nyx to remove the alias 'Dae'

### Recommended rename
- Old: **Nyx (Dae)**  → **Nyx (Nightshade)**
- Rationale: keeps the “dark stage name” vibe and avoids clobbering Dae’s identity + portrait slug.

### Required file/link updates
- Rename doc file:
  - `docs/character/character_nyx_dae.md` → `docs/character/character_nyx_nightshade.md`
- Update all references in `docs/character/character_bible_master.md`:
  - Replace **Nyx (Dae)** → **Nyx (Nightshade)**
  - Replace link target `character_nyx_dae.md` → `character_nyx_nightshade.md`

---

## 2) Add Dae as a new roster row

Add a new row (suggested as #13) in the roster table:

| 13 | Dae | Neciridae | Hybrid (Kuudere/Erodere/Ojoudere) | Black / Ice Blue / Neon Violet | Nightshade (alt: Moonflower) | [Full profile](character_dae_neciridae.md) |

Notes:
- Use **Neciridae** as the alias token so her portrait derives to `neciridae_pixel_portrait.png`.
- Keep Nyx’s alias as **Nightshade** so her portrait derives to `nightshade_pixel_portrait.png`.

---

## 3) Consistency sweep checklist
- [ ] Update roster table row for Nyx
- [ ] Update Nyx mini-bio paragraph header text
- [ ] Update any rule examples referencing “Nyx (Dae)”
- [ ] Ensure any `avatar_2d_url` or fallback portraits are consistent:
  - Nyx → `/images/nightshade_pixel_portrait.png`
  - Dae → `/images/neciridae_pixel_portrait.png`

---

## 4) Optional: Add a global naming rule to the bible
Add a short rule under your naming conventions section:

> **Rule:** Parenthetical aliases (the token inside parentheses) are **unique keys**. Never reuse them across characters.

