#!/usr/bin/env python3
"""Draft per-character image_style entries for the 13 builtin characters.

Reads each character's ``system_prompt`` from the live SQLite database, asks
the configured LLM to translate that personality into a Stable-Diffusion-style
positive / negative prompt prefix, and writes the result to
``backend/characters/builtin_image_styles.draft.json`` for human review.

The script is intentionally **read-only against the characters table** — the
draft file is the artifact, the human review is the gate, and a separate
follow-up script (``scripts/apply_character_styles.py``, not yet authored) is
responsible for the eventual ``UPDATE characters SET image_style = ?``.

This is the "AI-drafted, user reviews before commit" half of decision #2 in
``docs/plans/2026-05-06-visual-content-in-chat-scoping.md`` — the script
produces every entry, the user edits any row in the JSON, then runs the apply
helper.

Usage:
    .venv/bin/python scripts/draft_character_styles.py              # all characters
    .venv/bin/python scripts/draft_character_styles.py --char-id 1  # one character
    .venv/bin/python scripts/draft_character_styles.py --dry-run    # no LLM call

Environment:
    WAIFU_DB_PATH: optional override for the SQLite database file. Defaults to
        ``<repo_root>/backend/storage/app.db``.

Example:
    >>> # From repo root, with LM Studio reachable per app.json:
    >>> .venv/bin/python scripts/draft_character_styles.py
    Drafting style for 13 characters...
    [1] Alana          | anime, soft cel shading, warm lighting, ...
    [2] Rin            | anime, dramatic lighting, sharp lineart, ...
    ...
    Wrote 13 entries to backend/characters/builtin_image_styles.draft.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Imported after sys.path adjustment so `python scripts/...` works without `pip install -e .`.
from backend.llm.registry import get_client  # noqa: E402

logger = logging.getLogger("draft_character_styles")

DEFAULT_DB_PATH = ROOT / "backend" / "storage" / "app.db"
CONFIG_PATH = ROOT / "backend" / "config" / "app.json"
OUTPUT_PATH = ROOT / "backend" / "characters" / "builtin_image_styles.draft.json"

# Module-level prompt — kept here so the draft method is reproducible and
# diffable across runs. Tweak this prompt, not the per-character output, when
# a whole-cohort style direction needs to shift (e.g. switching from cel-shaded
# anime to semi-realistic).
STYLE_DRAFT_PROMPT = """\
You translate character personalities into Stable-Diffusion / ComfyUI prompt
prefixes for an anime-companion app.

