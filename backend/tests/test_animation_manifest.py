"""Tests for the animation manifest data integrity.

Loads backend/data/animation_manifest.json and verifies structural invariants:
pack-level required fields, clip-level required fields, name uniqueness,
duration bounds, category allowlist, and format allowlist.

No I/O mocking required — the manifest is a static data file.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

MANIFEST_PATH = ROOT / "backend" / "data" / "animation_manifest.json"

# ── Known-good sets ───────────────────────────────────────────────────────────
KNOWN_CATEGORIES = {"idle", "reaction", "emotion", "locomotion"}
KNOWN_FORMATS    = {"vrma", "glb", "bvh", "keyframes"}
MIN_PACKS        = 3


def _load_manifest() -> dict:
    """Load and return the parsed manifest dict.

    Returns:
        Parsed JSON as a Python dict.
    """
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def _all_clips(manifest: dict) -> list[dict]:
    """Flatten all clips from every pack into a single list.

    Args:
        manifest: Parsed manifest dict.

    Returns:
        List of clip dicts across all packs.
    """
    clips: list[dict] = []
    for pack in manifest.get("packs", []):
        clips.extend(pack.get("clips", []))
    return clips


# ─────────────────────────────────────────────────────────────────────────────
# TestAnimationManifest
# ─────────────────────────────────────────────────────────────────────────────


class TestAnimationManifest:
    """Structural and data-integrity tests for animation_manifest.json."""

    # ── Loading ───────────────────────────────────────────────────────────────

    def test_manifest_is_valid_json(self):
        """Manifest file must load without error and return a dict."""
        data = _load_manifest()
        assert isinstance(data, dict), "Manifest root must be a JSON object"

    def test_manifest_has_version_field(self):
        """Manifest must contain a 'version' key at the root level."""
        data = _load_manifest()
        assert "version" in data, "Manifest must have a 'version' field"

    # ── Pack-level ────────────────────────────────────────────────────────────

    def test_manifest_has_packs(self):
        """Manifest must contain at least MIN_PACKS packs."""
        data = _load_manifest()
        packs = data.get("packs", [])
        assert len(packs) >= MIN_PACKS, (
            f"Expected at least {MIN_PACKS} packs, found {len(packs)}"
        )

    def test_each_pack_has_required_fields(self):
        """Every pack must have 'id', 'name', 'license', and 'clips'."""
        data = _load_manifest()
        required = {"id", "name", "license", "clips"}
        for pack in data["packs"]:
            missing = required - set(pack.keys())
            assert not missing, (
                f"Pack '{pack.get('id', '?')}' is missing fields: {missing}"
            )

    def test_pack_ids_are_non_empty_strings(self):
        """Every pack 'id' must be a non-empty string."""
        data = _load_manifest()
        for pack in data["packs"]:
            assert isinstance(pack["id"], str) and pack["id"].strip(), (
                f"Pack id must be a non-empty string, got: {pack['id']!r}"
            )

    def test_pack_names_are_non_empty_strings(self):
        """Every pack 'name' must be a non-empty string."""
        data = _load_manifest()
        for pack in data["packs"]:
            assert isinstance(pack["name"], str) and pack["name"].strip(), (
                f"Pack name must be a non-empty string in pack '{pack['id']}'"
            )

    def test_pack_clips_are_non_empty_lists(self):
        """Every pack must have at least one clip in its 'clips' list."""
        data = _load_manifest()
        for pack in data["packs"]:
            clips = pack.get("clips", [])
            assert isinstance(clips, list) and len(clips) > 0, (
                f"Pack '{pack['id']}' must have at least one clip"
            )

    def test_pack_ids_unique(self):
        """Pack 'id' values must be unique across all packs."""
        data = _load_manifest()
        ids = [p["id"] for p in data["packs"]]
        assert len(ids) == len(set(ids)), (
            f"Duplicate pack IDs found: {[x for x in ids if ids.count(x) > 1]}"
        )

    def test_pack_formats_valid(self):
        """All pack/clip formats must be in the known set: vrma, glb, bvh, keyframes.

        Format is resolved in priority order:
          1. Pack-level 'format' field (present on procedural and some asset packs).
          2. Extension of the clip's 'file' field (present on file-based packs).

        Procedural clips have no 'file' field; their pack carries 'format':
        'keyframes'.  A clip with neither a 'file' field nor a pack 'format'
        would be a data error — this test catches that too.
        """
        data = _load_manifest()
        for pack in data["packs"]:
            pack_format = pack.get("format", "")
            for clip in pack.get("clips", []):
                file_path = clip.get("file", "")
                # Prefer clip file extension; fall back to pack-level format.
                if file_path:
                    fmt = Path(file_path).suffix.lstrip(".")
                else:
                    fmt = pack_format
                assert fmt in KNOWN_FORMATS, (
                    f"Clip '{clip.get('id')}' in pack '{pack['id']}' has "
                    f"unrecognised format '{fmt}' "
                    f"(file='{file_path}', pack_format='{pack_format}')"
                )

    # ── Clip-level ────────────────────────────────────────────────────────────

    def test_each_clip_has_required_fields(self):
        """Every clip must have 'name', 'category', and 'duration'."""
        data = _load_manifest()
        required = {"name", "category", "duration"}
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                missing = required - set(clip.keys())
                assert not missing, (
                    f"Clip '{clip.get('id', '?')}' in pack '{pack['id']}' "
                    f"is missing fields: {missing}"
                )

    def test_each_clip_has_id(self):
        """Every clip must have an 'id' field that is a non-empty string."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                assert isinstance(clip.get("id"), str) and clip["id"].strip(), (
                    f"Clip in pack '{pack['id']}' has missing or empty 'id'"
                )

    def test_file_based_clips_have_file_field(self):
        """Clips in packs without a pack-level 'format' must have a non-empty 'file' field.

        Procedural packs carry a top-level 'format' field ('keyframes') and
        their clips intentionally have no 'file' entry — the server generates
        them on-the-fly.  All other packs serve static asset files and must
        supply a 'file' path on every clip.
        """
        data = _load_manifest()
        for pack in data["packs"]:
            # Packs with a top-level 'format' are procedural or pre-tagged;
            # their clips may legitimately omit 'file'.
            if pack.get("format"):
                continue
            for clip in pack.get("clips", []):
                file_val = clip.get("file", "")
                assert isinstance(file_val, str) and file_val.strip(), (
                    f"Clip '{clip.get('id')}' in pack '{pack['id']}' "
                    f"(no pack-level format) must have a non-empty 'file' field"
                )

    def test_clip_names_unique(self):
        """Clip 'name' values must be unique across all packs."""
        data = _load_manifest()
        all_clips = _all_clips(data)
        names = [c["name"] for c in all_clips]
        duplicates = [n for n in names if names.count(n) > 1]
        assert not duplicates, (
            f"Duplicate clip names found: {list(set(duplicates))}"
        )

    def test_clip_ids_unique(self):
        """Clip 'id' values must be unique across all packs."""
        data = _load_manifest()
        all_clips = _all_clips(data)
        ids = [c["id"] for c in all_clips]
        duplicates = [i for i in ids if ids.count(i) > 1]
        assert not duplicates, (
            f"Duplicate clip IDs found: {list(set(duplicates))}"
        )

    # ── Duration bounds ───────────────────────────────────────────────────────

    def test_clip_durations_valid(self):
        """All clip durations must be > 0 and < 30 seconds."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                d = clip["duration"]
                assert isinstance(d, (int, float)), (
                    f"Clip '{clip['id']}' duration is not a number: {d!r}"
                )
                assert 0 < d < 30, (
                    f"Clip '{clip['id']}' duration {d}s is out of bounds (0, 30)"
                )

    def test_clip_duration_is_numeric(self):
        """Duration field must be an int or float, never a string."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                assert isinstance(clip["duration"], (int, float)), (
                    f"Clip '{clip['id']}' duration is type "
                    f"{type(clip['duration']).__name__}, expected numeric"
                )

    # ── Category allowlist ────────────────────────────────────────────────────

    def test_clip_categories_valid(self):
        """All clip categories must be in the known set: idle, reaction, emotion, locomotion."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                cat = clip["category"]
                assert cat in KNOWN_CATEGORIES, (
                    f"Clip '{clip['id']}' has unknown category '{cat}'. "
                    f"Known: {KNOWN_CATEGORIES}"
                )

    def test_clip_category_is_string(self):
        """Every clip's 'category' value must be a string."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                assert isinstance(clip["category"], str), (
                    f"Clip '{clip['id']}' category is not a string: "
                    f"{clip['category']!r}"
                )

    # ── Emotions field ────────────────────────────────────────────────────────

    def test_clip_emotions_is_list_when_present(self):
        """When 'emotions' is present, it must be a non-empty list of strings."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                if "emotions" not in clip:
                    continue
                emotions = clip["emotions"]
                assert isinstance(emotions, list) and len(emotions) > 0, (
                    f"Clip '{clip['id']}' 'emotions' must be a non-empty list"
                )
                for e in emotions:
                    assert isinstance(e, str), (
                        f"Clip '{clip['id']}' emotion entry is not a string: {e!r}"
                    )

    # ── Loop field ────────────────────────────────────────────────────────────

    def test_clip_loop_is_bool_when_present(self):
        """When 'loop' is present, it must be a boolean."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                if "loop" not in clip:
                    continue
                assert isinstance(clip["loop"], bool), (
                    f"Clip '{clip['id']}' 'loop' must be bool, "
                    f"got {type(clip['loop']).__name__}"
                )

    # ── Idle clips loop ───────────────────────────────────────────────────────

    def test_idle_clips_are_looping(self):
        """All clips with category 'idle' should have loop=True."""
        data = _load_manifest()
        for pack in data["packs"]:
            for clip in pack.get("clips", []):
                if clip.get("category") == "idle" and "loop" in clip:
                    assert clip["loop"] is True, (
                        f"Idle clip '{clip['id']}' should be looping "
                        f"(loop=True) but loop={clip['loop']}"
                    )
