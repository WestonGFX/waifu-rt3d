"""SillyTavern Character Card (CHARA v2) read/write utilities.

Character cards are PNG images with a ``tEXt`` chunk (key ``chara``) that
contains a base64-encoded JSON payload conforming to the CHARA v2 spec.
Older cards may store the same payload in the EXIF ``UserComment`` field.

This module provides two classes:

- :class:`CharaCardReader`: Reads a PNG card and returns a normalised dict
  mapping CHARA v2 fields to the app's character schema.
- :class:`CharaCardWriter`: Embeds character data into a PNG image as a
  CHARA v2 tEXt chunk.

CHARA v2 field mapping (v68+ schema — individual fields preserved):
    name                     → characters.name
    description              → characters.chara_description
    personality              → (joined into characters.background for compat)
    scenario                 → characters.scenario
    first_mes                → characters.greeting_text
    alternate_greetings      → characters.alternate_greetings (JSON array)
    mes_example              → characters.mes_example
    system_prompt            → characters.system_prompt
    post_history_instructions → characters.post_history_instructions
    creator_notes            → characters.creator_notes
    tags                     → characters.chara_tags (JSON array)
    description+personality+scenario → characters.background (legacy joined)
"""

from __future__ import annotations

import base64
import io
import json
import logging
import zipfile
from typing import Any

from PIL import Image, PngImagePlugin

# Guard against decompression bombs — 50 million pixels (~7000x7000) is generous for an avatar
Image.MAX_IMAGE_PIXELS = 50_000_000

logger = logging.getLogger(__name__)


