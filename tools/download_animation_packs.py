#!/usr/bin/env python3
"""Download and convert animation packs for the clip-based animation library.

Downloads BVH/FBX/VRMA animation files from multiple sources, converts them to
GLB with VRM-compatible bone names, and organises them for the animation manifest.

Sources:
    1. **SillyTavern VRM Assets Pack** — MIT-licensed VRM animation files
    2. **CMU MoCap** — curated subset of emotional/conversational BVH files
    3. **100STYLE** — emotional locomotion styles (CC BY 4.0)
    4. **Procedural Emotions** — generated at runtime by motion_server (skipped here)
    5. **VRM Expression Library** — CC0 VRMA clips from jsdelivr CDN
    6. **Bandai Namco LaFAN1** — CC BY-NC 4.0 MoCap (manual download, BVH→GLB needed)

Usage:
    .venv/bin/python tools/download_animation_packs.py --all
    .venv/bin/python tools/download_animation_packs.py --pack sillytavern
    .venv/bin/python tools/download_animation_packs.py --pack cmu
    .venv/bin/python tools/download_animation_packs.py --pack vrm-expression-library
    .venv/bin/python tools/download_animation_packs.py --pack lafan1
    .venv/bin/python tools/download_animation_packs.py --list

Output:
    backend/storage/animations/{pack_id}/
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
ANIMATIONS_DIR = ROOT / "backend" / "storage" / "animations"
TEMP_DIR = ROOT / "backend" / "storage" / "_anim_download_temp"

PACKS = {
    "sillytavern": {
        "name": "SillyTavern VRM Assets Pack",
        "license": "MIT",
        "url": "https://github.com/SillyTavern/SillyTavern-VRM-Assets.git",
        "type": "git",
        "description": "VRM-compatible animation files from the SillyTavern project",
    },
    "cmu": {
        "name": "CMU Motion Capture Database (curated)",
        "license": "Free/Academic",
        "url": "https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture",
        "type": "manual",
        "description": "Curated subset of ~50 emotional/conversational BVH files from CMU MoCap",
    },
    "100style": {
        "name": "100STYLE Dataset",
        "license": "CC BY 4.0",
        "url": "https://www.ianmason.com/100style",
        "type": "manual",
        "description": "Emotional locomotion styles — walk, run, jump with different emotions",
    },
    "procedural-emotions": {
        "name": "Procedural Emotion Animations",
        "license": "Generated",
        "url": "",
        "type": "generated",
        "description": "Keyframe animations generated at runtime by motion_server — no download needed",
    },
    "vrm-expression-library": {
        "name": "VRM Expression Library",
        "license": "CC0",
        "url": "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/animations/",
        "type": "cdn",
        "description": "Standard VRM expression/gesture VRMA clips compatible with any VRM model",
    },
    "lafan1": {
        "name": "Bandai Namco LaFAN1 MoCap",
        "license": "CC BY-NC 4.0",
        "url": "https://github.com/ubisoft/ubisoft-laforge-animation-dataset/releases",
        "type": "manual",
        "description": "High-quality locomotion and transition MoCap; requires BVH-to-GLB conversion",
    },
    "threejs-mixamo": {
        "name": "three.js Example Models (Mixamo-rigged)",
        "license": "CC (three.js examples)",
        "url": "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/",
        "type": "cdn",
        "description": (
            "Xbot.glb (idle/walk/run/agree/headShake/sad_pose/sneak_pose) + "
            "Soldier.glb (Idle/Walk/Run). Real mixamorig-named skeletons with embedded "
            "AnimationClips — exercises the ClipLayer retarget path end-to-end. The only "
            "verified-LIVE auto source as of 2026-05-31."
        ),
    },
}

# Sources verified DEAD on 2026-05-31 (kept for history; do not rely on auto-download):
#   - sillytavern: GitHub repo returns 404 (repository removed)
#   - vrm-expression-library: jsdelivr pixiv/three-vrm@dev animation paths 404 (repo restructured)
#   - cmu / 100style / lafan1: always manual (no direct download)
# Use the `threejs-mixamo` pack for a working clip, or import Mixamo FBX→GLB manually.


def download_sillytavern() -> bool:
    """Clone the SillyTavern VRM Assets repository.

    Downloads VRM animation files (VRMA format) which can be loaded
    directly by the ClipLayer's GLTFLoader with VRM plugin.

    Returns:
        True if download succeeded.

    Example:
        >>> download_sillytavern()
        True
    """
    pack_dir = ANIMATIONS_DIR / "sillytavern-vrm-assets"

    if pack_dir.exists() and any(pack_dir.glob("*.vrma")):
        logger.info("SillyTavern VRM Assets already downloaded — skipping")
        return True

    logger.info("Downloading SillyTavern VRM Assets Pack...")
    temp = TEMP_DIR / "sillytavern"
    temp.mkdir(parents=True, exist_ok=True)

    try:
        # Shallow clone to save bandwidth
        result = subprocess.run(
            ["git", "clone", "--depth", "1",
             "https://github.com/SillyTavern/SillyTavern-VRM-Assets.git",
             str(temp / "repo")],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            logger.error(f"Git clone failed: {result.stderr}")
            return False

        # Find and copy animation files
        pack_dir.mkdir(parents=True, exist_ok=True)
        repo_dir = temp / "repo"

        copied = 0
        for ext in ("*.vrma", "*.glb", "*.bvh", "*.fbx"):
            for f in repo_dir.rglob(ext):
                dest = pack_dir / f.name
                shutil.copy2(f, dest)
                copied += 1

        logger.info(f"  ✅ Copied {copied} animation files to {pack_dir}")

        # Clean up temp
        shutil.rmtree(temp, ignore_errors=True)
        return True

    except subprocess.TimeoutExpired:
        logger.error("Git clone timed out")
        return False
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return False


def download_cmu() -> bool:
    """Provide instructions for downloading CMU MoCap BVH files.

    CMU's MoCap database requires manual download from cgspeed.com.
    This function creates the target directory and a README with instructions.

    Returns:
        True (always, as it only creates placeholder instructions).

    Example:
        >>> download_cmu()
        True
    """
    pack_dir = ANIMATIONS_DIR / "cmu-mocap"
    pack_dir.mkdir(parents=True, exist_ok=True)

    if any(pack_dir.glob("*.bvh")) or any(pack_dir.glob("*.glb")):
        logger.info("CMU MoCap files already present — skipping")
        return True

    readme = pack_dir / "README_DOWNLOAD.txt"
    readme.write_text(
        "CMU Motion Capture Database — Manual Download Required\n"
        "=====================================================\n\n"
        "1. Visit: https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture\n"
        "2. Download the BVH conversion zip files\n"
        "3. Extract .bvh files into this directory\n"
        "4. Run: .venv/bin/python tools/convert_bvh_to_glb.py --input backend/storage/animations/cmu-mocap/ --output backend/storage/animations/cmu-mocap/ --skeleton cmu\n\n"
        "Recommended emotional/conversational files:\n"
        "  - 01_01.bvh through 01_10.bvh (general walking)\n"
        "  - 02_01.bvh through 02_05.bvh (arm motions)\n"
        "  - 05_01.bvh through 05_20.bvh (various actions)\n"
        "  - 13_01.bvh through 13_42.bvh (conversation gestures)\n"
        "  - 18_01.bvh through 18_14.bvh (joyful motions)\n"
    )

    logger.info(f"  📋 CMU MoCap instructions written to {readme}")
    logger.info("  → Manual download required — see README_DOWNLOAD.txt")
    return True


def download_100style() -> bool:
    """Provide instructions for downloading 100STYLE dataset.

    The 100STYLE dataset requires manual download from the project website.
    This function creates the target directory and a README with instructions.

    Returns:
        True (always, as it only creates placeholder instructions).

    Example:
        >>> download_100style()
        True
    """
    pack_dir = ANIMATIONS_DIR / "100style"
    pack_dir.mkdir(parents=True, exist_ok=True)

    if any(pack_dir.glob("*.bvh")) or any(pack_dir.glob("*.glb")):
        logger.info("100STYLE files already present — skipping")
        return True

    readme = pack_dir / "README_DOWNLOAD.txt"
    readme.write_text(
        "100STYLE Dataset — Manual Download Required\n"
        "============================================\n\n"
        "License: CC BY 4.0\n\n"
        "1. Visit: https://www.ianmason.com/100style\n"
        "2. Download the BVH files for desired emotion styles\n"
        "3. Extract .bvh files into this directory\n"
        "4. Run: .venv/bin/python tools/convert_bvh_to_glb.py --input backend/storage/animations/100style/ --output backend/storage/animations/100style/ --skeleton auto\n\n"
        "Recommended styles for emotional avatars:\n"
        "  - Happy, Sad, Angry, Afraid, Proud, Shy, Tired, Excited\n"
    )

    logger.info(f"  📋 100STYLE instructions written to {readme}")
    logger.info("  → Manual download required — see README_DOWNLOAD.txt")
    return True


def download_procedural_emotions() -> bool:
    """Skip procedural emotion animations — they are generated at runtime.

    The procedural-emotions pack is synthesised on-the-fly by motion_server
    and does not require any files on disk.  This function is a no-op that
    logs a clear explanation so ``--all`` runs stay informative.

    Returns:
        True (always — nothing to download).

    Example:
        >>> download_procedural_emotions()
        True
    """
    logger.info(
        "Procedural Emotions: skipped — clips are generated at runtime by "
        "motion_server, no files to download."
    )
    return True


# Ordered list of VRMA files hosted on the jsdelivr CDN mirror of three-vrm.
_VRM_EXPRESSION_CLIPS: list[str] = [
    "idle_loop.vrma",
    "gesture_nod.vrma",
    "gesture_shake_head.vrma",
    "gesture_wave.vrma",
]

_VRM_EXPRESSION_BASE_URL = (
    "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev"
    "/packages/three-vrm/examples/animations/"
)


def download_vrm_expression_library() -> bool:
    """Download VRM Expression Library VRMA clips from the jsdelivr CDN.

    Fetches four standard VRM animation files (idle, nod, shake, wave) that
    are compatible with any VRM 1.0 model.  Files are placed in
    ``backend/storage/animations/vrm-expression-library/``.

    Returns:
        True if all files downloaded successfully, False if any failed.

    Example:
        >>> download_vrm_expression_library()
        True
    """
    import urllib.request
    import urllib.error

    pack_dir = ANIMATIONS_DIR / "vrm-expression-library"

    existing = list(pack_dir.glob("*.vrma")) if pack_dir.exists() else []
    if len(existing) >= len(_VRM_EXPRESSION_CLIPS):
        logger.info("VRM Expression Library already downloaded — skipping")
        return True

    pack_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading VRM Expression Library from jsdelivr CDN...")

    success = True
    for filename in _VRM_EXPRESSION_CLIPS:
        dest = pack_dir / filename
        if dest.exists():
            logger.info(f"  Already present: {filename}")
            continue

        url = _VRM_EXPRESSION_BASE_URL + filename
        try:
            logger.info(f"  Fetching {filename} ...")
            urllib.request.urlretrieve(url, dest)
            logger.info(f"  Saved -> {dest}")
        except urllib.error.URLError as exc:
            logger.error(f"  Failed to download {filename}: {exc}")
            success = False
        except Exception as exc:  # noqa: BLE001
            logger.error(f"  Unexpected error downloading {filename}: {exc}")
            success = False

    if success:
        logger.info(f"  VRM Expression Library ready in {pack_dir}")
    return success


def download_lafan1() -> bool:
    """Provide instructions for downloading the Bandai Namco LaFAN1 dataset.

    LaFAN1 is distributed under CC BY-NC 4.0 and requires manual download from
    GitHub Releases followed by BVH-to-GLB conversion.  This function creates
    the target directory and a detailed README so developers know exactly what
    steps to take.

    Returns:
        True (always, as it only creates placeholder instructions).

    Example:
        >>> download_lafan1()
        True
    """
    pack_dir = ANIMATIONS_DIR / "bandai-namco-lafan1"
    pack_dir.mkdir(parents=True, exist_ok=True)

    if any(pack_dir.glob("*.bvh")) or any(pack_dir.glob("*.glb")):
        logger.info("LaFAN1 files already present — skipping")
        return True

    readme = pack_dir / "README_DOWNLOAD.txt"
    readme.write_text(
        "Bandai Namco LaFAN1 MoCap Dataset — Manual Download Required\n"
        "=============================================================\n\n"
        "License: CC BY-NC 4.0 (non-commercial use only)\n\n"
        "Steps:\n"
        "  1. Visit the Ubisoft La Forge Animation Dataset on GitHub:\n"
        "       https://github.com/ubisoft/ubisoft-laforge-animation-dataset/releases\n"
        "  2. Download the LaFAN1 BVH zip archive from the Releases page.\n"
        "  3. Extract the .bvh files you need into this directory.\n"
        "  4. Convert BVH files to GLB with VRM-compatible bones:\n"
        "       .venv/bin/python tools/convert_bvh_to_glb.py \\\n"
        "           --input backend/storage/animations/bandai-namco-lafan1/ \\\n"
        "           --output backend/storage/animations/bandai-namco-lafan1/ \\\n"
        "           --skeleton lafan1\n\n"
        "Clips referenced in animation_manifest.json:\n"
        "  - walk1_subject1.bvh  -> lafan_walk  (locomotion, loop)\n"
        "  - run1_subject1.bvh   -> lafan_run   (locomotion, loop)\n"
        "  - dance1_subject1.bvh -> lafan_dance (emotion, loop)\n"
        "  - aiming1_subject1.bvh -> lafan_gesture (reaction, one-shot)\n\n"
        "Note: This pack requires BVH-to-GLB conversion before use in-engine.\n"
        "The convert_bvh_to_glb.py tool handles bone remapping automatically.\n"
    )

    logger.info(f"  LaFAN1 instructions written to {readme}")
    logger.info("  -> Manual download required — see README_DOWNLOAD.txt")
    return True


_THREEJS_MIXAMO_CLIPS: list[str] = ["Xbot.glb", "Soldier.glb"]
_THREEJS_MIXAMO_BASE_URL = (
    "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/"
)


def download_threejs_mixamo() -> bool:
    """Download three.js example GLB models with Mixamo-rigged skeletons.

    These are the only verified-live auto-download clips as of 2026-05-31 (all
    other pack sources 404). Each GLB carries ``mixamorig:*`` bone names plus
    embedded :class:`THREE.AnimationClip` objects (idle/walk/run/gestures), which
    is exactly what ``ClipLayer.loadClip(url, name, {retarget: true})`` consumes —
    so they prove the retarget pipeline end-to-end.

    Files land in ``backend/storage/animations/threejs-mixamo/``.

    Returns:
        True if every clip downloaded successfully, False if any failed.

    Example:
        >>> download_threejs_mixamo()
        True
    """
    import urllib.request
    import urllib.error

    pack_dir = ANIMATIONS_DIR / "threejs-mixamo"
    pack_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading three.js Mixamo-rigged example models...")

    success = True
    for filename in _THREEJS_MIXAMO_CLIPS:
        dest = pack_dir / filename
        if dest.exists() and dest.stat().st_size > 0:
            logger.info(f"  Already present: {filename}")
            continue
        url = _THREEJS_MIXAMO_BASE_URL + filename
        try:
            logger.info(f"  Fetching {filename} ...")
            urllib.request.urlretrieve(url, dest)
            logger.info(f"  Saved -> {dest} ({dest.stat().st_size} bytes)")
        except (urllib.error.URLError, OSError) as exc:
            logger.error(f"  Failed to download {filename}: {exc}")
            success = False

    if success:
        logger.info(f"  three.js Mixamo pack ready in {pack_dir}")
    return success


def list_packs():
    """Print available animation packs with their status."""
    print("\nAvailable Animation Packs:")
    print("=" * 60)
    for pack_id, info in PACKS.items():
        pack_dir = ANIMATIONS_DIR / pack_id.replace("_", "-")
        status = "downloaded" if pack_dir.exists() and any(pack_dir.iterdir()) else "not downloaded"
        dl_type = "auto" if info["type"] == "git" else "manual"
        print(f"\n  {pack_id}")
        print(f"    Name:    {info['name']}")
        print(f"    License: {info['license']}")
        print(f"    Type:    {dl_type}")
        print(f"    Status:  {status}")
        print(f"    Desc:    {info['description']}")
    print()


DOWNLOADERS = {
    "sillytavern": download_sillytavern,
    "cmu": download_cmu,
    "100style": download_100style,
    "procedural-emotions": download_procedural_emotions,
    "vrm-expression-library": download_vrm_expression_library,
    "lafan1": download_lafan1,
    "threejs-mixamo": download_threejs_mixamo,
}


def main():
    """CLI entry point for animation pack management."""
    parser = argparse.ArgumentParser(description="Download animation packs for the clip library.")
    parser.add_argument("--all", action="store_true", help="Download all available packs")
    parser.add_argument("--pack", choices=list(DOWNLOADERS.keys()), help="Download a specific pack")
    parser.add_argument("--list", action="store_true", help="List available packs")
    parser.add_argument("--convert", action="store_true",
                        help="Run BVH→GLB conversion after download")

    args = parser.parse_args()

    if args.list:
        list_packs()
        return

    ANIMATIONS_DIR.mkdir(parents=True, exist_ok=True)

    if args.pack:
        dl = DOWNLOADERS.get(args.pack)
        if dl:
            dl()
    elif args.all:
        for pack_id, dl in DOWNLOADERS.items():
            logger.info(f"\n{'='*50}")
            logger.info(f"Processing: {PACKS[pack_id]['name']}")
            logger.info(f"{'='*50}")
            dl()
    else:
        parser.print_help()
        return

    if args.convert:
        logger.info("\nRunning BVH → GLB conversion...")
        from tools.convert_bvh_to_glb import bvh_to_glb
        for bvh_file in ANIMATIONS_DIR.rglob("*.bvh"):
            glb_path = bvh_file.with_suffix(".glb")
            if not glb_path.exists():
                bvh_to_glb(bvh_file, glb_path, skeleton="auto")


if __name__ == "__main__":
    main()
