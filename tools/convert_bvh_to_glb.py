#!/usr/bin/env python3
"""Offline BVH-to-GLB converter with VRM-compatible bone name remapping.

Converts BVH (Biovision Hierarchy) motion capture files to GLB format
with automatic skeleton convention detection and bone name remapping
for VRM avatar compatibility.

Supported skeleton conventions:
    - **CMU**: Carnegie Mellon University MoCap database bone names
    - **Mixamo**: Adobe Mixamo ``mixamorig:`` prefixed bone names
    - **VRM-native**: VRM 1.0 humanoid bone names (passthrough)

Usage:
    .venv/bin/python tools/convert_bvh_to_glb.py \\
        --input data/bvh/ \\
        --output backend/storage/animations/ \\
        --skeleton auto

    .venv/bin/python tools/convert_bvh_to_glb.py \\
        --input walk.bvh \\
        --output animations/walk.glb \\
        --fps 30 --trim-start 0.5 --trim-end 1.0

Dependencies:
    pip install bvh pygltflib numpy
"""

from __future__ import annotations

import argparse
import json
import logging
import struct
import sys
from pathlib import Path
from typing import Optional

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── Skeleton bone name maps ─────────────────────────────────────────────────

CMU_TO_VRM = {
    "Hips": "hips",
    "LHipJoint": "leftUpperLeg",
    "LeftUpLeg": "leftUpperLeg",
    "LeftLeg": "leftLowerLeg",
    "LeftFoot": "leftFoot",
    "LeftToeBase": "leftToes",
    "RHipJoint": "rightUpperLeg",
    "RightUpLeg": "rightUpperLeg",
    "RightLeg": "rightLowerLeg",
    "RightFoot": "rightFoot",
    "RightToeBase": "rightToes",
    "LowerBack": "spine",
    "Spine": "chest",
    "Spine1": "upperChest",
    "Neck": "neck",
    "Neck1": "neck",
    "Head": "head",
    "LeftShoulder": "leftShoulder",
    "LeftArm": "leftUpperArm",
    "LeftForeArm": "leftLowerArm",
    "LeftHand": "leftHand",
    "RightShoulder": "rightShoulder",
    "RightArm": "rightUpperArm",
    "RightForeArm": "rightLowerArm",
    "RightHand": "rightHand",
}

MIXAMO_TO_VRM = {
    "mixamorig:Hips": "hips",
    "mixamorig:Spine": "spine",
    "mixamorig:Spine1": "chest",
    "mixamorig:Spine2": "upperChest",
    "mixamorig:Neck": "neck",
    "mixamorig:Head": "head",
    "mixamorig:LeftShoulder": "leftShoulder",
    "mixamorig:LeftArm": "leftUpperArm",
    "mixamorig:LeftForeArm": "leftLowerArm",
    "mixamorig:LeftHand": "leftHand",
    "mixamorig:RightShoulder": "rightShoulder",
    "mixamorig:RightArm": "rightUpperArm",
    "mixamorig:RightForeArm": "rightLowerArm",
    "mixamorig:RightHand": "rightHand",
    "mixamorig:LeftUpLeg": "leftUpperLeg",
    "mixamorig:LeftLeg": "leftLowerLeg",
    "mixamorig:LeftFoot": "leftFoot",
    "mixamorig:LeftToeBase": "leftToes",
    "mixamorig:RightUpLeg": "rightUpperLeg",
    "mixamorig:RightLeg": "rightLowerLeg",
    "mixamorig:RightFoot": "rightFoot",
    "mixamorig:RightToeBase": "rightToes",
}


def detect_skeleton(bone_names: list[str]) -> str:
    """Auto-detect the skeleton convention from bone names.

    Args:
        bone_names: List of bone/joint names from the BVH file.

    Returns:
        One of ``"cmu"``, ``"mixamo"``, or ``"vrm"`` (native passthrough).

    Example:
        >>> detect_skeleton(["mixamorig:Hips", "mixamorig:Spine"])
        'mixamo'
    """
    names_str = " ".join(bone_names)
    if "mixamorig:" in names_str:
        return "mixamo"
    if "LHipJoint" in names_str or "LowerBack" in names_str:
        return "cmu"
    # Check for VRM bone names
    vrm_names = {"hips", "spine", "chest", "head", "neck"}
    lower_names = {n.lower() for n in bone_names}
    if len(vrm_names & lower_names) >= 3:
        return "vrm"
    return "cmu"  # Default fallback


