#!/usr/bin/env python3
"""Validate character docs, registry, and asset naming conventions.

Goals:
    - Prevent alias collisions (e.g., two characters sharing a parenthetical token)
    - Ensure each registry entry has required fields
    - Check that expected portrait images exist on disk
    - Verify character doc files are present

Usage:
    .venv/bin/python scripts/validate_characters.py

Example:
    >>> # Run from project root
    >>> .venv/bin/python scripts/validate_characters.py
    [OK] 13 character(s) validated. 12 portraits present, 1 missing (warn only).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs" / "characters"
IMAGES_DIR = ROOT / "backend" / "storage" / "images"
REGISTRY = DOCS_DIR / "character_registry_index.json"

# Matches "Name (Alias)" format — extracts the alias token
PAREN_RE = re.compile(r"^(?P<base>.+?)\s*\((?P<alias>.+?)\)\s*$")


def derived_image_slug(display_name: str) -> str:
    """Derive portrait filename from display name using the schema v6 convention.

    If name has parentheses, uses the alias inside them. Otherwise uses
    the first token. Always lowercased with spaces replaced by underscores.

    Args:
        display_name: Character display name, e.g. "Dae (Neciridae)"

    Returns:
        Portrait slug, e.g. "neciridae_pixel_portrait.png"

    Example:
        >>> derived_image_slug("Dae (Neciridae)")
        'neciridae_pixel_portrait.png'
        >>> derived_image_slug("Raine")
        'raine_pixel_portrait.png'
    """
    m = PAREN_RE.match(display_name.strip())
    if m:
        slug = m.group("alias").strip().lower().replace(" ", "_")
    else:
        slug = display_name.strip().split()[0].lower()
    # Strip asterisks from aliases like "*Kitsune*"
    slug = slug.replace("*", "")
    return f"{slug}_pixel_portrait.png"


def main() -> int:
    """Run all validation checks and report results.

    Returns:
        0 if all checks pass (warnings are OK), 2 if hard failures found.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # --- Check registry exists ---
    if not REGISTRY.exists():
        print(f"[FAIL] Registry not found: {REGISTRY}")
        return 2

    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    chars = data.get("characters", [])
    if not chars:
        print("[FAIL] Registry has no characters.")
        return 2

    # --- Validate uniqueness and required fields ---
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    seen_aliases: dict[str, str] = {}  # alias_lower -> character_id

    for c in chars:
        cid = c.get("id", "")
        name = c.get("name", "")

        if not cid:
            errors.append(f"Missing 'id' in entry: {c}")
            continue
        if not name:
            errors.append(f"Missing 'name' for id={cid}")
            continue

        # Duplicate ID check
        if cid in seen_ids:
            errors.append(f"Duplicate id: {cid}")
        seen_ids.add(cid)

        # Duplicate name check
        if name in seen_names:
            errors.append(f"Duplicate name: {name}")
        seen_names.add(name)

        # Alias collision check (the whole reason this script exists)
        m = PAREN_RE.match(name)
        if m:
            alias = m.group("alias").strip().lower().replace("*", "")
            if alias in seen_aliases:
                errors.append(
                    f"ALIAS COLLISION: '{alias}' used by both "
                    f"'{seen_aliases[alias]}' and '{cid}'. "
                    f"Portraits will collide!"
                )
            seen_aliases[alias] = cid

        # Portrait check
        portrait = c.get("portrait") or derived_image_slug(name)
        portrait_path = IMAGES_DIR / portrait
        if not portrait_path.exists():
            warnings.append(f"{cid}: missing portrait {portrait_path.name}")

        # Bio doc check
        bio_doc = c.get("bio_doc", "")
        if bio_doc:
            # bio_doc paths are relative to project root
            doc_path = ROOT / bio_doc
            if not doc_path.exists():
                warnings.append(f"{cid}: missing bio doc {bio_doc}")

    # --- Report ---
    if errors:
        print("[FAIL] Validation errors found:")
        for e in errors:
            print(f"  - {e}")
        if warnings:
            print("\n[WARN] Warnings:")
            for w in warnings:
                print(f"  - {w}")
        return 2

    portrait_missing = len([w for w in warnings if "portrait" in w])
    portrait_present = len(chars) - portrait_missing

    print(f"[OK] {len(chars)} character(s) validated. "
          f"{portrait_present} portraits present, "
          f"{portrait_missing} missing (warn only).")

    if warnings:
        print("\n[WARN] Non-blocking warnings:")
        for w in warnings:
            print(f"  - {w}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
