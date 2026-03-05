#!/usr/bin/env python3
"""Download and convert animation packs for the clip-based animation library.

Downloads BVH/FBX animation files from three sources, converts them to GLB
with VRM-compatible bone names, and organises them for the animation manifest.

Sources:
    1. **SillyTavern VRM Assets Pack** — MIT-licensed VRM animation files
    2. **CMU MoCap** — curated subset of emotional/conversational BVH files
    3. **100STYLE** — emotional locomotion styles (CC BY 4.0)

Usage:
    .venv/bin/python tools/download_animation_packs.py --all
    .venv/bin/python tools/download_animation_packs.py --pack sillytavern
    .venv/bin/python tools/download_animation_packs.py --pack cmu
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
}


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
}


def main():
    """CLI entry point for animation pack management."""
    parser = argparse.ArgumentParser(description="Download animation packs for the clip library.")
    parser.add_argument("--all", action="store_true", help="Download all available packs")
    parser.add_argument("--pack", choices=list(PACKS.keys()), help="Download a specific pack")
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