def remap_bone(name: str, skeleton: str) -> str:
    """Remap a bone name to VRM convention.

    Args:
        name: Original bone name from the BVH file.
        skeleton: Skeleton convention (``"cmu"``, ``"mixamo"``, or ``"vrm"``).

    Returns:
        VRM-compatible bone name, or original name if no mapping found.

    Example:
        >>> remap_bone("mixamorig:Hips", "mixamo")
        'hips'
    """
    if skeleton == "mixamo":
        return MIXAMO_TO_VRM.get(name, name)
    elif skeleton == "cmu":
        return CMU_TO_VRM.get(name, name)
    return name  # VRM native — passthrough


def euler_to_quaternion(euler_xyz: np.ndarray) -> np.ndarray:
    """Convert ZYX Euler angles (degrees) to a quaternion (x, y, z, w).

    BVH files store rotations as Euler angles in degrees. GLB/glTF uses
    quaternions. This function performs the conversion using the ZYX
    rotation order (most common in BVH files).

    Args:
        euler_xyz: Array of shape ``(3,)`` with [X, Y, Z] rotations in degrees.

    Returns:
        Array of shape ``(4,)`` with [x, y, z, w] quaternion components.

    Example:
        >>> q = euler_to_quaternion(np.array([0.0, 90.0, 0.0]))
        >>> abs(q[3] - 0.707) < 0.01
        True
    """
    # Convert to radians
    rx, ry, rz = np.radians(euler_xyz)

    # Half angles
    cx, sx = np.cos(rx / 2), np.sin(rx / 2)
    cy, sy = np.cos(ry / 2), np.sin(ry / 2)
    cz, sz = np.cos(rz / 2), np.sin(rz / 2)

    # ZYX rotation order
    w = cx * cy * cz + sx * sy * sz
    x = sx * cy * cz - cx * sy * sz
    y = cx * sy * cz + sx * cy * sz
    z = cx * cy * sz - sx * sy * cz

    return np.array([x, y, z, w], dtype=np.float32)


def parse_bvh(filepath: Path) -> dict:
    """Parse a BVH file into a structured dict.

    Args:
        filepath: Path to the BVH file.

    Returns:
        Dict with keys:
            - ``joints``: List of joint dicts with ``name``, ``offset``, ``channels``
            - ``frames``: Number of frames
            - ``frame_time``: Seconds per frame
            - ``motion``: 2D numpy array of shape ``(frames, total_channels)``

    Example:
        >>> data = parse_bvh(Path("walk.bvh"))
        >>> data["frames"]
        120
    """
    try:
        from bvh import Bvh
    except ImportError:
        logger.error("'bvh' package not installed. Run: .venv/bin/pip install bvh")
        sys.exit(1)

    with open(filepath, "r") as f:
        mocap = Bvh(f.read())

    joints = []
    for joint in mocap.get_joints():
        joint_data = {
            "name": joint.name,
            "offset": list(joint["OFFSET"]) if "OFFSET" in joint else [0, 0, 0],
            "channels": [ch for ch in joint["CHANNELS"][1:]] if "CHANNELS" in joint else [],
        }
        joints.append(joint_data)

    frames = mocap.nframes
    frame_time = mocap.frame_time
    motion = np.array([[float(v) for v in mocap.frame_joint_channels(frame, joint.name, joint_data["channels"])]
                        for frame in range(frames)
                        for joint, joint_data in [(j, joints[i]) for i, j in enumerate(mocap.get_joints())]])

    # Reshape: total values per frame = sum of channels
    total_channels = sum(len(j["channels"]) for j in joints)
    motion = motion.reshape(frames, total_channels)

    return {
        "joints": joints,
        "frames": frames,
        "frame_time": frame_time,
        "motion": motion,
    }


