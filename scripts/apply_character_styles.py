#!/usr/bin/env python3
"""Apply approved per-character image styles from the draft JSON to the DB.

Reads ``backend/characters/builtin_image_styles.draft.json`` (produced by
``scripts/draft_character_styles.py`` and edited by the human reviewer), then
writes each entry to the ``characters.image_style`` column as a JSON string.
This is the "after approval" half of the decision #2 workflow in
``docs/plans/2026-05-06-visual-content-in-chat-scoping.md``.

The draft file is keyed by ``char_id`` string. Each entry has the schema
``{"positive": str, "negative": str, "lora": str | null}``. Rows whose
``positive`` is empty (or sentinel) are skipped — the user may zero out a
row to opt the character out of style application.

Usage:
    .venv/bin/python scripts/apply_character_styles.py
    .venv/bin/python scripts/apply_character_styles.py --input <path>
    .venv/bin/python scripts/apply_character_styles.py --dry-run

Environment:
    WAIFU_DB_PATH: optional override for the SQLite database file. Defaults
        to ``<repo_root>/backend/storage/app.db``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DRAFT = ROOT / "backend" / "characters" / "builtin_image_styles.draft.json"
DEFAULT_DB = ROOT / "backend" / "storage" / "app.db"

logger = logging.getLogger("apply_character_styles")


def main(argv: list[str] | None = None) -> int:
    """Apply the draft JSON to ``characters.image_style`` and return exit code.

    Args:
        argv: Optional argv override (for tests).

    Returns:
        0 on success, 1 on missing draft file, 2 on DB error.
    """
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--input", type=Path, default=DEFAULT_DRAFT,
                        help="Path to the draft JSON (default: %(default)s)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would change without writing to the DB")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if not args.input.exists():
        logger.error("Draft file not found: %s", args.input)
        logger.error("Run scripts/draft_character_styles.py first.")
        return 1

    try:
        draft = json.loads(args.input.read_text())
    except json.JSONDecodeError as exc:
        logger.error("Draft JSON malformed at %s: %s", args.input, exc)
        return 1

    db_path = Path(os.environ.get("WAIFU_DB_PATH", str(DEFAULT_DB)))
    if not db_path.exists():
        logger.error("Database not found: %s", db_path)
        return 2

    applied = 0
    skipped = 0
    con = sqlite3.connect(db_path)
    try:
        for key, entry in draft.items():
            try:
                char_id = int(key)
            except (TypeError, ValueError):
                logger.warning("Skipping non-integer key: %r", key)
                skipped += 1
                continue
            positive = (entry or {}).get("positive", "").strip()
            if not positive:
                logger.info("[%s] empty positive — skipped", char_id)
                skipped += 1
                continue
            payload = json.dumps({
                "positive": positive,
                "negative": (entry.get("negative") or "").strip(),
                "lora": entry.get("lora"),
            })
            if args.dry_run:
                logger.info("[%s] would write: %s", char_id, payload[:80])
            else:
                con.execute(
                    "UPDATE characters SET image_style = ? WHERE id = ?",
                    (payload, char_id),
                )
            applied += 1
        if not args.dry_run:
            con.commit()
    finally:
        con.close()

    verb = "would apply" if args.dry_run else "applied"
    logger.info("Done: %s %d / skipped %d", verb, applied, skipped)
    return 0


if __name__ == "__main__":
    sys.exit(main())
