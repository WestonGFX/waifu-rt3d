"""
fix_avatar_urls.py — One-off correction for characters whose ``avatar_url``
was populated with a ``.vrm`` model path or a background image instead of a
portrait image.

See ``docs/bugs/2026-05-06-character-avatar-urls-point-to-vrm-files.md`` for
the full inventory and rationale.

Scope of this script: applies ONLY the two unambiguous 1:1 name matches that
require no taste call:

  * Shiori (Nana)   -> ``/files/images/shiori_pixel_portrait.png``  (exact name match)
  * Luna   (Tsukimi)-> ``/files/images/tsuki_portrait.png``         (tsuki = moon = Luna)

The other 6 broken avatars (Mika, Kaede, Yuki, Dae, Alana, etc.) are taste
calls — generate portraits via the Visual Content MVP pipeline or assign
manually. This script intentionally does NOT touch them.

Idempotent: only updates rows where ``avatar_url`` currently matches the
old broken value. Re-running after the fix is a no-op.

Usage::

    .venv/bin/python scripts/fix_avatar_urls.py            # apply
    .venv/bin/python scripts/fix_avatar_urls.py --dry-run  # show plan, no write
    WAIFU_DB_PATH=/path/to/app.db .venv/bin/python scripts/fix_avatar_urls.py

Example::

    $ .venv/bin/python scripts/fix_avatar_urls.py --dry-run
    [DRY] would set characters.avatar_url for id=8  Shiori (Nana)  -> /files/images/shiori_pixel_portrait.png
    [DRY] would set characters.avatar_url for id=11 Luna (Tsukimi) -> /files/images/tsuki_portrait.png
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "backend" / "storage" / "app.db"
IMAGES_DIR = REPO_ROOT / "backend" / "storage" / "images"

# Each tuple: (character_name_substring, expected_old_url, new_url, asset_filename)
# Matching by name substring rather than id makes the script robust to a
# differently-seeded database; matching expected_old_url makes it idempotent.
FIXES: list[tuple[str, str, str, str]] = [
    (
        "Shiori",
        "/files/avatars/Kitsune.vrm",
        "/files/images/shiori_pixel_portrait.png",
        "shiori_pixel_portrait.png",
    ),
    (
        "Luna",
        "/files/avatars/Kitsune.vrm",
        "/files/images/tsuki_portrait.png",
        "tsuki_portrait.png",
    ),
]


def main() -> int:
    """Apply the avatar-url corrections.

    Returns:
        0 on success (including dry-run), 1 if any expected asset is missing.
    """
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="Print plan without writing.")
    ap.add_argument(
        "--db",
        default=os.environ.get("WAIFU_DB_PATH", str(DEFAULT_DB)),
        help=f"SQLite path (default: {DEFAULT_DB} or $WAIFU_DB_PATH).",
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: db not found at {db_path}", file=sys.stderr)
        return 1

    # Pre-flight: every target asset must exist on disk.
    missing = [f for *_, f in FIXES if not (IMAGES_DIR / f).exists()]
    if missing:
        print(f"ERROR: portrait asset(s) missing in {IMAGES_DIR}: {missing}", file=sys.stderr)
        return 1

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        applied = 0
        skipped = 0
        for name_sub, expected_old, new_url, _asset in FIXES:
            row = con.execute(
                "SELECT id, name, avatar_url FROM characters WHERE name LIKE ?",
                (f"%{name_sub}%",),
            ).fetchone()
            if row is None:
                print(f"  no character matches name LIKE '%{name_sub}%' — skipping")
                skipped += 1
                continue
            if row["avatar_url"] != expected_old:
                # Already fixed, or hand-customized to something else — leave alone.
                print(
                    f"  id={row['id']:>2} {row['name']:<20} avatar_url='{row['avatar_url']}' "
                    f"!= expected '{expected_old}' — skipping (already fixed or customized)"
                )
                skipped += 1
                continue
            tag = "[DRY]" if args.dry_run else "[FIX]"
            print(
                f"  {tag} id={row['id']:>2} {row['name']:<20} -> {new_url}"
            )
            if not args.dry_run:
                con.execute(
                    "UPDATE characters SET avatar_url = ? WHERE id = ?",
                    (new_url, row["id"]),
                )
                applied += 1
        if not args.dry_run:
            con.commit()
        print(f"\nDone. applied={applied} skipped={skipped} dry_run={args.dry_run}")
    finally:
        con.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
