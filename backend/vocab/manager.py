"""
Vocabulary Manager for e-girl/VTuber/anime slang lexicon.

Loads the base vocabulary (2537 entries from v5.30) and user-added custom
entries, merges them, and provides query/filter/context generation for
LLM system prompt injection.

The base vocab is read-only. User additions are stored separately in
storage/vocab/user_vocab.json and can be exported/imported.

Example:
    >>> from backend.vocab.manager import VocabManager
    >>> vm = VocabManager()
    >>> vm.load()
    >>> context = vm.get_vocab_context(categories=["GenZ", "AnimeJP"], limit=30)
    >>> # Inject `context` into LLM system prompt
"""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("waifu.vocab")

# Paths
VOCAB_DIR = Path(__file__).parent
BASE_VOCAB_FILE = VOCAB_DIR / "egirl_vocab_v3.json"
STORAGE_DIR = Path(__file__).parent.parent / "storage" / "vocab"
USER_VOCAB_FILE = STORAGE_DIR / "user_vocab.json"


class VocabManager:
    """Manages base + user vocabulary entries with filtering and LLM context generation.

    Attributes:
        base_entries: List of base vocab entries (read-only, from v5.30 pack).
        user_entries: List of user-added custom entries (read/write).
        _all_entries: Merged list of base + user entries.
        _categories: Set of unique category names.
    """

    def __init__(self):
        self.base_entries: list[dict] = []
        self.user_entries: list[dict] = []
        self._all_entries: list[dict] = []
        self._categories: set[str] = set()
        self._loaded = False

    def load(self):
        """Load base vocab and user vocab from disk.

        Called once at server startup. Safe to call multiple times
        (reloads from disk each time).
        """
        self.base_entries = self._load_base()
        self.user_entries = self._load_user()
        self._merge()
        self._loaded = True
        logger.info(
            f"Vocab loaded: {len(self.base_entries)} base + "
            f"{len(self.user_entries)} user = {len(self._all_entries)} total, "
            f"{len(self._categories)} categories"
        )

    def _load_base(self) -> list[dict]:
        """Load the base vocabulary from egirl_vocab_v3.json.

        Returns:
            List of vocab entry dicts.
        """
        if not BASE_VOCAB_FILE.exists():
            logger.warning(f"Base vocab file not found: {BASE_VOCAB_FILE}")
            return []

        try:
            with open(BASE_VOCAB_FILE, "r", encoding="utf-8") as f:
                entries = json.load(f)
            # Tag each entry with source
            for e in entries:
                e["_source"] = "base"
            return entries
        except Exception as e:
            logger.error(f"Failed to load base vocab: {e}")
            return []

    def _load_user(self) -> list[dict]:
        """Load user-added vocabulary from storage/vocab/user_vocab.json.

        Returns:
            List of user vocab entry dicts, or empty list if file doesn't exist.
        """
        if not USER_VOCAB_FILE.exists():
            return []

        try:
            with open(USER_VOCAB_FILE, "r", encoding="utf-8") as f:
                entries = json.load(f)
            for e in entries:
                e["_source"] = "user"
            return entries
        except Exception as e:
            logger.error(f"Failed to load user vocab: {e}")
            return []

    def _save_user(self):
        """Persist user entries to disk."""
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        # Strip internal fields before saving
        clean = []
        for e in self.user_entries:
            entry = {k: v for k, v in e.items() if not k.startswith("_")}
            clean.append(entry)

        with open(USER_VOCAB_FILE, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2, ensure_ascii=False)

    def _merge(self):
        """Merge base + user entries. User entries override base by eg_id."""
        user_ids = {e.get("eg_id") for e in self.user_entries if e.get("eg_id")}
        # Base entries not overridden + all user entries
        self._all_entries = [
            e for e in self.base_entries if e.get("eg_id") not in user_ids
        ] + self.user_entries

        self._categories = {
            e.get("category", "Unknown") for e in self._all_entries if e.get("category")
        }

    @property
    def categories(self) -> list[str]:
        """Get sorted list of unique category names."""
        return sorted(self._categories)

    @property
    def total_count(self) -> int:
        """Total number of vocab entries (base + user)."""
        return len(self._all_entries)

    def search(self, query: str, limit: int = 50) -> list[dict]:
        """Search vocab entries by term, meaning, or category.

        Args:
            query: Search string (case-insensitive substring match).
            limit: Maximum results to return.

        Returns:
            List of matching vocab entries.
        """
        q = query.lower()
        results = []
        for e in self._all_entries:
            if (q in e.get("term", "").lower() or
                q in e.get("meaning", "").lower() or
                q in e.get("category", "").lower() or
                q in str(e.get("aliases", [])).lower()):
                results.append(e)
                if len(results) >= limit:
                    break
        return results

    def get_entries(
        self,
        category: Optional[str] = None,
        register: Optional[str] = None,
        emotion: Optional[str] = None,
        source: Optional[str] = None,
        page: int = 0,
        size: int = 50,
    ) -> tuple[list[dict], int]:
        """Get paginated, filtered vocab entries.

        Args:
            category: Filter by category (e.g. "GenZ", "AnimeJP").
            register: Filter by register (e.g. "cute", "edgy").
            emotion: Filter by emotion (e.g. "joy", "flirt").
            source: Filter by source ("base" or "user").
            page: Page number (0-indexed).
            size: Page size.

        Returns:
            Tuple of (entries_list, total_matching_count).
        """
        filtered = self._all_entries

        if category:
            filtered = [e for e in filtered if e.get("category") == category]
        if register:
            filtered = [e for e in filtered if e.get("register") == register]
        if emotion:
            filtered = [e for e in filtered if e.get("emotion") == emotion]
        if source:
            filtered = [e for e in filtered if e.get("_source") == source]

        total = len(filtered)
        start = page * size
        return filtered[start:start + size], total

    def get_vocab_context(
        self,
        categories: Optional[list[str]] = None,
        limit: int = 40,
    ) -> str:
        """Generate a vocabulary context string for LLM system prompt injection.

        Selects a diverse sample of entries filtered by categories, formatted
        as a compact reference the LLM can use to flavor its responses.

        Args:
            categories: List of category names to include. None = all.
            limit: Maximum number of entries to include.

        Returns:
            Formatted string ready for system prompt injection.
        """
        pool = self._all_entries
        if categories:
            pool = [e for e in pool if e.get("category") in categories]

        if not pool:
            return ""

        # Sample diverse entries: take from each category proportionally
        if len(pool) > limit:
            # Group by category, take proportional samples
            by_cat: dict[str, list[dict]] = {}
            for e in pool:
                cat = e.get("category", "Other")
                by_cat.setdefault(cat, []).append(e)

            selected = []
            per_cat = max(1, limit // len(by_cat))
            for cat_entries in by_cat.values():
                # Take evenly spaced entries for diversity
                step = max(1, len(cat_entries) // per_cat)
                selected.extend(cat_entries[::step][:per_cat])

            pool = selected[:limit]

        # Format for LLM
        lines = []
        for e in pool:
            term = e.get("term", "")
            meaning = e.get("meaning", "")
            register = e.get("register", "")
            emotion = e.get("emotion", "")
            cat = e.get("category", "")

            line = f"- {term}: {meaning}"
            if register or emotion:
                tags = []
                if register:
                    tags.append(register)
                if emotion:
                    tags.append(emotion)
                line += f" ({', '.join(tags)})"
            lines.append(line)

        header = "\n[VOCABULARY_CONTEXT]\n"
        header += "Use the following slang/vocab naturally when it fits the conversation. "
        header += "Don't force them — only use terms that feel natural for the context:\n"
        return header + "\n".join(lines)

    def add_entry(self, entry: dict) -> dict:
        """Add a user vocabulary entry.

        Args:
            entry: Dict with at minimum 'term' and 'meaning' fields.

        Returns:
            The created entry with generated eg_id.
        """
        import hashlib
        import time

        # Generate unique ID
        hash_input = f"{entry.get('term', '')}{time.time()}"
        eg_id = f"user_{hashlib.md5(hash_input.encode()).hexdigest()[:8]}"

        full_entry = {
            "eg_id": eg_id,
            "term": entry.get("term", ""),
            "aliases": entry.get("aliases", []),
            "category": entry.get("category", "Custom"),
            "subcategories": entry.get("subcategories", []),
            "meaning": entry.get("meaning", ""),
            "pos": entry.get("pos", "noun"),
            "register": entry.get("register", "playful"),
            "emotion": entry.get("emotion", "neutral"),
            "language": entry.get("language", "en"),
            "_source": "user",
        }

        self.user_entries.append(full_entry)
        self._save_user()
        self._merge()
        return full_entry

    def update_entry(self, eg_id: str, updates: dict) -> Optional[dict]:
        """Update a user vocabulary entry.

        Args:
            eg_id: The entry ID to update.
            updates: Dict of fields to update.

        Returns:
            Updated entry, or None if not found / not user entry.
        """
        for entry in self.user_entries:
            if entry.get("eg_id") == eg_id:
                for k, v in updates.items():
                    if k not in ("eg_id", "_source"):
                        entry[k] = v
                self._save_user()
                self._merge()
                return entry
        return None

    def delete_entry(self, eg_id: str) -> bool:
        """Delete a user vocabulary entry.

        Args:
            eg_id: The entry ID to delete. Only user entries can be deleted.

        Returns:
            True if deleted, False if not found or is a base entry.
        """
        for i, entry in enumerate(self.user_entries):
            if entry.get("eg_id") == eg_id:
                self.user_entries.pop(i)
                self._save_user()
                self._merge()
                return True
        return False

    def export_user_vocab(self) -> list[dict]:
        """Export user vocabulary as a clean list (no internal fields).

        Returns:
            List of user entry dicts without _source field.
        """
        return [{k: v for k, v in e.items() if not k.startswith("_")} for e in self.user_entries]

    def import_user_vocab(self, entries: list[dict]) -> int:
        """Import vocabulary entries, adding them as user entries.

        Skips entries with eg_ids that already exist in user vocab.

        Args:
            entries: List of vocab entry dicts to import.

        Returns:
            Number of entries actually imported.
        """
        existing_ids = {e.get("eg_id") for e in self.user_entries}
        count = 0

        for entry in entries:
            eg_id = entry.get("eg_id")
            if eg_id and eg_id in existing_ids:
                continue
            entry["_source"] = "user"
            if not eg_id:
                import hashlib, time
                hash_input = f"{entry.get('term', '')}{time.time()}{count}"
                entry["eg_id"] = f"user_{hashlib.md5(hash_input.encode()).hexdigest()[:8]}"
            self.user_entries.append(entry)
            existing_ids.add(entry.get("eg_id"))
            count += 1

        if count > 0:
            self._save_user()
            self._merge()

        return count

    def get_stats(self) -> dict:
        """Get vocabulary statistics.

        Returns:
            Dict with counts by source, category breakdown, etc.
        """
        by_category: dict[str, int] = {}
        for e in self._all_entries:
            cat = e.get("category", "Unknown")
            by_category[cat] = by_category.get(cat, 0) + 1

        return {
            "total": len(self._all_entries),
            "base_count": len(self.base_entries),
            "user_count": len(self.user_entries),
            "categories": by_category,
            "category_count": len(self._categories),
        }
