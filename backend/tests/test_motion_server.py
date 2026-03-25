"""Tests for backend.motion.motion_server — procedural keyframe generation.

Tests the internal _procedural_keyframes() function and the _EMOTION_PARAMS
table directly, without starting the FastAPI server or the UDP beacon.

The beacon module is patched at import time so that no network sockets are
opened during the test run.

VRM bone names tested against the subset defined in the procedural generator.
"""

import importlib
import math
import sys
import unittest.mock
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ── Import motion_server with the beacon patched out ─────────────────────────
# beacon.start_beacon_sender opens network sockets; stub it before the module
# is first imported so tests never touch the network.

_beacon_mock = unittest.mock.MagicMock()

with unittest.mock.patch.dict(
    sys.modules,
    {"backend.motion.beacon": _beacon_mock},
):
    import backend.motion.motion_server as _ms

_procedural_keyframes = _ms._procedural_keyframes
_EMOTION_PARAMS       = _ms._EMOTION_PARAMS


# ── Constants ─────────────────────────────────────────────────────────────────

# The exact set of bone names produced by _procedural_keyframes.
EXPECTED_BONES = {
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "leftUpperArm",
    "rightUpperArm",
}

# Required keys inside every bone euler dict.
BONE_AXES = {"x", "y", "z"}

# Required top-level keys for every keyframe dict.
KEYFRAME_KEYS = {"time", "bones"}

# Required parameter keys for each emotion in _EMOTION_PARAMS.
REQUIRED_EMOTION_PARAM_KEYS = {"energy", "sway", "headTilt", "armLift", "spineForward"}

# Default generation parameters.
DEFAULT_DURATION = 3.0
DEFAULT_FPS      = 20


# ─────────────────────────────────────────────────────────────────────────────
# TestProceduralKeyframes
# ─────────────────────────────────────────────────────────────────────────────


