"""Build the pre-baked DART gesture library from staged SMPL-X ``.npz`` files.

Reads ``backend/motion/dart_gesture_library.json`` and, for every gesture, converts
its DART SMPL-X ``.npz`` (staged in ``--npz-dir`` as ``<name>.npz``) into a
normalized-VRM GLB at ``<clip_dir>/<name>.glb`` via :func:`tools.dart_to_glb.convert_file`
with ``face_camera`` per the manifest. The GLBs are per-machine runtime assets
(gitignored); this script regenerates them from the staged npz set.

The npz files are produced once on the RTX box (see the manifest + Stage-3 Phase-3
design doc). Typical box command (WSL ``dart`` env, in ``/root/DART``):

    cut -d'|' -f2 glist.txt > prompts.txt   # "<prompt>*<primitives>" per line
    python -m mld.rollout_mld \\
        --denoiser_checkpoint ./mld_denoiser/.../checkpoint_300000.pt \\
        --text_prompt prompts.txt --guidance_param 5.0 --batch_size 1 \\
        --export_smpl 1 --use_predicted_joints 1

then copy each ``rollout/use_pred_joints_<prompt>_guidance5.0_seed0/sample_0_smplx.npz``
to ``<npz-dir>/<name>.npz``.

Usage:
    .venv/bin/python tools/build_dart_gestures.py --npz-dir /tmp/dart/gestures
    .venv/bin/python tools/build_dart_gestures.py --npz-dir <dir> --only wave,clap
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dart_to_glb import convert_file  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_MANIFEST = _ROOT / "backend" / "motion" / "dart_gesture_library.json"


def build(npz_dir: Path, only: set[str] | None = None) -> list[dict]:
    """Convert each manifest gesture's staged npz to a normalized-VRM GLB.

    Args:
        npz_dir: Directory holding ``<gesture-name>.npz`` staged from the box.
        only: Optional subset of gesture names to build (default: all).

    Returns:
        List of per-gesture result dicts: ``{name, status, glb?, frames?, yaw?}``.
    """
    manifest = json.loads(_MANIFEST.read_text())
    clip_dir = _ROOT / manifest["clip_dir"]
    clip_dir.mkdir(parents=True, exist_ok=True)
    face_camera = bool(manifest.get("face_camera", True))

    results: list[dict] = []
    for g in manifest["gestures"]:
        name = g["name"]
        if only and name not in only:
            continue
        src = npz_dir / f"{name}.npz"
        if not src.exists():
            results.append({"name": name, "status": "missing-npz", "src": str(src)})
            continue
        dst = clip_dir / f"{name}.glb"
        stats = convert_file(src, dst, face_camera=face_camera, anim_name=name)
        results.append({
            "name": name, "status": "ok", "glb": str(dst.relative_to(_ROOT)),
            "frames": stats["frames"], "yaw": stats["yaw"],
            "url": f"{manifest['url_base']}/{name}.glb",
        })
    return results


def main() -> None:
    """CLI entry. See module docstring."""
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--npz-dir", required=True, help="dir of staged <name>.npz files")
    p.add_argument("--only", help="comma-separated subset of gesture names")
    args = p.parse_args()

    only = set(args.only.split(",")) if args.only else None
    results = build(Path(args.npz_dir), only)
    ok = sum(1 for r in results if r["status"] == "ok")
    for r in results:
        if r["status"] == "ok":
            print(f"  ✓ {r['name']:11s} {r['frames']:3d}f yaw={r['yaw']:6.1f}  -> {r['glb']}")
        else:
            print(f"  ✗ {r['name']:11s} {r['status']} ({r.get('src','')})")
    print(f"[build_dart_gestures] {ok}/{len(results)} gestures built")


if __name__ == "__main__":
    main()
