"""Tests for the Kokoro JSON schema (single source of truth with the parser)."""
from __future__ import annotations

from backend.kokoro.mind_state import ALL_MIND_DIALS, TIER_A_FAST, TIER_B_SLOW
from backend.kokoro.response_parser import VALID_FACES, VALID_GESTURES
from backend.kokoro.response_schema import (
    DELTA_CAP,
    companion_response_json_schema,
    response_format_for,
)


def test_required_keys_and_no_extra_props():
    s = companion_response_json_schema()
    assert sorted(s["required"]) == ["facialExpression", "gesture", "memoryWrite", "reply", "stateDelta"]
    assert s["additionalProperties"] is False


def test_enums_match_parser_sets():
    props = companion_response_json_schema()["properties"]
    assert set(props["facialExpression"]["enum"]) == VALID_FACES
    assert set(props["gesture"]["enum"]) == VALID_GESTURES


def test_state_delta_bounds_match_per_turn_cap():
    delta = companion_response_json_schema()["properties"]["stateDelta"]["properties"]
    assert DELTA_CAP == 0.05
    for spec in delta.values():
        assert spec["minimum"] == -DELTA_CAP and spec["maximum"] == DELTA_CAP


def test_intimate_dials_only_when_nsfw_active():
    sfw = companion_response_json_schema(nsfw_active=False)["properties"]["stateDelta"]["properties"]
    nsfw = companion_response_json_schema(nsfw_active=True)["properties"]["stateDelta"]["properties"]
    assert set(sfw) == set(TIER_A_FAST + TIER_B_SLOW)
    assert set(nsfw) == set(ALL_MIND_DIALS)
    assert "desire_for_user" not in sfw


def test_boundary_reinforcement_gated():
    assert "boundaryReinforcement" not in companion_response_json_schema()["properties"]
    s = companion_response_json_schema(nsfw_active=True)
    assert "boundaryReinforcement" in s["properties"] and "boundaryReinforcement" in s["required"]


def test_response_format_envelope():
    rf = response_format_for()
    assert rf["type"] == "json_schema"
    assert rf["json_schema"]["strict"] is True
    assert rf["json_schema"]["schema"]["type"] == "object"
