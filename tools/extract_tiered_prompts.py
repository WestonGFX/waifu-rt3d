#!/usr/bin/env python3
"""Extract tiered prompts from character doc packs.

Reads docs/characters/*/03_prompt_pack.md files, parses <!-- TIER: X --> markers,
and produces two prompt variants per character:

  - system_prompt (full):  All tiers concatenated (CORE + EXTENDED + DEEP)
  - system_prompt_lite:    CORE tier only (~800-1500 tokens)

The tier system solves a context-window budget problem: a user with a 7B model
(8K context) shouldn't lose 37% of their window to a 3,000-token personality
prompt. CORE-only mode gives them a ~1,000-token prompt that preserves the
character's identity, voice, and essential rules.

Usage:
    python tools/extract_tiered_prompts.py                    # Update database
    python tools/extract_tiered_prompts.py --dry-run          # Preview without writes
    python tools/extract_tiered_prompts.py --character rin    # Single character
    python tools/extract_tiered_prompts.py --stats            # Token count report

Example:
    >>> python tools/extract_tiered_prompts.py --stats
    Character           Full (tokens)  Lite (tokens)  Reduction
    ─────────────────────────────────────────────────────────────
    Raine (Amemiya)         3,400          1,200        65%
    Rin (Akane)             2,500          1,100        56%
    Genki (Kitsune)         1,400            900        36%
    ...
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

# ── Constants ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHARACTERS_DIR = PROJECT_ROOT / "docs" / "characters"
DB_PATH = PROJECT_ROOT / "backend" / "storage" / "app.db"

# Matches <!-- TIER: CORE -->, <!-- TIER: EXTENDED -->, <!-- TIER: DEEP -->
TIER_PATTERN = re.compile(r"<!--\s*TIER:\s*(CORE|EXTENDED|DEEP)\s*-->")

# Maps directory names to DB character names (for lookup)
DIR_TO_CHAR_NAME: dict[str, str] = {
    "rin": "Rin (Akane)",
    "raine": "Tsundere (Raine)",
    "ayane": "Ayane (Yuki)",
    "genki": "Genki (Kitsune)",
    "hana": "Hana (Momoka)",
    "sable": "Sable (Kuroha)",
    "shiori": "Shiori (Nana)",
    "mika": "Mika (Mikazuki)",
    "kaede": "Kaede (Suzuha)",
    "luna": "Luna (Tsukimi)",
    "yuki": "Yuki (Shirayuki)",
    "dae": "Dae (Neciridae)",
    "alana": "Alana Calloway",
}


# ── Parsing ────────────────────────────────────────────────────────────────────

def extract_prompt_text(md_content: str) -> str:
    """Extract the system prompt from a prompt pack markdown file.

    The prompt is inside the first fenced code block (``` ... ```).

    Args:
        md_content: Raw markdown content of the prompt pack file.

    Returns:
        The prompt text (without the ``` fences).

    Raises:
        ValueError: If no fenced code block is found.
    """
    # Find content between first pair of ``` markers
    blocks = re.findall(r"```\n?(.*?)```", md_content, re.DOTALL)
    if not blocks:
        raise ValueError("No fenced code block found in prompt pack")
    return blocks[0].strip()


def parse_tiers(text: str) -> dict[str, str]:
    """Split a prompt into tier sections based on <!-- TIER: X --> markers.

    Args:
        text: Prompt text (may or may not contain tier markers).

    Returns:
        Dict with keys 'CORE', 'EXTENDED', 'DEEP' mapping to their content.
        If no markers found, returns {'CORE': text} (entire text is CORE).

    Example:
        >>> tiers = parse_tiers("<!-- TIER: CORE -->\\nHello\\n<!-- TIER: EXTENDED -->\\nWorld")
        >>> tiers['CORE']
        'Hello'
        >>> tiers['EXTENDED']
        'World'
    """
    matches = list(TIER_PATTERN.finditer(text))

    if not matches:
        # No tier markers — treat entire text as CORE
        return {"CORE": text.strip()}

    tiers: dict[str, str] = {}
    for i, match in enumerate(matches):
        tier_name = match.group(1)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            tiers[tier_name] = content

    return tiers


def estimate_tokens(text: str) -> int:
    """Rough token count using chars // 4 heuristic.

    Matches tiktoken within ~10% for English text. This is the same
    heuristic used in backend/llm/token_counter.py as a fallback.

    Args:
        text: Input text to estimate token count for.

    Returns:
        Estimated token count.
    """
    return len(text) // 4


def build_lite_prompt(tiers: dict[str, str]) -> str:
    """Build the lite prompt from CORE tier only.

    Args:
        tiers: Dict of tier_name → content from parse_tiers().

    Returns:
        CORE tier content, or empty string if no CORE tier.
    """
    return tiers.get("CORE", "").strip()


def build_full_prompt(tiers: dict[str, str]) -> str:
    """Build the full prompt from all tiers concatenated.

    Args:
        tiers: Dict of tier_name → content from parse_tiers().

    Returns:
        All tier contents joined with double newlines, in order.
    """
    parts = []
    for tier in ["CORE", "EXTENDED", "DEEP"]:
        if tier in tiers:
            parts.append(tiers[tier].strip())
    return "\n\n".join(parts)


# ── Database ───────────────────────────────────────────────────────────────────

def update_database(char_name: str, lite_prompt: str, db_path: Path = DB_PATH) -> bool:
    """Write system_prompt_lite to the characters table.

    Args:
        char_name: Character name as stored in the DB (e.g., "Rin (Akane)").
        lite_prompt: The CORE-only prompt text.
        db_path: Path to the SQLite database.

    Returns:
        True if a row was updated, False if character not found.
    """
    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(
            "UPDATE characters SET system_prompt_lite = ? WHERE name = ?",
            (lite_prompt, char_name),
        )
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def process_character(
    dir_name: str,
    dry_run: bool = False,
    verbose: bool = False,
) -> dict | None:
    """Process a single character's prompt pack.

    Args:
        dir_name: Character directory name (e.g., "rin", "raine").
        dry_run: If True, don't write to database.
        verbose: If True, print detailed output.

    Returns:
        Dict with character stats, or None if file not found.

    Example:
        >>> result = process_character("rin", dry_run=True)
        >>> result["full_tokens"]
        2500
    """
    prompt_path = CHARACTERS_DIR / dir_name / "03_prompt_pack.md"
    if not prompt_path.exists():
        print(f"  ⚠ {dir_name}: 03_prompt_pack.md not found, skipping")
        return None

    char_name = DIR_TO_CHAR_NAME.get(dir_name)
    if not char_name:
        print(f"  ⚠ {dir_name}: no DB name mapping, skipping")
        return None

    md_content = prompt_path.read_text(encoding="utf-8")

    try:
        prompt_text = extract_prompt_text(md_content)
    except ValueError as e:
        print(f"  ⚠ {dir_name}: {e}")
        return None

    tiers = parse_tiers(prompt_text)
    lite = build_lite_prompt(tiers)
    full = build_full_prompt(tiers)

    full_tokens = estimate_tokens(full)
    lite_tokens = estimate_tokens(lite) if lite else 0
    reduction = (1 - lite_tokens / full_tokens) * 100 if full_tokens > 0 and lite_tokens > 0 else 0

    result = {
        "dir_name": dir_name,
        "char_name": char_name,
        "tiers_found": list(tiers.keys()),
        "full_tokens": full_tokens,
        "lite_tokens": lite_tokens,
        "reduction_pct": reduction,
        "has_markers": len(tiers) > 1,
    }

    if verbose:
        print(f"\n  {char_name}:")
        print(f"    Tiers found: {', '.join(tiers.keys())}")
        print(f"    Full: {full_tokens:,} tokens ({len(full):,} chars)")
        print(f"    Lite: {lite_tokens:,} tokens ({len(lite):,} chars)")
        print(f"    Reduction: {reduction:.0f}%")

    if lite and not dry_run:
        updated = update_database(char_name, lite)
        if verbose:
            status = "✅ DB updated" if updated else "⚠ Not found in DB"
            print(f"    {status}")

    return result


def print_stats_table(results: list[dict]) -> None:
    """Print a formatted stats table of all characters.

    Args:
        results: List of result dicts from process_character().
    """
    print("\n  Character              Full (tokens)  Lite (tokens)  Reduction  Markers")
    print("  " + "─" * 75)

    for r in sorted(results, key=lambda x: x["full_tokens"], reverse=True):
        marker_flag = "✅" if r["has_markers"] else "❌"
        lite_str = f'{r["lite_tokens"]:>5,}' if r["lite_tokens"] > 0 else "    —"
        reduction_str = f'{r["reduction_pct"]:>5.0f}%' if r["reduction_pct"] > 0 else "     —"
        print(
            f'  {r["char_name"]:<22} {r["full_tokens"]:>6,}         '
            f"{lite_str}       {reduction_str}      {marker_flag}"
        )


def main() -> None:
    """CLI entry point for tiered prompt extraction.

    Parses arguments and processes character prompt packs, optionally
    updating the database with lite prompts.
    """
    parser = argparse.ArgumentParser(
        description="Extract tiered prompts from character doc packs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without writing to database",
    )
    parser.add_argument(
        "--character",
        type=str,
        help="Process a single character by directory name (e.g., 'rin')",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show token count statistics table",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output per character",
    )

    args = parser.parse_args()

    if args.character:
        dirs = [args.character]
    else:
        dirs = sorted(DIR_TO_CHAR_NAME.keys())

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"\n  🔧 Tiered Prompt Extraction ({mode})")
    print(f"  Processing {len(dirs)} character(s)...\n")

    results = []
    for dir_name in dirs:
        result = process_character(
            dir_name,
            dry_run=args.dry_run,
            verbose=args.verbose or args.stats,
        )
        if result:
            results.append(result)

    if args.stats or args.verbose:
        print_stats_table(results)

    # Summary
    with_markers = sum(1 for r in results if r["has_markers"])
    without = sum(1 for r in results if not r["has_markers"])
    print(f"\n  Summary: {with_markers} with tier markers, {without} without (using full as CORE)")

    if without > 0 and not args.dry_run:
        print("  ⚠ Characters without markers use full prompt as lite — add tier markers for proper reduction")

    print()


if __name__ == "__main__":
    main()