Read the character system prompt below and output ONLY a single-line JSON
object with three keys:

  - "positive": comma-separated prompt tags that capture the character's visual
    identity (art style, hair, eye color, signature outfit, mood, lighting).
    Aim for 8-14 short tags. Lead with art style ("anime, cel shading" or
    similar) so the renderer locks the look.
  - "negative": comma-separated tags to suppress (e.g. "realistic, photo,
    deformed, extra limbs, low quality"). 4-8 tags is plenty.
  - "lora": null. The user will fill this in manually if a LoRA is desired.

Output JSON only — no prose, no markdown fences, no explanation. The first
character of your reply must be `{` and the last must be `}`.

Character system prompt:
---
{system_prompt}
---
"""


def load_app_config() -> dict:
    """Load ``backend/config/app.json`` exactly the way the server does.

    Returns:
        The parsed config dict, or ``{}`` if the file is missing/malformed.
        A missing config is non-fatal — ``get_client`` falls back to
        ``OpenAICompatAdapter`` against the WAIFU_LLM_ENDPOINT env var.
    """
    if not CONFIG_PATH.exists():
        logger.warning("config not found at %s — using empty defaults", CONFIG_PATH)
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("config load failed (%s) — using empty defaults", exc)
        return {}


def fetch_characters(db_path: Path, char_id: int | None = None) -> list[dict]:
    """Read ``id, name, system_prompt`` from the characters table.

    Args:
        db_path: Absolute path to the SQLite database file.
        char_id: Optional single-character filter. ``None`` returns all rows.

    Returns:
        List of dicts with keys ``{"id", "name", "system_prompt"}``. Empty when
        the table is empty or the filter matches no rows.

    Raises:
        FileNotFoundError: If the database file does not exist.
        sqlite3.Error: If the table or required columns are missing.
    """
    if not db_path.exists():
        raise FileNotFoundError(f"database not found at {db_path}")
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        con.row_factory = sqlite3.Row
        if char_id is not None:
            cur = con.execute(
                "SELECT id, name, system_prompt FROM characters WHERE id = ?",
                (char_id,),
            )
        else:
            cur = con.execute(
                "SELECT id, name, system_prompt FROM characters ORDER BY id ASC"
            )
        return [dict(r) for r in cur.fetchall()]
    finally:
        con.close()


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_style_reply(reply: str) -> dict:
    """Extract the JSON object from an LLM reply, tolerating prose padding.

    The prompt asks for raw JSON, but local models occasionally wrap it in
    code fences or trailing commentary. This helper grabs the first
    ``{...}`` block and parses it; on any error it returns a sentinel dict
    with empty strings rather than raising, so a single bad row does not
    abort the whole batch.

    Args:
        reply: The raw ``chat()`` reply string from the LLM adapter.

    Returns:
        Dict with at least ``{"positive": str, "negative": str, "lora": None}``.
        Always coerces to those keys even if the model returned extras.

    Example:
        >>> parse_style_reply('Sure! {"positive": "anime", "negative": "realistic", "lora": null}')
        {'positive': 'anime', 'negative': 'realistic', 'lora': None}
    """
    match = _JSON_OBJECT_RE.search(reply or "")
    if not match:
        return {"positive": "", "negative": "", "lora": None}
    try:
        obj = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"positive": "", "negative": "", "lora": None}
    return {
        "positive": str(obj.get("positive", "")).strip(),
        "negative": str(obj.get("negative", "")).strip(),
        "lora": obj.get("lora") if obj.get("lora") else None,
    }


def draft_one(adapter, model: str, endpoint: str, api_key: str, system_prompt: str) -> dict:
    """Call the LLM once for a single character's system prompt.

    Args:
        adapter: An ``LLMAdapter`` instance from ``backend.llm.registry.get_client``.
        model: Model identifier passed to ``adapter.chat``.
        endpoint: Base URL for the LLM endpoint.
        api_key: API key string (may be empty for local LM Studio).
        system_prompt: The character's system prompt text.

    Returns:
        Style dict with ``positive``, ``negative``, ``lora`` keys. Empty strings
        on adapter failure (the batch keeps going; the user can re-run for the
        affected row).
    """
    user_msg = STYLE_DRAFT_PROMPT.replace("{system_prompt}", system_prompt or "(empty)")
    messages = [
        {"role": "system", "content": "You output strict JSON. No prose."},
        {"role": "user", "content": user_msg},
    ]
    try:
        result = adapter.chat(
            messages,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
            temperature=0.4,  # mild diversity, but keep tags grounded
            max_tokens=4096,  # thinking models burn budget on reasoning_content
        )
    except Exception as exc:  # noqa: BLE001 — wide net is intentional here
        logger.error("LLM chat failed: %s", exc)
        return {"positive": "", "negative": "", "lora": None}
    if not result or not result.get("ok"):
        logger.error("LLM returned non-ok: %s", result)
        return {"positive": "", "negative": "", "lora": None}
    return parse_style_reply(result.get("reply", ""))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        argv: Optional argv override (for tests). ``None`` uses ``sys.argv``.

    Returns:
        Parsed namespace with ``char_id``, ``dry_run``, ``output``.
    """
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--char-id",
        type=int,
        default=None,
        help="Draft style for a single character ID instead of all 13.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip LLM calls; emit empty placeholder entries for each character.",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output JSON path (default: {OUTPUT_PATH.relative_to(ROOT)})",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Entry point.

    Returns:
        Process exit code: 0 on success, 1 on fatal error (DB missing, no
        characters found). Per-row LLM failures are logged but do not abort.
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)

    db_path = Path(os.environ.get("WAIFU_DB_PATH") or DEFAULT_DB_PATH)
    try:
        characters = fetch_characters(db_path, args.char_id)
    except (FileNotFoundError, sqlite3.Error) as exc:
        logger.error("could not read characters: %s", exc)
        return 1
    if not characters:
        logger.error("no characters found at %s", db_path)
        return 1

    cfg = load_app_config()
    llm_cfg = cfg.get("llm", {})
    model = llm_cfg.get("model", "")
    endpoint = llm_cfg.get("endpoint", "http://localhost:1234/v1")
    api_key = llm_cfg.get("api_key", "")
    adapter = get_client(cfg) if not args.dry_run else None

    logger.info("Drafting style for %d character(s)...", len(characters))
    out: dict[str, dict] = {}
    for ch in characters:
        cid, name, sp = ch["id"], ch["name"], ch.get("system_prompt") or ""
        if args.dry_run:
            entry = {"positive": "", "negative": "", "lora": None}
        else:
            entry = draft_one(adapter, model, endpoint, api_key, sp)
        out[str(cid)] = entry
        positive_preview = (entry["positive"] or "(empty)")[:80]
        print(f"[{cid:>2}] {name:<14} | {positive_preview}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        display_path = args.output.relative_to(ROOT)
    except ValueError:
        display_path = args.output  # output lives outside the repo; show absolute
    logger.info("Wrote %d entries to %s", len(out), display_path)
    logger.info("Review the file by hand before running scripts/apply_character_styles.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
