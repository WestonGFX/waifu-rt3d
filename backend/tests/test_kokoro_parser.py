"""Tests for backend.kokoro.response_parser.

Verifies graceful fallback to plain-text replies when the LLM misbehaves,
enum validation, NSFW gate isolation, and JSON-fence extraction.
"""
from __future__ import annotations

import pytest

from backend.kokoro.response_parser import (
    CompanionResponse,
    parse_companion_response,
)


def test_plain_text_falls_back_gracefully():
    r = parse_companion_response("hi, just text")
    assert r.parse_ok is False
    assert r.reply == "hi, just text"
    assert r.emotion == "neutral"
    assert r.facial_expression == "neutral"
    assert r.gesture == "idle"
    assert r.state_delta.values == {}


def test_invalid_json_falls_back_gracefully():
    r = parse_companion_response("{not really json,,,}")
    assert r.parse_ok is False
    assert "not really json" in r.reply


def test_bare_json_parses():
    payload = '{"reply": "hey there", "emotion": "happy", "facialExpression": "smile"}'
    r = parse_companion_response(payload)
    assert r.parse_ok is True
    assert r.reply == "hey there"
    assert r.emotion == "happy"
    assert r.facial_expression == "smile"


def test_json_inside_code_fence_parses():
    payload = '```json\n{"reply": "fenced", "emotion": "playful"}\n```'
    r = parse_companion_response(payload)
    assert r.parse_ok is True
    assert r.reply == "fenced"
    assert r.emotion == "playful"


def test_json_with_surrounding_prose_parses():
    payload = "Sure! Here is the JSON:\n{\"reply\": \"surrounded\", \"emotion\": \"soft\"}\nLet me know."
    r = parse_companion_response(payload)
    assert r.parse_ok is True
    assert r.reply == "surrounded"


def test_invalid_enum_values_fall_back_to_neutral():
    payload = '{"reply": "x", "emotion": "ULTRAVIOLET", "facialExpression": "menacing", "gesture": "backflip", "gaze": "moon", "voiceStyle": "operatic"}'
    r = parse_companion_response(payload)
    assert r.parse_ok is True
    assert r.emotion == "neutral"
    assert r.facial_expression == "neutral"
    assert r.gesture == "idle"
    assert r.gaze == "user"
    assert r.voice_style == "calm"


def test_state_delta_filters_non_numeric_values():
    payload = '{"reply": "x", "stateDelta": {"mood": 0.04, "energy": "nope", "curiosity": 1e6}}'
    r = parse_companion_response(payload)
    assert r.state_delta.values["mood"] == pytest.approx(0.04)
    assert "energy" not in r.state_delta.values  # non-numeric dropped
    assert r.state_delta.values["curiosity"] == pytest.approx(1e6)  # clamp happens in apply_state_delta


def test_memory_write_defaults_when_omitted():
    r = parse_companion_response('{"reply": "x"}')
    assert r.memory_write.should_save is False
    assert r.memory_write.summary == ""
    assert r.memory_write.importance == 0.0


def test_memory_write_parses_when_present():
    payload = '{"reply":"x","memoryWrite":{"shouldSave":true,"summary":"likes dracula","importance":0.7,"emotionalSalience":0.5}}'
    r = parse_companion_response(payload)
    assert r.memory_write.should_save is True
    assert r.memory_write.summary == "likes dracula"
    assert r.memory_write.importance == 0.7
    assert r.memory_write.emotional_salience == 0.5


def test_nsfw_fields_ignored_when_gate_off():
    payload = (
        '{"reply":"x","innerArousalShift":0.3,"suggestiveBid":"...",'
        '"selfConsentCheck":true,"boundaryReinforcement":true}'
    )
    r = parse_companion_response(payload, nsfw_active=False)
    # Even if the LLM emits them, the parser must NOT surface them when off.
    assert r.inner_arousal_shift is None
    assert r.suggestive_bid is None
    assert r.self_consent_check is False
    assert r.boundary_reinforcement is False


def test_nsfw_fields_surface_when_gate_on():
    payload = (
        '{"reply":"x","innerArousalShift":0.3,"suggestiveBid":"lean closer",'
        '"selfConsentCheck":true,"boundaryReinforcement":true}'
    )
    r = parse_companion_response(payload, nsfw_active=True)
    assert r.inner_arousal_shift == pytest.approx(0.3)
    assert r.suggestive_bid == "lean closer"
    assert r.self_consent_check is True
    assert r.boundary_reinforcement is True


def test_reply_falls_back_to_raw_text_when_empty():
    payload = '{"reply": "", "emotion": "happy"}'
    r = parse_companion_response(payload)
    # parse_ok is True (valid JSON, valid shape) but reply is rescued from raw.
    assert r.parse_ok is True
    assert r.reply == payload.strip()


def test_top_level_array_falls_back():
    r = parse_companion_response("[1, 2, 3]")
    assert r.parse_ok is False
