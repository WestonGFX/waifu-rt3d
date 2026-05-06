"""Tests for the v71 per-character image-style resolver and its endpoint wiring.

Covers ``backend.image_gen.registry.resolve_character_style`` plus the
prompt-prepend behavior of the ``/api/image-gen/portrait`` endpoint when
the active character has a populated ``image_style`` JSON column.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.image_gen.registry import resolve_character_style


# --------------------------------------------------------------------------
# Helper unit tests
# --------------------------------------------------------------------------

def _seed_image_style(db_path: Path, char_id: int, style_json: str | None) -> None:
    """Add the image_style column if missing and write style_json for char_id.

    The conftest schema is shared across ~90 test files and does not declare
    ``image_style`` (since it predates v71); add the column lazily inside
    this test module so we don't disturb the shared baseline.
    """
    con = sqlite3.connect(db_path)
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()]
        if "image_style" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN image_style TEXT DEFAULT NULL")
        con.execute(
            "UPDATE characters SET image_style = ? WHERE id = ?",
            (style_json, char_id),
        )
        con.commit()
    finally:
        con.close()


class TestResolveCharacterStyle:
    """Unit tests for the ``resolve_character_style`` helper."""

    def test_returns_populated_style(self, db_path: Path) -> None:
        """Populated image_style → (positive, negative) tuple."""
        _seed_image_style(
            db_path,
            char_id=1,
            style_json=json.dumps(
                {"positive": "anime, cel shading", "negative": "realistic, photo"}
            ),
        )

        positive, negative = resolve_character_style(1, str(db_path))

        assert positive == "anime, cel shading"
        assert negative == "realistic, photo"

    def test_returns_empty_for_null_column(self, db_path: Path) -> None:
        """NULL image_style → ('', '')."""
        _seed_image_style(db_path, char_id=1, style_json=None)

        assert resolve_character_style(1, str(db_path)) == ("", "")

    def test_returns_empty_for_missing_char(self, db_path: Path) -> None:
        """Unknown char_id → ('', '')."""
        _seed_image_style(db_path, char_id=1, style_json=None)

        assert resolve_character_style(99, str(db_path)) == ("", "")

    def test_returns_empty_for_malformed_json(self, db_path: Path) -> None:
        """Malformed JSON → ('', '') — fail-soft."""
        _seed_image_style(db_path, char_id=1, style_json="not-valid-json{")

        assert resolve_character_style(1, str(db_path)) == ("", "")

    def test_returns_empty_for_none_char_id(self, db_path: Path) -> None:
        """char_id=None → ('', '') without touching the DB."""
        assert resolve_character_style(None, str(db_path)) == ("", "")

    def test_returns_empty_for_missing_db_file(self) -> None:
        """Non-existent DB path → ('', '') — never raises."""
        assert resolve_character_style(1, "/nonexistent/path.db") == ("", "")

    def test_partial_json_only_positive(self, db_path: Path) -> None:
        """JSON with only ``positive`` key → ('positive', '')."""
        _seed_image_style(
            db_path,
            char_id=1,
            style_json=json.dumps({"positive": "watercolor"}),
        )

        assert resolve_character_style(1, str(db_path)) == ("watercolor", "")

    def test_non_dict_json_returns_empty(self, db_path: Path) -> None:
        """Top-level JSON that is not an object → ('', '')."""
        _seed_image_style(db_path, char_id=1, style_json=json.dumps(["a", "b"]))

        assert resolve_character_style(1, str(db_path)) == ("", "")


# --------------------------------------------------------------------------
# Endpoint integration test
# --------------------------------------------------------------------------

class TestPortraitEndpointStylePrepend:
    """``/api/image-gen/portrait`` must prepend the character's positive style."""

    def test_portrait_endpoint_prepends_positive_style(
        self, client, server_module, db_path: Path
    ) -> None:
        """When character has image_style set, the prompt forwarded to the
        adapter must include the positive prefix; negative_prompt must
        include the negative prefix on the gen_cfg.
        """
        _seed_image_style(
            db_path,
            char_id=1,
            style_json=json.dumps(
                {"positive": "anime, cel shading", "negative": "realistic, photo"}
            ),
        )

        # Stub the adapter so we don't hit ComfyUI/EasyDiffusion. The patched
        # adapter is returned by ``get_image_gen`` via the resolver path used
        # in ``generate_portrait``.
        captured: dict = {}

        class _StubAdapter:
            def is_available(self) -> bool:
                return True

            def provider_name(self) -> str:
                return "stub"

            def generate(self, prompt: str, cfg: dict) -> dict:
                captured["prompt"] = prompt
                captured["cfg"] = cfg
                return {"ok": True, "url": "/files/images/test.png", "filename": "test.png"}

        with patch(
            "backend.image_gen.registry.get_image_gen", return_value=_StubAdapter()
        ):
            resp = client.post(
                "/api/image-gen/portrait",
                json={"prompt": "selfie", "character_id": 1},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True

        # Positive style prepended to prompt
        assert "anime, cel shading" in captured["prompt"]
        assert "selfie" in captured["prompt"]
        assert captured["prompt"].startswith("anime, cel shading,")

        # Negative style threaded into gen_cfg
        assert captured["cfg"].get("negative_prompt") == "realistic, photo"

    def test_portrait_endpoint_no_style_when_column_null(
        self, client, server_module, db_path: Path
    ) -> None:
        """When image_style is NULL, prompt is forwarded verbatim and
        negative_prompt is absent from gen_cfg.
        """
        _seed_image_style(db_path, char_id=1, style_json=None)

        captured: dict = {}

        class _StubAdapter:
            def is_available(self) -> bool:
                return True

            def provider_name(self) -> str:
                return "stub"

            def generate(self, prompt: str, cfg: dict) -> dict:
                captured["prompt"] = prompt
                captured["cfg"] = cfg
                return {"ok": True, "url": "/files/images/test.png", "filename": "test.png"}

        with patch(
            "backend.image_gen.registry.get_image_gen", return_value=_StubAdapter()
        ):
            resp = client.post(
                "/api/image-gen/portrait",
                json={"prompt": "selfie", "character_id": 1},
            )

        assert resp.status_code == 200, resp.text
        # Prompt unchanged (no style prepend)
        assert captured["prompt"] == "selfie"
        # No negative_prompt injected
        assert "negative_prompt" not in captured["cfg"]