def bvh_to_glb(
    bvh_path: Path,
    output_path: Path,
    *,
    skeleton: str = "auto",
    fps: Optional[int] = None,
    trim_start: float = 0.0,
    trim_end: float = 0.0,
) -> bool:
    """Convert a single BVH file to GLB format with VRM bone names.

    Args:
        bvh_path: Path to input BVH file.
        output_path: Path for output GLB file.
        skeleton: Skeleton convention or ``"auto"`` for detection.
        fps: Target FPS (None = use BVH native frame rate).
        trim_start: Seconds to trim from the start.
        trim_end: Seconds to trim from the end.

    Returns:
        True if conversion succeeded, False otherwise.

    Example:
        >>> bvh_to_glb(Path("walk.bvh"), Path("walk.glb"), skeleton="auto")
        True
    """
    try:
        from pygltflib import GLTF2, Animation, AnimationChannel, AnimationChannelTarget, AnimationSampler, Accessor, BufferView, Buffer
    except ImportError:
        logger.error("'pygltflib' package not installed. Run: .venv/bin/pip install pygltflib")
        return False

    try:
        data = parse_bvh(bvh_path)
    except Exception as e:
        logger.error(f"Failed to parse {bvh_path}: {e}")
        return False

    joints = data["joints"]
    frames = data["frames"]
    frame_time = data["frame_time"]
    motion = data["motion"]

    # Auto-detect skeleton if needed
    bone_names = [j["name"] for j in joints]
    if skeleton == "auto":
        skeleton = detect_skeleton(bone_names)
        logger.info(f"  Detected skeleton: {skeleton}")

    # Apply FPS resampling
    if fps and fps != round(1.0 / frame_time):
        step = max(1, round((1.0 / frame_time) / fps))
        motion = motion[::step]
        frames = len(motion)
        frame_time = 1.0 / fps

    # Apply trimming
    start_frame = int(trim_start / frame_time) if trim_start > 0 else 0
    end_frame = frames - int(trim_end / frame_time) if trim_end > 0 else frames
    motion = motion[start_frame:end_frame]
    frames = len(motion)

    if frames == 0:
        logger.warning(f"  No frames after trimming — skipping {bvh_path.name}")
        return False

    # Build time array
    times = np.arange(frames, dtype=np.float32) * frame_time
    duration = times[-1] if len(times) > 0 else 0

    # Build quaternion tracks per joint
    channel_offset = 0
    tracks = []  # (bone_name, quaternions_array)

    for joint in joints:
        n_channels = len(joint["channels"])
        if n_channels == 0:
            continue

        vrm_name = remap_bone(joint["name"], skeleton)

        # Extract rotation channels (typically the last 3 of 6 channels, or all 3)
        if n_channels >= 6:
            # Position (3) + Rotation (3) — root joint
            rot_data = motion[:, channel_offset + 3:channel_offset + 6]
        elif n_channels == 3:
            # Rotation only
            rot_data = motion[:, channel_offset:channel_offset + 3]
        else:
            channel_offset += n_channels
            continue

        # Convert Euler → Quaternion for each frame
        quats = np.array([euler_to_quaternion(rot_data[f]) for f in range(frames)],
                         dtype=np.float32)
        tracks.append((vrm_name, quats))

        channel_offset += n_channels

    if not tracks:
        logger.warning(f"  No rotation tracks extracted — skipping {bvh_path.name}")
        return False

    # Build a minimal glTF with just animations (no mesh/skeleton — animations-only GLB)
    gltf = GLTF2()
    gltf.asset = {"version": "2.0", "generator": "waifu-rt3d bvh_to_glb converter"}

    # We need nodes for each bone so animations can reference them
    from pygltflib import Node
    node_indices = {}
    for bone_name, _ in tracks:
        idx = len(gltf.nodes) if hasattr(gltf, 'nodes') and gltf.nodes else 0
        if not gltf.nodes:
            gltf.nodes = []
        gltf.nodes.append(Node(name=bone_name))
        node_indices[bone_name] = len(gltf.nodes) - 1

    # Build binary buffer with time + quaternion data
    binary_data = bytearray()

    # Time accessor
    time_bytes = times.tobytes()
    time_offset = len(binary_data)
    binary_data.extend(time_bytes)

    if not gltf.bufferViews:
        gltf.bufferViews = []
    if not gltf.accessors:
        gltf.accessors = []

    time_bv_idx = len(gltf.bufferViews)
    gltf.bufferViews.append(BufferView(
        buffer=0, byteOffset=time_offset, byteLength=len(time_bytes)
    ))
    time_acc_idx = len(gltf.accessors)
    gltf.accessors.append(Accessor(
        bufferView=time_bv_idx, componentType=5126, count=frames,
        type="SCALAR", max=[float(times[-1])], min=[float(times[0])]
    ))

    # Build animation channels and samplers
    if not gltf.animations:
        gltf.animations = []

    animation = Animation(name=bvh_path.stem, channels=[], samplers=[])

    for bone_name, quats in tracks:
        if bone_name not in node_indices:
            continue

        # Quaternion data
        quat_bytes = quats.tobytes()
        quat_offset = len(binary_data)
        binary_data.extend(quat_bytes)

        quat_bv_idx = len(gltf.bufferViews)
        gltf.bufferViews.append(BufferView(
            buffer=0, byteOffset=quat_offset, byteLength=len(quat_bytes)
        ))
        quat_acc_idx = len(gltf.accessors)
        gltf.accessors.append(Accessor(
            bufferView=quat_bv_idx, componentType=5126, count=frames,
            type="VEC4"
        ))

        sampler_idx = len(animation.samplers)
        animation.samplers.append(AnimationSampler(
            input=time_acc_idx, output=quat_acc_idx, interpolation="LINEAR"
        ))
        animation.channels.append(AnimationChannel(
            sampler=sampler_idx,
            target=AnimationChannelTarget(
                node=node_indices[bone_name], path="rotation"
            )
        ))

    gltf.animations.append(animation)

    # Buffer
    if not gltf.buffers:
        gltf.buffers = []
    gltf.buffers.append(Buffer(byteLength=len(binary_data)))

    # Scene
    from pygltflib import Scene
    if not gltf.scenes:
        gltf.scenes = []
    gltf.scenes.append(Scene(nodes=list(range(len(gltf.nodes)))))
    gltf.scene = 0

    # Set binary blob
    gltf.set_binary_blob(bytes(binary_data))

    # Save
    output_path.parent.mkdir(parents=True, exist_ok=True)
    gltf.save(str(output_path))

    logger.info(f"  ✅ {bvh_path.name} → {output_path.name} ({frames} frames, {len(tracks)} bones, {duration:.1f}s)")
    return True