class CharaCardReader:
    """Read a SillyTavern CHARA v2 character card from a PNG file.

    Supports both tEXt chunk encoding (preferred) and EXIF UserComment
    fallback for older cards.

    Example:
        >>> reader = CharaCardReader()
        >>> data = reader.read('/path/to/card.png')
        >>> data['name']
        'Sakura'
    """

    def read(self, png_path: str) -> dict[str, Any]:
        """Parse a PNG character card and return normalised character data.

        Args:
            png_path: Absolute path to the PNG card file.

        Returns:
            Dict with keys: ``name``, ``background`` (legacy joined),
            ``chara_description``, ``scenario``, ``alternate_greetings``,
            ``mes_example``, ``post_history_instructions``, ``system_prompt``,
            ``greeting_message``, ``backstory`` (legacy), ``creator_notes``,
            ``chara_tags``, ``tags`` (alias), ``raw_chara``.

        Raises:
            ValueError: If no CHARA payload is found in the PNG.
        """
        img = Image.open(png_path)
        raw_json = self._extract_json(img)
        if not raw_json:
            raise ValueError("No CHARA v2 payload found in PNG (missing tEXt 'chara' chunk or EXIF UserComment)")
        return self._map_fields(raw_json)

    def read_bytes(self, png_bytes: bytes) -> dict[str, Any]:
        """Parse a PNG character card from raw bytes.

        Args:
            png_bytes: Raw PNG file contents.

        Returns:
            Same structure as :meth:`read`.

        Raises:
            ValueError: If no CHARA payload is found.
        """
        img = Image.open(io.BytesIO(png_bytes))
        raw_json = self._extract_json(img)
        if not raw_json:
            raise ValueError("No CHARA v2 payload found in PNG bytes")
        return self._map_fields(raw_json)

    def read_charx(self, charx_path: str) -> dict[str, Any]:
        """Parse a CHARX character card archive file.

        CHARX files are ZIP archives containing ``card.json`` (CCv3 payload)
        and an optional ``assets/`` directory.  This method extracts the JSON
        and delegates to :meth:`_map_fields`.

        Args:
            charx_path: Filesystem path to the ``.charx`` file.

        Returns:
            Same structure as :meth:`read`, including ``lorebook_entries``
            extracted from ``character_book`` if present.

        Raises:
            ValueError: If ``card.json`` is missing or contains no character data.
        """
        with open(charx_path, "rb") as fh:
            return self.read_charx_bytes(fh.read())

    def read_charx_bytes(self, charx_bytes: bytes) -> dict[str, Any]:
        """Parse a CHARX character card from raw bytes.

        Args:
            charx_bytes: Raw ``.charx`` (ZIP) file contents.

        Returns:
            Normalised character dict including ``lorebook_entries`` list.

        Raises:
            ValueError: If not a valid ZIP, ``card.json`` is missing, or
                the JSON has no character data.
        """
        try:
            with zipfile.ZipFile(io.BytesIO(charx_bytes)) as zf:
                names = zf.namelist()
                if "card.json" not in names:
                    raise ValueError("CHARX archive does not contain card.json")
                card_json = json.loads(zf.read("card.json").decode("utf-8"))
        except zipfile.BadZipFile as exc:
            raise ValueError(f"Not a valid CHARX archive: {exc}") from exc

        if not card_json:
            raise ValueError("card.json is empty")
        return self._map_fields(card_json)

    @staticmethod
    def _extract_json(img: Image.Image) -> dict | None:
        """Attempt to extract the CHARA JSON from a PNG image.

        Tries tEXt chunk first (``img.info['chara']``), then EXIF
        ``UserComment`` for backward compatibility.

        Args:
            img: PIL Image object (PNG).

        Returns:
            Parsed JSON dict, or None if no payload found.
        """
        # 1. tEXt chunk — most SillyTavern cards use this
        raw_b64 = img.info.get("chara", "")
        if raw_b64:
            try:
                padded = raw_b64 + "=" * (-len(raw_b64) % 4)
                return json.loads(base64.b64decode(padded).decode("utf-8", errors="replace"))
            except Exception as e:
                logger.debug("Failed to decode tEXt 'chara' chunk: %s", e)

        # 2. EXIF UserComment fallback (older cards / PNGs with embedded EXIF)
        try:
            exif_data = img.info.get("exif", b"")
            if exif_data and len(exif_data) > 8:
                # UserComment is typically: b"UNICODE\x00" + utf-16 bytes
                # Scan for JSON array/object opening
                for marker in (b"UNICODE\x00", b"ASCII\x00\x00\x00"):
                    idx = exif_data.find(marker)
                    if idx >= 0:
                        payload = exif_data[idx + len(marker):]
                        text = payload.decode("utf-16-le", errors="replace").strip("\x00")
                        return json.loads(text)
        except Exception as e:
            logger.debug("EXIF UserComment fallback failed: %s", e)

        return None

    @staticmethod
    def _map_fields(card: dict) -> dict[str, Any]:
        """Map CHARA v2 fields to the app's character schema.

        Handles both v2 (``spec: 'chara_card_v2'``) and v1 formats by
        looking for ``data`` sub-dict first, then falling back to top-level.

        Since v68, individual CHARA v2 fields are preserved in their own DB
        columns (``scenario``, ``chara_description``, ``alternate_greetings``,
        etc.).  The legacy ``background`` field is still populated for backward
        compatibility by joining description + personality + scenario.

        Args:
            card: Parsed CHARA JSON.

        Returns:
            Normalised dict ready for database insertion.  Contains both
            individual V2 fields and the legacy ``background`` join.
        """
        # v2 spec wraps everything in 'data'
        data: dict = card.get("data", card)

        name = str(data.get("name", "Imported Character")).strip()

        # Individual V2 fields (v68+)
        chara_description = str(data.get("description", "") or "").strip()
        personality = str(data.get("personality", "") or "").strip()
        scenario = str(data.get("scenario", "") or "").strip()

        # Legacy combined field — kept for backward compat with code that
        # reads personality_traits from the joined background string.
        parts = [chara_description, personality, scenario]
        background = "\n\n".join(p for p in parts if p)

        system_prompt = str(data.get("system_prompt", "") or "").strip()
        greeting_message = str(data.get("first_mes", "") or "").strip()

        # Example messages — stored in both mes_example (new) and backstory (legacy)
        mes_example = str(data.get("mes_example", "") or "").strip()
        backstory = mes_example if mes_example else ""

        # Post-history instructions (jailbreak / author's note)
        post_history_instructions = str(data.get("post_history_instructions", "") or "").strip()

        # Alternate greetings — array of alternative opening messages
        alternate_greetings = data.get("alternate_greetings", [])
        if not isinstance(alternate_greetings, list):
            alternate_greetings = []

        creator_notes = str(data.get("creator_notes", "") or "").strip()
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        # CCv3: extract character_book lorebook entries if present
        lorebook_entries: list[dict[str, Any]] = []
        character_book = data.get("character_book") or {}
        if isinstance(character_book, dict):
            for entry in character_book.get("entries", []):
                if not isinstance(entry, dict):
                    continue
                if not entry.get("enabled", True):
                    continue
                keys = entry.get("keys", [])
                if not isinstance(keys, list):
                    keys = []
                content = str(entry.get("content", "") or "").strip()
                if not content:
                    continue
                lorebook_entries.append({
                    "title": str(entry.get("name", "") or ", ".join(keys[:3])),
                    "content": content,
                    "keywords": keys,
                    "injection_position": "after_system_prompt",
                    "priority": int(entry.get("insertion_order", 0)),
                    "enabled": 1,
                })

        return {
            "name": name,
            # Legacy combined field
            "background": background,
            # Individual V2 fields (v68+)
            "chara_description": chara_description,
            "scenario": scenario,
            "alternate_greetings": alternate_greetings,
            "mes_example": mes_example,
            "post_history_instructions": post_history_instructions,
            "creator_notes": creator_notes,
            "chara_tags": tags,
            # Legacy aliases
            "system_prompt": system_prompt,
            "greeting_message": greeting_message,
            "backstory": backstory,
            "tags": tags,
            "raw_chara": card,
            # CCv3: lorebook entries (empty list for v2 cards)
            "lorebook_entries": lorebook_entries,
        }


