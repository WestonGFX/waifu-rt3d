"""SillyTavern Character Card (CHARA v2) read/write utilities.

Character cards are PNG images with a ``tEXt`` chunk (key ``chara``) that
contains a base64-encoded JSON payload conforming to the CHARA v2 spec.
Older cards may store the same payload in the EXIF ``UserComment`` field.

This module provides two classes:

- :class:`CharaCardReader`: Reads a PNG card and returns a normalised dict
  mapping CHARA v2 fields to the app's character schema.
- :class:`CharaCardWriter`: Embeds character data into a PNG image as a
  CHARA v2 tEXt chunk.

CHARA v2 field mapping:
    name        → characters.name
    description + personality + scenario → characters.background (joined)
    first_mes   → characters.greeting_message
    system_prompt → characters.system_prompt
    mes_example → appended to characters.backstory
    creator_notes → characters.creator_notes (metadata)
    tags        → characters.tags (metadata)
"""

from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any

from PIL import Image, PngImagePlugin

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
            Dict with keys: ``name``, ``background``, ``system_prompt``,
            ``greeting_message``, ``backstory``, ``creator_notes``, ``tags``,
            ``raw_chara`` (the full CHARA v2 payload).

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
                return json.loads(base64.b64decode(raw_b64 + "==").decode("utf-8", errors="replace"))
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

        Args:
            card: Parsed CHARA JSON.

        Returns:
            Normalised dict ready for database insertion.
        """
        # v2 spec wraps everything in 'data'
        data: dict = card.get("data", card)

        name = str(data.get("name", "Imported Character")).strip()

        # Combine description + personality + scenario into background
        parts = [
            data.get("description", ""),
            data.get("personality", ""),
            data.get("scenario", ""),
        ]
        background = "\n\n".join(p for p in parts if p and p.strip())

        system_prompt = str(data.get("system_prompt", "") or "").strip()
        greeting_message = str(data.get("first_mes", "") or "").strip()

        # Example messages → stored as backstory note
        mes_example = str(data.get("mes_example", "") or "").strip()
        backstory = mes_example if mes_example else ""

        creator_notes = str(data.get("creator_notes", "") or "").strip()
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        return {
            "name": name,
            "background": background,
            "system_prompt": system_prompt,
            "greeting_message": greeting_message,
            "backstory": backstory,
            "creator_notes": creator_notes,
            "tags": tags,
            "raw_chara": card,
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

        Args:
            char_data: Dict with keys name, background, system_prompt,
                greeting_message, backstory, creator_notes, tags.

        Returns:
            CHARA v2 compliant dict.
        """
        name = str(char_data.get("name", "Character") or "Character").strip()
        background = str(char_data.get("background", "") or "").strip()
        system_prompt = str(char_data.get("system_prompt", "") or "").strip()
        greeting = str(char_data.get("greeting_message", "") or "").strip()
        backstory = str(char_data.get("backstory", "") or "").strip()
        creator_notes = str(char_data.get("creator_notes", "") or "").strip()
        tags = char_data.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        return {
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": name,
                "description": background,
                "personality": "",
                "scenario": "",
                "first_mes": greeting,
                "mes_example": backstory,
                "system_prompt": system_prompt,
                "creator_notes": creator_notes,
                "tags": tags,
                "post_history_instructions": "",
                "character_book": None,
            },
        }
