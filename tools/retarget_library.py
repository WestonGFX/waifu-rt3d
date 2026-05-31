#!/usr/bin/env python3
"""Launcher for batch VRM-rig retargeting (``tools/blender/retarget_to_vrm.py``).

Finds Blender and runs the retarget worker over a whole folder of Mixamo FBX, baking
each onto a target VRM's own rig and exporting clean single-clip GLBs under
``backend/storage/animations/vrm-baked/``. Output clips are expressed in VRoid
``J_Bip_*`` bone space, so they play directly on any VRoid-named VRM at runtime — load
with ``retarget: false`` (see ``tools/verify/render_clip.mjs --retarget false``).

⚠ PREREQUISITE — distinct source clips. The 2026-05-31 grab downloaded one animation 28×
(see ``docs/research/2026-05-31-mixamo-duplicate-downloads.md``). Re-grab with a working
``tools/mixamo_grab.mjs`` BEFORE batching, or you bake 28 copies of the same motion. This
launcher fails loudly if it detects the duplicate signature (many FBX of identical size).

Usage:
    # whole folder against one VRM rig
    .venv/bin/python tools/retarget_library.py \\
        --vrm backend/storage/avatars/Raine.vrm \\
        --in-dir ~/Downloads/mixamo-fbx

    # single clip
    .venv/bin/python tools/retarget_library.py \\
        --vrm backend/storage/avatars/Raine.vrm \\
        --fbx ~/Downloads/mixamo-fbx/walking.fbx --name walking

    # custom Blender path
    BLENDER=/path/to/blender .venv/bin/python tools/retarget_library.py --vrm ... --in-dir ...

See ``docs/plans/2026-05-31-avatar-motion-staged.md`` (Follow-up Phase B).
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "tools" / "blender" / "retarget_to_vrm.py"
OUT_DIR = ROOT / "backend" / "storage" / "animations" / "vrm-baked"

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


def warn_if_duplicates(sources: list[Path]) -> None:
    """Print a loud warning if the sources look like the 2026-05-31 duplicate-download bug.

    Mixamo clips have distinct lengths, so many FBX sharing an exact byte size is the
    signature of one animation saved under many names. This catches it before wasting a
    long batch bake on identical motion.

    Args:
        sources: The source clip paths about to be retargeted.
    """
    sizes = Counter(f.stat().st_size for f in sources)
    worst, n = sizes.most_common(1)[0]
    if n >= 3:
        print(
            f"⚠ DUPLICATE WARNING: {n} source FBX share an identical byte size ({worst}). "
            f"They are probably the SAME animation under different names — re-grab first. "
            f"See docs/research/2026-05-31-mixamo-duplicate-downloads.md.",
            file=sys.stderr,
        )


def retarget_one(blender: str, vrm: Path, fbx: Path, name: str | None) -> bool:
    """Run the Blender retarget worker on one source clip.

    Args:
        blender: Path to the Blender executable.
        vrm: Target .vrm whose rig the motion is baked onto.
        fbx: Source Mixamo .fbx.
        name: Clean clip name override, or None to derive from the filename.

    Returns:
        True if the retarget succeeded and produced an output GLB.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    clip_name = name or fbx.stem.lower().replace(" ", "_")
    out = OUT_DIR / f"{clip_name}.glb"

    cmd = [
        blender, "--background", "--python", str(WORKER), "--",
        "--vrm", str(vrm), "--fbx", str(fbx), "--out", str(out), "--name", clip_name,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    line = next((ln for ln in result.stdout.splitlines() if "[retarget]" in ln), "")
    if result.returncode != 0 or not out.exists():
        tail = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "failed"
        print(f"  ✗ {fbx.name}: {tail}")
        return False
    print(f"  ✓ {line.replace('[retarget] OK ', '')}")
    return True


def main() -> None:
    """CLI entry point. See module docstring for usage."""
    p = argparse.ArgumentParser(
        description="Batch-retarget Mixamo FBX onto a VRM rig → clean GLB via Blender."
    )
    p.add_argument("--vrm", required=True, help="target .vrm whose rig the motion bakes onto")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--fbx", help="single source Mixamo .fbx")
    g.add_argument("--in-dir", dest="input_dir", help="directory of source .fbx to batch")
    p.add_argument("--name", help="clean clip name (single-file mode)")
    args = p.parse_args()

    vrm = Path(args.vrm)
    if not vrm.is_file():
        sys.exit(f"VRM not found: {vrm}")

    blender = find_blender()
    print(f"Blender: {blender}")
    print(f"Target rig: {vrm.name}")

    if args.fbx:
        ok = retarget_one(blender, vrm, Path(args.fbx), args.name)
        sys.exit(0 if ok else 1)

    src_dir = Path(args.input_dir)
    sources = sorted(f for f in src_dir.iterdir() if f.suffix.lower() == ".fbx")
    if not sources:
        sys.exit(f"No .fbx files in {src_dir}")
    warn_if_duplicates(sources)
    print(f"Retargeting {len(sources)} clips from {src_dir} → {OUT_DIR}")
    n_ok = sum(retarget_one(blender, vrm, f, None) for f in sources)
    print(f"\nDone: {n_ok}/{len(sources)} retargeted.")
    sys.exit(0 if n_ok == len(sources) else 1)


if __name__ == "__main__":
    main()