class CharaCardWriter:
    """Embed character data into a PNG image as a CHARA v2 tEXt chunk.

    The output PNG contains the original image data plus a ``chara`` tEXt
    chunk with base64-encoded CHARA v2 JSON. This is compatible with
    SillyTavern, RisuAI, and other apps that support the CHARA v2 standard.

    Example:
        >>> writer = CharaCardWriter()
        >>> writer.write(char_data, avatar_bytes, '/tmp/my_char.png')
    """

    def write(
        self,
        char_data: dict[str, Any],
        avatar_bytes: bytes | None,
        output_path: str,
    ) -> None:
        """Write a character to a PNG file with an embedded CHARA v2 payload.

        Args:
            char_data: Dict with character fields (name, background, etc.).
            avatar_bytes: Raw bytes of the avatar image (PNG or JPEG).
                If None, a small placeholder image is used.
            output_path: Destination path for the output PNG.

        Example:
            >>> char = {"name": "Sakura", "background": "...", "system_prompt": "..."}
            >>> writer.write(char, open("avatar.png", "rb").read(), "/tmp/sakura.png")
        """
        payload = self._build_payload(char_data)
        b64 = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()

        if avatar_bytes:
            img = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
        else:
            # Minimal placeholder (400×600 gradient-ish)
            img = Image.new("RGBA", (400, 600), (180, 140, 200, 255))

        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("chara", b64)
        img.save(output_path, format="PNG", pnginfo=png_info)
        logger.info("[CharaCard] Written CHARA v2 card to %s (name=%r)", output_path, char_data.get("name"))

    def write_bytes(
        self,
        char_data: dict[str, Any],
        avatar_bytes: bytes | None,
    ) -> bytes:
        """Same as :meth:`write` but returns raw PNG bytes instead of writing a file.

        Args:
            char_data: Character data dict.
            avatar_bytes: Avatar image bytes, or None for a placeholder.

        Returns:
            Raw PNG file bytes with embedded CHARA v2 payload.
        """
        payload = self._build_payload(char_data)
        b64 = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()

        if avatar_bytes:
            img = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
        else:
            img = Image.new("RGBA", (400, 600), (180, 140, 200, 255))

        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("chara", b64)
        buf = io.BytesIO()
        img.save(buf, format="PNG", pnginfo=png_info)
        return buf.getvalue()

    @staticmethod
    def _build_payload(char_data: dict[str, Any]) -> dict[str, Any]:
        """Build a CHARA v2 JSON payload from character data.

        Since v68, individual V2 fields (``chara_description``, ``scenario``,
        ``alternate_greetings``, ``mes_example``, ``post_history_instructions``)
        are stored separately.  The writer prefers these dedicated columns and
        falls back to the legacy combined fields (``background``, ``backstory``)
        for backward compatibility with pre-v68 databases.

        Args:
            char_data: Dict with character fields from the DB row.  Supports
                both new individual keys and legacy combined keys.

        Returns:
            CHARA v2 compliant dict ready for JSON serialisation.
        """
        name = str(char_data.get("name", "Character") or "Character").strip()
        system_prompt = str(char_data.get("system_prompt", "") or "").strip()

        # Prefer individual V2 fields; fall back to legacy combined fields
        description = str(
            char_data.get("chara_description")
            or char_data.get("background", "")
            or ""
        ).strip()

        personality = str(char_data.get("personality_traits", "") or "").strip()
        # If personality_traits looks like a JSON array, convert to prose
        if personality.startswith("["):
            try:
                traits = json.loads(personality)
                if isinstance(traits, list):
                    personality = ", ".join(str(t) for t in traits)
            except (json.JSONDecodeError, TypeError):
                pass

        scenario = str(char_data.get("scenario", "") or "").strip()

        greeting = str(
            char_data.get("greeting_message")
            or char_data.get("greeting_text", "")
            or ""
        ).strip()

        mes_example = str(
            char_data.get("mes_example")
            or char_data.get("backstory", "")
            or ""
        ).strip()

        post_history = str(char_data.get("post_history_instructions", "") or "").strip()

        alternate_greetings = char_data.get("alternate_greetings", [])
        if isinstance(alternate_greetings, str):
            try:
                alternate_greetings = json.loads(alternate_greetings)
            except (json.JSONDecodeError, TypeError):
                alternate_greetings = []
        if not isinstance(alternate_greetings, list):
            alternate_greetings = []

        creator_notes = str(char_data.get("creator_notes", "") or "").strip()

        tags = char_data.get("chara_tags") or char_data.get("tags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except (json.JSONDecodeError, TypeError):
                tags = []
        if not isinstance(tags, list):
            tags = []

        return {
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": name,
                "description": description,
                "personality": personality,
                "scenario": scenario,
                "first_mes": greeting,
                "alternate_greetings": alternate_greetings,
                "mes_example": mes_example,
                "system_prompt": system_prompt,
                "creator_notes": creator_notes,
                "tags": tags,
                "post_history_instructions": post_history,
                "character_book": None,
            },
        }
