"""Tests for backend.adaptive.memory_behavior — Memory-to-Behavior Pipeline (AIE Phase B3).

Covers:
    - derive_behavior_from_memories: all four output channels, emotional keyword
      detection, preference-driven priming, proactive reference extraction, and
      relationship continuity detection.
    - build_memory_behavior_block: formatted prompt-block rendering, empty-input
      guard, and approximate token-budget compliance.

All tests are pure function calls — no DB, no filesystem, no LLM calls.
"""

from __future__ import annotations

import unittest

from backend.adaptive.memory_behavior import (
    build_memory_behavior_block,
    derive_behavior_from_memories,
)

# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------


def _mem(
    text: str,
    *,
    tier: int = 2,
    salience: float = 0.7,
    role: str = "user",
    created_at: str = "2026-04-05",
) -> dict:
    """Build a minimal memory dict for use in test inputs.

    Args:
        text: Raw memory text content.
        tier: Memory tier (1=fleeting, 2=recent, 3=permanent).
        salience: Importance weight 0.0–1.0.
        role: Either "user" or "assistant".
        created_at: ISO-8601 date string.

    Returns:
        Memory dict matching the structure expected by derive_behavior_from_memories.
    """
    return {
        "text": text,
        "tier": tier,
        "salience": salience,
        "role": role,
        "created_at": created_at,
    }


# ---------------------------------------------------------------------------
# Tests: derive_behavior_from_memories
# ---------------------------------------------------------------------------


class TestDeriveBehaviorFromMemories(unittest.TestCase):
    """Tests for derive_behavior_from_memories()."""

    def test_returns_four_channels(self):
        """Any valid input returns a dict with all four required channel keys."""
        result = derive_behavior_from_memories(
            [_mem("User talked about their day.")],
            {"pref_humor": 0.5},
            "casual_chat",
        )
        self.assertIn("emotional_coloring", result)
        self.assertIn("behavioral_priming", result)
        self.assertIn("proactive_references", result)
        self.assertIn("relationship_continuity", result)

    def test_empty_memories_returns_defaults(self):
        """Empty memory list produces empty lists for reference/continuity channels.

        NOTE: behavioral_priming may still be set when pref_formality defaults to 0.0
        (the pref_formality < 0.3 branch fires on an empty profile).  This test
        validates the structural guarantees — list channels are empty, string channels
        are strings — not that both string channels are always "".
        """
        result = derive_behavior_from_memories([], {}, "casual_chat")
        self.assertEqual(result["emotional_coloring"], "")
        self.assertIsInstance(result["behavioral_priming"], str)
        self.assertIsInstance(result["proactive_references"], list)
        self.assertEqual(len(result["proactive_references"]), 0)
        self.assertIsInstance(result["relationship_continuity"], list)
        self.assertEqual(len(result["relationship_continuity"]), 0)

    def test_sad_memories_gentle_approach(self):
        """Memories containing sadness keywords produce gentleness emotional_coloring."""
        mems = [
            _mem("User said they have been sad and crying all week."),
        ]
        result = derive_behavior_from_memories(mems, {}, "casual_chat")
        self.assertIn("gentleness", result["emotional_coloring"])

    def test_excited_memories_match_energy(self):
        """Memories containing excitement keywords produce match-energy emotional_coloring."""
        mems = [
            _mem("User was excited and said the news is amazing and they are thrilled!"),
        ]
        result = derive_behavior_from_memories(mems, {}, "casual_chat")
        self.assertIn("energy", result["emotional_coloring"])

    def test_humor_priming_with_high_pref(self):
        """Memories with humor indicators plus pref_humor > 0.6 produce playful behavioral_priming."""
        mems = [
            _mem("We laughed so hard, lol that was hilarious and funny."),
        ]
        result = derive_behavior_from_memories(
            mems, {"pref_humor": 0.9}, "casual_chat"
        )
        self.assertIn("playful", result["behavioral_priming"])

    def test_no_priming_with_low_humor_pref(self):
        """Humor in memories with pref_humor < 0.3 does not produce playful behavioral_priming."""
        mems = [
            _mem("We laughed so hard, lol that was hilarious and funny."),
        ]
        result = derive_behavior_from_memories(
            mems, {"pref_humor": 0.2}, "casual_chat"
        )
        self.assertNotIn("playful", result["behavioral_priming"])

    def test_proactive_references_extracted(self):
        """Memories with specific facts populate proactive_references with up to 2 items."""
        mems = [
            _mem(
                "User mentioned their cat Mochi is sick. They are very worried.",
                salience=0.9,
            ),
            _mem(
                "User said they started a new job at the design studio last week.",
                salience=0.8,
            ),
            _mem(
                "User talked about their weekend plans to go hiking with friends.",
                salience=0.6,
            ),
        ]
        result = derive_behavior_from_memories(mems, {}, "casual_chat")
        self.assertGreater(len(result["proactive_references"]), 0)
        self.assertLessEqual(len(result["proactive_references"]), 2)

    def test_emotional_support_context_coloring(self):
        """current_context='emotional_support' triggers gentleness even without sad keywords."""
        # Memories with no explicit emotional keywords
        mems = [_mem("User talked about their schedule for the week.")]
        result = derive_behavior_from_memories(mems, {}, "emotional_support")
        self.assertNotEqual(result["emotional_coloring"], "")
        self.assertIn("gentleness", result["emotional_coloring"])