def main():
    """CLI entry point for batch BVH → GLB conversion."""
    parser = argparse.ArgumentParser(
        description="Convert BVH motion capture files to GLB with VRM-compatible bone names."
    )
    parser.add_argument("--input", "-i", required=True, help="Input BVH file or directory")
    parser.add_argument("--output", "-o", required=True, help="Output GLB file or directory")
    parser.add_argument("--skeleton", "-s", default="auto",
                        choices=["auto", "cmu", "mixamo", "vrm"],
                        help="Skeleton convention (default: auto-detect)")
    parser.add_argument("--fps", type=int, default=None, help="Target FPS (default: native)")
    parser.add_argument("--trim-start", type=float, default=0.0,
                        help="Seconds to trim from start")
    parser.add_argument("--trim-end", type=float, default=0.0,
                        help="Seconds to trim from end")

    args = parser.parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if input_path.is_file():
        # Single file conversion
        if output_path.suffix == "":
            output_path = output_path / (input_path.stem + ".glb")
        bvh_to_glb(input_path, output_path, skeleton=args.skeleton,
                    fps=args.fps, trim_start=args.trim_start, trim_end=args.trim_end)
    elif input_path.is_dir():
        # Batch conversion
        bvh_files = sorted(input_path.glob("**/*.bvh"))
        if not bvh_files:
            logger.warning(f"No .bvh files found in {input_path}")
            return

        logger.info(f"Converting {len(bvh_files)} BVH files...")
        success = 0
        for bvh_file in bvh_files:
            glb_name = bvh_file.stem + ".glb"
            # Preserve subdirectory structure
            rel = bvh_file.relative_to(input_path)
            out = output_path / rel.parent / glb_name
            if bvh_to_glb(bvh_file, out, skeleton=args.skeleton,
                          fps=args.fps, trim_start=args.trim_start, trim_end=args.trim_end):
                success += 1

        logger.info(f"Done: {success}/{len(bvh_files)} converted successfully")
    else:
        logger.error(f"Input not found: {input_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