class TestProceduralKeyframes:
    """Tests for _procedural_keyframes() in motion_server.py."""

    # ── Basic generation ──────────────────────────────────────────────────────

    def test_procedural_keyframes_basic(self):
        """Calling with 'neutral' returns a non-empty list of keyframe dicts."""
        frames = _procedural_keyframes("neutral")
        assert isinstance(frames, list), "Return value must be a list"
        assert len(frames) > 0, "Must return at least one keyframe"

    def test_procedural_keyframes_all_emotions(self):
        """Every emotion in _EMOTION_PARAMS must produce a non-empty keyframe list."""
        for emotion in _EMOTION_PARAMS:
            frames = _procedural_keyframes(emotion, duration=DEFAULT_DURATION)
            assert len(frames) > 0, (
                f"Emotion '{emotion}' produced no keyframes"
            )

    def test_unknown_emotion_falls_back_to_neutral(self):
        """An unrecognised emotion label silently falls back to 'neutral' params."""
        frames_unknown = _procedural_keyframes("nonexistent_emotion_xyz")
        frames_neutral = _procedural_keyframes("neutral")
        # Both runs use identical params so should produce the same count.
        assert len(frames_unknown) == len(frames_neutral), (
            "Unknown emotion fallback should match neutral frame count"
        )

    # ── Keyframe structure ────────────────────────────────────────────────────

    def test_keyframe_format(self):
        """Each keyframe must contain both 'time' (float) and 'bones' (dict) keys."""
        frames = _procedural_keyframes("happy")
        for i, frame in enumerate(frames):
            assert set(frame.keys()) >= KEYFRAME_KEYS, (
                f"Frame {i} is missing required keys: "
                f"{KEYFRAME_KEYS - set(frame.keys())}"
            )
            assert isinstance(frame["time"], float), (
                f"Frame {i}: 'time' must be float, got {type(frame['time']).__name__}"
            )
            assert isinstance(frame["bones"], dict), (
                f"Frame {i}: 'bones' must be dict, got {type(frame['bones']).__name__}"
            )

    def test_keyframe_bone_names_valid(self):
        """Every keyframe must contain exactly the expected VRM bone set."""
        frames = _procedural_keyframes("sad", duration=1.0)
        for i, frame in enumerate(frames):
            bone_names = set(frame["bones"].keys())
            missing  = EXPECTED_BONES - bone_names
            extra    = bone_names - EXPECTED_BONES
            assert not missing, f"Frame {i} missing bones: {missing}"
            assert not extra,   f"Frame {i} has unexpected bones: {extra}"

    def test_keyframe_bone_euler_has_xyz(self):
        """Every bone value in every keyframe must have 'x', 'y', and 'z' keys."""
        frames = _procedural_keyframes("excited", duration=1.0)
        for i, frame in enumerate(frames):
            for bone, euler in frame["bones"].items():
                missing_axes = BONE_AXES - set(euler.keys())
                assert not missing_axes, (
                    f"Frame {i} bone '{bone}' missing axes: {missing_axes}"
                )

    def test_keyframe_bone_values_are_floats(self):
        """All bone axis values must be numeric (int or float)."""
        frames = _procedural_keyframes("neutral", duration=1.0)
        for i, frame in enumerate(frames):
            for bone, euler in frame["bones"].items():
                for axis, val in euler.items():
                    assert isinstance(val, (int, float)), (
                        f"Frame {i} bone '{bone}' axis '{axis}' is not numeric: "
                        f"{val!r}"
                    )

    # ── Time axis ─────────────────────────────────────────────────────────────

    def test_keyframe_duration_respected(self):
        """The last keyframe's 'time' must be <= the requested duration."""
        for duration in (1.0, 3.0, 5.0, 10.0):
            frames = _procedural_keyframes("happy", duration=duration)
            last_t = frames[-1]["time"]
            assert last_t <= duration + 1e-6, (
                f"duration={duration}: last frame time {last_t} exceeds duration"
            )

    def test_keyframe_time_starts_at_zero(self):
        """The first keyframe's 'time' must be exactly 0.0."""
        frames = _procedural_keyframes("neutral")
        assert frames[0]["time"] == 0.0, (
            f"First keyframe time should be 0.0, got {frames[0]['time']}"
        )

    def test_keyframe_times_monotonically_increasing(self):
        """Keyframe 'time' values must be strictly increasing."""
        frames = _procedural_keyframes("sad", duration=2.0)
        for i in range(1, len(frames)):
            prev = frames[i - 1]["time"]
            curr = frames[i]["time"]
            assert curr > prev, (
                f"Keyframe times are not monotonically increasing: "
                f"frame {i - 1}={prev}, frame {i}={curr}"
            )

    def test_keyframe_count_matches_fps(self):
        """Frame count should be approximately duration * fps + 1 (inclusive endpoints)."""
        duration = 3.0
        fps      = 20
        frames   = _procedural_keyframes("neutral", duration=duration, fps=fps)
        expected = int(duration * fps) + 1
        # Allow ±1 for floating-point step accumulation.
        assert abs(len(frames) - expected) <= 1, (
            f"Expected ~{expected} frames at {fps}fps for {duration}s, "
            f"got {len(frames)}"
        )

    # ── Value bounds ──────────────────────────────────────────────────────────

    def test_keyframe_values_bounded(self):
        """All bone rotation values must be within the range [-1.0, 1.0].

        Note: the arm bones carry a constant offset of ±1.4 rad for the
        natural resting arm position, which legitimately exceeds ±1.0.
        Those bones are excluded from the strict ±1.0 check.
        """
        UNCONSTRAINED_BONES = {"leftUpperArm", "rightUpperArm"}
        for emotion in _EMOTION_PARAMS:
            frames = _procedural_keyframes(emotion, duration=DEFAULT_DURATION)
            for i, frame in enumerate(frames):
                for bone, euler in frame["bones"].items():
                    if bone in UNCONSTRAINED_BONES:
                        continue
                    for axis, val in euler.items():
                        assert -1.0 <= val <= 1.0, (
                            f"Emotion '{emotion}' frame {i} bone '{bone}' "
                            f"axis '{axis}'={val} is outside [-1.0, 1.0]"
                        )

    def test_different_energies_produce_different_magnitudes(self):
        """High-energy emotions (excited) should produce larger hip sway than low-energy (sad).

        Uses hips.y as the comparison bone because it maps directly to the
        'sway' parameter (hips.y = sin(...) * sway * 0.5) with no additive
        offset — making it a clean proxy for overall motion amplitude.
        Excited has sway=0.035 vs sad sway=0.008, so excited max hips.y is
        always larger regardless of phase alignment.
        """
        frames_excited = _procedural_keyframes("excited", duration=DEFAULT_DURATION)
        frames_sad     = _procedural_keyframes("sad",     duration=DEFAULT_DURATION)

        def max_hips_y(frames: list[dict]) -> float:
            """Return the maximum absolute hips.y value across all frames."""
            return max(abs(f["bones"]["hips"]["y"]) for f in frames)

        assert max_hips_y(frames_excited) > max_hips_y(frames_sad), (
            f"Excited hips.y max ({max_hips_y(frames_excited):.4f}) should be "
            f"greater than sad hips.y max ({max_hips_y(frames_sad):.4f})"
        )

    # ── Duration edge cases ───────────────────────────────────────────────────

    def test_very_short_duration(self):
        """Duration of 0.05s should still produce at least one keyframe."""
        frames = _procedural_keyframes("neutral", duration=0.05, fps=20)
        assert len(frames) >= 1

    def test_single_fps(self):
        """fps=1 with duration=1.0 should produce exactly 2 keyframes (t=0, t=1)."""
        frames = _procedural_keyframes("neutral", duration=1.0, fps=1)
        # t=0.0 and t=1.0 → 2 frames
        assert len(frames) == 2, (
            f"Expected 2 frames at fps=1 for 1.0s, got {len(frames)}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TestEmotionParams
# ─────────────────────────────────────────────────────────────────────────────


class TestEmotionParams:
    """Tests for the _EMOTION_PARAMS table in motion_server.py."""

    def test_emotion_params_is_dict(self):
        """_EMOTION_PARAMS must be a non-empty dict."""
        assert isinstance(_EMOTION_PARAMS, dict) and len(_EMOTION_PARAMS) > 0

    def test_emotion_params_contains_neutral(self):
        """'neutral' must always be present as the fallback emotion."""
        assert "neutral" in _EMOTION_PARAMS, (
            "'neutral' is missing from _EMOTION_PARAMS — it is the fallback key"
        )

    def test_emotion_params_complete(self):
        """Every emotion in _EMOTION_PARAMS must have all required parameter keys."""
        for emotion, params in _EMOTION_PARAMS.items():
            missing = REQUIRED_EMOTION_PARAM_KEYS - set(params.keys())
            assert not missing, (
                f"Emotion '{emotion}' is missing param keys: {missing}"
            )

    def test_emotion_params_energy_range(self):
        """Every 'energy' value must be in [0.0, 1.0]."""
        for emotion, params in _EMOTION_PARAMS.items():
            e = params["energy"]
            assert 0.0 <= e <= 1.0, (
                f"Emotion '{emotion}' energy={e} is outside [0.0, 1.0]"
            )

    def test_emotion_params_sway_non_negative(self):
        """Every 'sway' value must be non-negative (direction is set by the sine wave)."""
        for emotion, params in _EMOTION_PARAMS.items():
            s = params["sway"]
            assert s >= 0.0, (
                f"Emotion '{emotion}' sway={s} is negative — "
                "sign is encoded by the sine oscillator, amplitude should be >= 0"
            )

    def test_emotion_params_values_are_numeric(self):
        """All parameter values in _EMOTION_PARAMS must be int or float."""
        for emotion, params in _EMOTION_PARAMS.items():
            for key, val in params.items():
                assert isinstance(val, (int, float)), (
                    f"Emotion '{emotion}' param '{key}'={val!r} is not numeric"
                )

    def test_emotion_count_at_least_five(self):
        """At least 5 emotions must be defined for basic expressiveness."""
        assert len(_EMOTION_PARAMS) >= 5, (
            f"Expected at least 5 emotions, found {len(_EMOTION_PARAMS)}"
        )

    def test_excited_has_highest_energy(self):
        """'excited' should have the highest energy value in the table."""
        energies = {e: p["energy"] for e, p in _EMOTION_PARAMS.items()}
        max_energy = max(energies.values())
        assert energies.get("excited") == max_energy, (
            f"Expected 'excited' to have max energy={max_energy}, "
            f"got excited.energy={energies.get('excited')}"
        )

    def test_sad_has_low_energy(self):
        """'sad' energy should be below the median to reflect low-energy affect."""
        energies = sorted(_EMOTION_PARAMS[e]["energy"] for e in _EMOTION_PARAMS)
        median   = energies[len(energies) // 2]
        sad_e    = _EMOTION_PARAMS["sad"]["energy"]
        assert sad_e < median, (
            f"'sad' energy {sad_e} is not below median {median}"
        )