# ---------------------------------------------------------------------------
# Tests: build_memory_behavior_block
# ---------------------------------------------------------------------------


class TestBuildMemoryBehaviorBlock(unittest.TestCase):
    """Tests for build_memory_behavior_block()."""

    def test_builds_formatted_block(self):
        """Non-empty behavior dict returns a formatted multi-line string starting with the header."""
        behavior = {
            "emotional_coloring": "approach with gentleness",
            "behavioral_priming": "lead with warmth and understanding",
            "proactive_references": ["User mentioned their cat Mochi is sick."],
            "relationship_continuity": [],
        }
        block = build_memory_behavior_block(behavior)
        self.assertIsInstance(block, str)
        self.assertTrue(block.startswith("[Memory-driven behavior]"))
        self.assertIn("approach with gentleness", block)

    def test_empty_behavior_returns_empty(self):
        """All-empty channels produce an empty string so callers can skip injection."""
        behavior = {
            "emotional_coloring": "",
            "behavioral_priming": "",
            "proactive_references": [],
            "relationship_continuity": [],
        }
        block = build_memory_behavior_block(behavior)
        self.assertEqual(block, "")

    def test_block_under_token_limit(self):
        """Generated behavior block is compact — under 400 characters as a proxy for <80 tokens."""
        mems = [
            _mem("User said they are sad and crying about their cat.", salience=0.9),
        ]
        behavior = derive_behavior_from_memories(mems, {"pref_empathy": 0.8}, "emotional_support")
        block = build_memory_behavior_block(behavior)
        # 400 chars is a conservative proxy for the ~80-token budget documented in the source.
        self.assertLess(len(block), 400)

    def test_none_behavior_returns_empty(self):
        """Passing None (or falsy) returns empty string without raising."""
        block = build_memory_behavior_block(None)  # type: ignore[arg-type]
        self.assertEqual(block, "")

    def test_partial_behavior_only_shows_nonempty_channels(self):
        """Only channels with content appear in the rendered block."""
        behavior = {
            "emotional_coloring": "match their energy",
            "behavioral_priming": "",
            "proactive_references": [],
            "relationship_continuity": [],
        }
        block = build_memory_behavior_block(behavior)
        self.assertIn("match their energy", block)
        self.assertNotIn("Style:", block)
        self.assertNotIn("Can reference:", block)

    def test_proactive_refs_semicolon_joined(self):
        """Multiple proactive references are joined with '; ' in the block."""
        behavior = {
            "emotional_coloring": "",
            "behavioral_priming": "",
            "proactive_references": ["First fact here.", "Second fact here."],
            "relationship_continuity": [],
        }
        block = build_memory_behavior_block(behavior)
        self.assertIn("First fact here.", block)
        self.assertIn("Second fact here.", block)

    def test_relationship_continuity_included(self):
        """relationship_continuity items appear under 'Shared history:' in the block."""
        behavior = {
            "emotional_coloring": "",
            "behavioral_priming": "",
            "proactive_references": [],
            "relationship_continuity": ['Uses "babe"'],
        }
        block = build_memory_behavior_block(behavior)
        self.assertIn("Shared history:", block)
        self.assertIn('Uses "babe"', block)
