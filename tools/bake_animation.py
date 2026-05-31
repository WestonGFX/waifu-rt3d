#!/usr/bin/env python3
"""Launcher for the Blender headless animation bake (``tools/blender/bake_clip.py``).

Finds the Blender executable and runs the bake worker so callers don't have to know
the platform-specific Blender path. Bakes a single source clip, or every
``.fbx/.glb`` in a directory, into clean VRM-retargetable GLBs under
``backend/storage/animations/baked/``.

The bake unlocks the entire Mixamo FBX library (browsers can't load FBX) and produces
in-place looping clips that drop into the viewer's runtime retarget path. See
``docs/research/2026-05-31-retarget-pipeline.md`` and
``docs/plans/2026-05-31-avatar-motion-staged.md`` (Stage 1.3).

Usage:
    # one file
    .venv/bin/python tools/bake_animation.py --in ~/Downloads/Walking.fbx --name walk --in-place

    # whole folder of Mixamo downloads
    .venv/bin/python tools/bake_animation.py --in-dir ~/Downloads/mixamo --in-place

    # custom Blender path
    BLENDER=/path/to/blender .venv/bin/python tools/bake_animation.py --in clip.fbx
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "tools" / "blender" / "bake_clip.py"
OUT_DIR = ROOT / "backend" / "storage" / "animations" / "baked"

# Common Blender locations by platform; first hit wins. Override with $BLENDER.
_CANDIDATES = [
    os.environ.get("BLENDER", ""),
    shutil.which("blender") or "",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
    "/usr/bin/blender",
]


def find_blender() -> str:
    """Locate a Blender executable.

    Returns:
        Absolute path to the Blender binary.

    Raises:
        SystemExit: If no Blender install is found (with install guidance).
    """
    for cand in _CANDIDATES:
        if cand and os.path.isfile(cand):
            return cand
    sys.exit(
        "Blender not found. Install it (https://www.blender.org/download/) or set "
        "$BLENDER to the executable path."
    )


def bake_one(blender: str, src: Path, name: str | None, in_place: bool) -> bool:
    """Run the Blender worker on one source clip.

    Args:
        blender: Path to the Blender executable.
        src: Source .fbx/.glb/.gltf path.
        name: Clean clip name override (single-clip files), or None to derive.
        in_place: Strip horizontal root motion so the clip loops in place.

    Returns:
        True if the bake succeeded and produced an output file.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    clip_name = name or src.stem.lower().replace(" ", "_")
    out = OUT_DIR / f"{clip_name}.glb"

    cmd = [
        blender, "--background", "--python", str(WORKER), "--",
        "--in", str(src), "--out", str(out), "--name", clip_name,
    ]
    if in_place:
        cmd.append("--in-place")

    result = subprocess.run(cmd, capture_output=True, text=True)
    line = next((ln for ln in result.stdout.splitlines() if "[bake_clip]" in ln), "")
    if result.returncode != 0 or not out.exists():
        print(f"  ✗ {src.name}: {result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'failed'}")
        return False
    print(f"  ✓ {line.replace('[bake_clip] OK ', '')}")
    return True


def main() -> None:
    """CLI entry point. See module docstring for usage."""
    p = argparse.ArgumentParser(description="Bake Mixamo FBX/GLB → VRM-retargetable GLB via Blender.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--in", dest="input", help="single source .fbx/.glb/.gltf")
    g.add_argument("--in-dir", dest="input_dir", help="directory of source clips to batch")
    p.add_argument("--name", help="clean clip name (single-file mode)")
    p.add_argument("--in-place", action="store_true", help="loop in place (strip horizontal root motion)")
    args = p.parse_args()

    blender = find_blender()
    print(f"Blender: {blender}")

    if args.input:
        ok = bake_one(blender, Path(args.input), args.name, args.in_place)
        sys.exit(0 if ok else 1)

    src_dir = Path(args.input_dir)
    sources = sorted(
        [f for f in src_dir.iterdir() if f.suffix.lower() in (".fbx", ".glb", ".gltf")]
    )
    if not sources:
        sys.exit(f"No .fbx/.glb/.gltf files in {src_dir}")
    print(f"Baking {len(sources)} clips from {src_dir} → {OUT_DIR}")
    n_ok = sum(bake_one(blender, f, None, args.in_place) for f in sources)
    print(f"\nDone: {n_ok}/{len(sources)} baked.")
    sys.exit(0 if n_ok == len(sources) else 1)


if __name__ == "__main__":
    main()
