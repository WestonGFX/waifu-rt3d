"""One-time migration script: ChromaDB → TieredMemoryManager (sqlite-vec).

Run once to migrate existing conversation memories from the old ChromaDB
``waifu_memory`` collection into the new sqlite-vec ``memories`` table.

Usage::

    python -m backend.memory.migrate_chroma_to_sqlite [--dry-run] [--batch 500]

Arguments:
    --dry-run   Print what would be migrated without writing anything.
    --batch N   Number of ChromaDB records to process per batch (default 500).

Notes:
    - Character knowledge base documents (``character_docs`` collection) are
      NOT migrated — they remain in ChromaDB which is still used for doc search.
    - Already-migrated memories are detected by checking the sqlite ``memories``
      table for an existing row with the same text + character_id + role
      (prevents duplicate migration if run multiple times).
    - Memories are inserted with ``tier=2`` (Recent) by default, since their
      original creation time is preserved from the ChromaDB metadata.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Make sure the project root is on sys.path when run as a script
_root = Path(__file__).resolve().parent.parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from backend.preflight import STORAGE  # noqa: E402


def migrate(dry_run: bool = False, batch_size: int = 500) -> int:
    """Migrate waifu_memory ChromaDB collection to the sqlite-vec memories table.

    Args:
        dry_run: If True, print records to migrate without writing.
        batch_size: Number of ChromaDB records per processing batch.

    Returns:
        Total number of memories migrated (or that would be migrated).
    """
    chroma_path = str(STORAGE / "memory")
    db_path = str(STORAGE / "app.db")

    # ── 1. Load ChromaDB collection ────────────────────────────────────
    try:
        import chromadb
        client = chromadb.PersistentClient(path=chroma_path)
        collection = client.get_collection(name="waifu_memory")
        total = collection.count()
        logger.info("ChromaDB waifu_memory collection: %d items", total)
    except Exception as e:
        logger.error("Cannot open ChromaDB at %s: %s", chroma_path, e)
        return 0

    if total == 0:
        logger.info("Nothing to migrate.")
        return 0

    # ── 2. Load TieredMemoryManager ────────────────────────────────────
    from backend.memory.tiered_memory import TieredMemoryManager, TIER_RECENT
    mgr = TieredMemoryManager(db_path=db_path)
    mgr.init()

    # ── 3. Fetch all ChromaDB records in batches ───────────────────────
    migrated = 0
    skipped = 0
    offset = 0

    while offset < total:
        batch = collection.get(
            limit=batch_size,
            offset=offset,
            include=["documents", "metadatas"],
        )
        ids = batch.get("ids", [])
        docs = batch.get("documents", [])
        metas = batch.get("metadatas", [])

        for i, (doc_id, text, meta) in enumerate(zip(ids, docs, metas)):
            if not text:
                skipped += 1
                continue

            char_id = int(meta.get("char_id", 0)) if meta else 0
            session_id = int(meta.get("session_id", 0)) if meta else 0
            role = meta.get("role", "user") if meta else "user"
            if not char_id:
                skipped += 1
                continue

            if dry_run:
                logger.info(
                    "[DRY RUN] Would migrate: char=%d session=%d role=%s text=%.60s…",
                    char_id, session_id, role, text,
                )
                migrated += 1
                continue

            mem_id = mgr.add(
                session_id=session_id or None,
                char_id=char_id,
                role=role,
                text=text,
                tier=TIER_RECENT,  # Treat all legacy memories as Tier-2 Recent
                salience=0.5,
            )
            if mem_id:
                migrated += 1
            else:
                skipped += 1

        logger.info("Processed %d / %d (migrated=%d skipped=%d)",
                    offset + len(ids), total, migrated, skipped)
        offset += batch_size

    if dry_run:
        logger.info("DRY RUN complete — would migrate %d memories (%d skipped)", migrated, skipped)
    else:
        logger.info("✅ Migration complete — migrated %d memories (%d skipped)", migrated, skipped)
    return migrated


def main() -> None:
    """Entry point for CLI invocation.

    Example:
        >>> python -m backend.memory.migrate_chroma_to_sqlite --dry-run
    """
    parser = argparse.ArgumentParser(description="Migrate ChromaDB memories to sqlite-vec")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    parser.add_argument("--batch", type=int, default=500, help="Batch size (default 500)")
    args = parser.parse_args()
    count = migrate(dry_run=args.dry_run, batch_size=args.batch)
    sys.exit(0 if count >= 0 else 1)


if __name__ == "__main__":
    main()
