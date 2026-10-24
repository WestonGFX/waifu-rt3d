"""Tests for the ``_parse_quick_replies`` helper in ``backend/server.py``.

The chat-stream endpoint instructs the LLM to append a ``<quick_replies>``
block at the end of every reply. ``_parse_quick_replies`` extracts the
3 user-perspective suggestions and returns the cleaned reply with the block
stripped. These tests cover the canonical happy-path plus the formatting
variations local LLMs commonly emit.
"""

from __future__ import annotations

import pytest

from backend.server import (
    _QUICK_REPLIES_INSTRUCTION,
    _build_quick_replies_instruction,
    _parse_quick_replies,
    _reply_pills_count,
)


def test_canonical_block_extracts_three_replies() -> None:
    """Block with three plain lines yields three suggestions and clean reply."""
    text = (
        "I love watching the petals fall.\n"
        "<quick_replies>\n"
        "Me too, it's peaceful.\n"
        "What's your favorite season?\n"
        "Want to walk together?\n"
        "</quick_replies>"
    )
    replies, clean = _parse_quick_replies(text)
    assert replies == [
        "Me too, it's peaceful.",
        "What's your favorite season?",
        "Want to walk together?",
    ]
    assert clean == "I love watching the petals fall."


def test_no_block_returns_empty_and_unchanged_text() -> None:
    """Replies missing the block return empty list + original text intact."""
    text = "Just a normal reply with no metadata."
    replies, clean = _parse_quick_replies(text)
    assert replies == []
    assert clean == text


def test_block_with_bullet_prefixes_strips_them() -> None:
    """Some models prepend ``- ``, ``* ``, ``• `` or ``1. ``. Helper strips these."""
    text = (
        "Hi.\n"
        "<quick_replies>\n"
        "- Hey there!\n"
        "* What's new?\n"
        "1. Ready to chat?\n"
        "</quick_replies>"
    )
    replies, _ = _parse_quick_replies(text)
    assert replies == ["Hey there!", "What's new?", "Ready to chat?"]


def test_block_with_quoted_lines_strips_quotes() -> None:
    """Models sometimes wrap each line in quotes — those should be removed."""
    text = (
        "Test.\n"
        "<quick_replies>\n"
        "\"First option\"\n"
        "'Second option'\n"
        "Third option\n"
        "</quick_replies>"
    )
    replies, _ = _parse_quick_replies(text)
    assert replies == ["First option", "Second option", "Third option"]


def test_overlong_lines_filtered_out() -> None:
    """Lines longer than 80 chars are dropped (likely model misformat)."""
    long_line = "x" * 81
    text = (
        "Test.\n"
        "<quick_replies>\n"
        "Short one\n"
        f"{long_line}\n"
        "Another short\n"
        "Final\n"
        "</quick_replies>"
    )
    replies, _ = _parse_quick_replies(text)
    # Long line dropped; first 3 valid lines remain.
    assert replies == ["Short one", "Another short", "Final"]


def test_caps_at_three_replies_when_model_emits_more() -> None:
    """If the model emits >3 lines, we truncate to the first 3."""
    text = (
        "Test.\n"
        "<quick_replies>\n"
        "One\nTwo\nThree\nFour\nFive\n"
        "</quick_replies>"
    )
    replies, _ = _parse_quick_replies(text)
    assert replies == ["One", "Two", "Three"]


def test_case_insensitive_tag_matching() -> None:
    """Matching is case-insensitive — guards against e.g. ``<Quick_Replies>``."""
    text = "Hi.\n<QUICK_REPLIES>\nHey\nYo\nHello\n</QUICK_REPLIES>"
    replies, clean = _parse_quick_replies(text)
    assert replies == ["Hey", "Yo", "Hello"]
    assert clean == "Hi."


def test_block_falls_back_to_original_when_strip_leaves_empty() -> None:
    """If the entire reply was the block, clean falls back to original text."""
    text = "<quick_replies>\nA\nB\nC\n</quick_replies>"
    replies, clean = _parse_quick_replies(text)
    assert replies == ["A", "B", "C"]
    # No surrounding text — clean should fall back to original (avoid empty string).
    assert clean == text


def test_blank_lines_inside_block_are_ignored() -> None:
    """Blank lines between suggestions don't count toward the 3-cap or output."""
    text = (
        "Test.\n"
        "<quick_replies>\n"
        "\n"
        "First\n"
        "\n"
        "Second\n"
        "Third\n"
        "</quick_replies>"
    )
    replies, _ = _parse_quick_replies(text)
    assert replies == ["First", "Second", "Third"]


def test_max_replies_two_caps_output() -> None:
    """With ``max_replies=2`` (user picked 2 pills) only the first two are kept."""
    text = "Hi.\n<quick_replies>\nOne\nTwo\nThree\n</quick_replies>"
    replies, clean = _parse_quick_replies(text, 2)
    assert replies == ["One", "Two"]
    assert clean == "Hi."


@pytest.mark.parametrize(
    ("cfg", "expected"),
    [
        ({}, 3),
        ({"reply_pills_count": 3}, 3),
        ({"reply_pills_count": 2}, 2),
        ({"reply_pills_count": 5}, 3),
        ({"reply_pills_count": "2"}, 3),
        ({"reply_pills_count": None}, 3),
    ],
)
def test_reply_pills_count_coerces_to_two_or_three(cfg: dict, expected: int) -> None:
    """Missing or malformed settings fall back to 3; only an exact 2 selects 2."""
    assert _reply_pills_count(cfg) == expected


def test_instruction_default_is_three_pills() -> None:
    """The legacy constant still asks for three lines (warm, curious, playful)."""
    assert _QUICK_REPLIES_INSTRUCTION == _build_quick_replies_instruction(3)
    assert "Only three lines inside the block." in _QUICK_REPLIES_INSTRUCTION
    assert "affectionate or warm" in _QUICK_REPLIES_INSTRUCTION
    assert "curious follow-up" in _QUICK_REPLIES_INSTRUCTION
    assert "playful, teasing" in _QUICK_REPLIES_INSTRUCTION


def test_instruction_two_pills_drops_curious_line() -> None:
    """Two pills keep the warm + playful lines and ask for exactly two lines."""
    instr = _build_quick_replies_instruction(2)
    assert "Only two lines inside the block." in instr
    assert "affectionate or warm" in instr
    assert "playful, teasing" in instr
    assert "curious follow-up" not in instr
    block = instr.split("<quick_replies>\n", 1)[1].split("</quick_replies>", 1)[0]
    assert len(block.strip().splitlines()) == 2
