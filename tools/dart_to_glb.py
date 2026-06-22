"""Convert a DART SMPL-X motion ``.npz`` into a normalized-VRM GLB clip.

Stage 3 Phase 2 (``docs/plans/2026-06-14-stage3-ai-motion.md``). DART generates
text->motion on the RTX 5080 and exports SMPL-X axis-angle parameters
(``poses (T, 165)`` + ``trans (T, 3)``, 30 fps). The viewer can only play motion
as **three-vrm normalized-space** per-bone rotations on the VRM humanoid rig. This
tool bridges the two: SMPL-X axis-angle -> per-VRM-bone normalized quaternion
tracks -> a ``J_Bip_*``-named GLB that ``ClipLayer.loadClip(url, name,
{retarget:true})`` ingests through the exact same path the baked Stage-1 clips use.

Why the conversion is a single per-joint conjugation (no explicit FK)
====================================================================
three-vrm NORMALIZED space was ground-truth-measured in
``tools/verify/ground_truth.mjs`` (Bug 2, 2026-06-11): its rest pose has every
bone's WORLD rotation at identity (T-pose) and bone locals compose as ordinary
forward kinematics. SMPL/SMPL-X shares that property -- its rest ("template")
pose carries the body shape in the joint *offsets*, while every joint's rest
*rotation* is identity. So both rigs measure pose as "world rotation relative to
an identity-rotation rest", and the two only differ by:

  1. a global frame change ``G`` (SMPL/AMASS world is **Z-up**; glTF/VRM is
     **Y-up**), and
  2. a small residual rest-direction mismatch (SMPL template arms hang ~16 deg
     below horizontal; the VRM T-pose holds them horizontal). Pure
     rotation-copy ignores (2); the render gate decides whether it matters.

Let ``W_smpl(b)`` be a joint's world rotation (the FK product including
``global_orient``) and ``W_norm(b)`` the desired VRM normalized world rotation.
Re-expressing the *same physical orientation* in the Y-up basis is the change of
basis ``W_norm(b) = G W_smpl(b) G^-1``. The normalized local then telescopes:

    normalized_local(b) = W_norm(parent)^-1 * W_norm(b)
                        = G * (W_smpl(parent)^-1 * W_smpl(b)) * G^-1
                        = G * smpl_local(b) * G^-1

because SMPL FK gives ``W_smpl(b) = W_smpl(parent) * smpl_local(b)`` and
``smpl_local(b)`` is exactly ``poses[3b:3b+3]`` (axis-angle). Every
time-dependent parent term cancels -- each bone converts independently, so the
output is just the per-joint axis-angle quaternion conjugated by ``G``. No bone
lengths, no rest joint positions, no FK chain required for the rotation result.

The viewer's retarget path is ROTATION-ONLY: it drops every ``.position`` /
``.scale`` track (``viewer.html`` ``retargetClip``). So root translation
(``trans``) does not play through this clip -- the motion is in-place, with the
VRM's own rest grounding the feet. That matches how Stage-1/2 clips behave and
keeps the #1 sensitive area (grounding) governed by the proven path.

``G`` (the only thing not derived from first principles) is the Z-up->Y-up frame
change ``Rx(-90 deg)``: ``(x, y, z) -> (x, z, -y)``, mapping AMASS +Z(up) to
glTF +Y(up). An optional ``--yaw`` spins the avatar about the vertical (the one
visually-ambiguous DOF: which way she faces the camera) and is tuned against the
render gate -- never guessed (the Bug-2 lesson).

Usage:
    .venv/bin/python tools/dart_to_glb.py sample_0_smplx.npz [-o out.glb]
    .venv/bin/python tools/dart_to_glb.py in.npz --name walk_circles --yaw 180

Render-gate the result (do NOT trust the math -- render it):
    node tools/verify/render_clip.mjs --clip /files/<served-path>.glb \\
        --name dart --frames 6 --retarget
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

# Reuse the proven, single-source quaternion + GLB helpers from the Bug-2 tool so
# the normalized contract has exactly one implementation. tools/ is not a package,
# so make sibling import work both as a script and under pytest.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert_to_normalized import (  # noqa: E402
    GLB_MAGIC,
    CHUNK_JSON,
    CHUNK_BIN,
    q_mul,
    q_inv,
    q_normalize,
    write_glb,
)

# ── SMPL-X body joint index -> VRoid raw bone name (J_Bip_*) ───────────────────
# SMPL-X pose layout (165 = axis-angle per joint):
#   [0:3]   global_orient (pelvis / root)
#   [3:66]  body_pose      (joints 1..21, 21 * 3)
#   [66:75] jaw + leye + reye   (not mapped -- VRM face is blendshape-driven)
#   [75:165] left_hand + right_hand (15+15 joints; not part of the humanoid map)
# Joint order is the canonical SMPL kinematic tree. We map the 22 body joints
# (0..21) onto the 22 VRM humanoid bones the viewer's VRM_BONE_MAP recognises.
SMPL_BONE_MAP: dict[int, str] = {
    0:  "J_Bip_C_Hips",
    1:  "J_Bip_L_UpperLeg",
    2:  "J_Bip_R_UpperLeg",
    3:  "J_Bip_C_Spine",
    4:  "J_Bip_L_LowerLeg",
    5:  "J_Bip_R_LowerLeg",
    6:  "J_Bip_C_Chest",
    7:  "J_Bip_L_Foot",      # SMPL ankle -> VRM foot
    8:  "J_Bip_R_Foot",
    9:  "J_Bip_C_UpperChest",
    10: "J_Bip_L_ToeBase",   # SMPL foot (ball) -> VRM toes
    11: "J_Bip_R_ToeBase",
    12: "J_Bip_C_Neck",
    13: "J_Bip_L_Shoulder",  # SMPL collar -> VRM shoulder
    14: "J_Bip_R_Shoulder",
    15: "J_Bip_C_Head",
    16: "J_Bip_L_UpperArm",  # SMPL shoulder -> VRM upper arm
    17: "J_Bip_R_UpperArm",
    18: "J_Bip_L_LowerArm",  # SMPL elbow -> VRM lower arm
    19: "J_Bip_R_LowerArm",
    20: "J_Bip_L_Hand",      # SMPL wrist -> VRM hand
    21: "J_Bip_R_Hand",
}

POSE_DIM = 165  # SMPL-X full axis-angle pose width


# ── rotation helpers (glTF order x, y, z, w) ───────────────────────────────────

def axis_angle_to_quat(aa: np.ndarray) -> np.ndarray:
    """Convert a batch of axis-angle 3-vectors to unit quaternions (x, y, z, w).

    Args:
        aa: Array of shape ``(..., 3)``; each 3-vector's direction is the
            rotation axis and its magnitude the rotation angle in radians (the
            SMPL/Rodrigues convention).

    Returns:
        Array of shape ``(..., 4)`` of unit quaternions in glTF ``(x, y, z, w)``
        order. A zero vector maps to the identity quaternion.

    Example:
        >>> q = axis_angle_to_quat(np.array([0.0, 0.0, np.pi / 2]))  # 90 deg /Z
        >>> bool(abs(q[2] - np.sin(np.pi / 4)) < 1e-6 and abs(q[3] - np.cos(np.pi / 4)) < 1e-6)
        True
    """
    aa = np.asarray(aa, dtype=np.float64)
    angle = np.linalg.norm(aa, axis=-1, keepdims=True)  # (..., 1)
    # Guard the small-angle singularity: where angle->0, axis is undefined but
    # sin(angle/2)/angle -> 1/2, so xyz -> aa/2 and the limit is the identity.
    safe = np.where(angle < 1e-8, 1.0, angle)
    axis = aa / safe
    half = angle / 2.0
    xyz = axis * np.sin(half)
    w = np.cos(half)
    q = np.concatenate([xyz, w], axis=-1)
    # Exactly identity at the singularity (avoid tiny non-unit drift there).
    q = np.where(angle < 1e-8, np.array([0.0, 0.0, 0.0, 1.0]), q)
    return q_normalize(q)


def quat_from_axis_angle(axis: tuple[float, float, float], deg: float) -> np.ndarray:
    """Single quaternion (x, y, z, w) for a rotation of ``deg`` about ``axis``."""
    a = np.asarray(axis, dtype=np.float64)
    a = a / np.linalg.norm(a)
    return axis_angle_to_quat(a * np.radians(deg))


def build_root_transform(yaw_deg: float = 0.0) -> np.ndarray:
    """Build the rigid root re-orientation that stands the body up in glTF Y-up.

    SMPL/SMPL-X world rotations are expressed in one canonical (template) basis
    that is itself Y-up -- but AMASS/BABEL *data* (which DART is trained on)
    authors ``global_orient`` so the standing body's head points toward +Z, i.e.
    it lies down when dropped straight into a Y-up renderer. Rotating the whole
    body rigidly upright is therefore a single LEFT-multiply on the *root* joint
    only: ``W'(root) = G_pre * W(root)``. Because that rigid rotation cancels in
    every child's ``W'(parent)^-1 * W'(child)`` (see module docstring), child
    bones keep their raw SMPL local rotation -- conjugating them too would
    double-apply the frame change and lay the avatar on her side (the first
    render-gate failure, 2026-06-22).

    ``G_pre`` is ``Rx(-90 deg)`` -- ``(x, y, z) -> (x, z, -y)`` -- mapping the
    data's +Z (up) to glTF +Y (up). ``yaw_deg`` then spins her about glTF +Y to
    face the camera; it is the one visually-ambiguous DOF, tuned against the
    render gate, never guessed (the Bug-2 lesson).

    Args:
        yaw_deg: Rotation about glTF +Y in degrees, applied after the up-fix.

    Returns:
        Unit quaternion ``G_pre`` (x, y, z, w), left-multiplied onto the root.
    """
    g = quat_from_axis_angle((1.0, 0.0, 0.0), -90.0)
    if yaw_deg:
        g = q_mul(quat_from_axis_angle((0.0, 1.0, 0.0), yaw_deg), g)
    return q_normalize(g)


def _rotate_vec(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Rotate 3-vector ``v`` by quaternion ``q`` (x, y, z, w)."""
    x, y, z, w = q
    u = np.array([x, y, z], dtype=np.float64)
    v = np.asarray(v, dtype=np.float64)
    return 2 * np.dot(u, v) * u + (w * w - np.dot(u, u)) * v + 2 * w * np.cross(u, v)


# The VRM normalized-rest forward (chest-out) direction in glTF; three-vrm models
# face +Z. The camera looks down -Z toward the origin, so +Z faces the camera.
# Confirmed by the --face-camera render gate (2026-06-22): a back-to-camera wave
# clip turns to face the camera with this value.
VRM_FORWARD = np.array([0.0, 0.0, 1.0])


def compute_facing_yaw(global_orient0: np.ndarray) -> float:
    """Yaw (degrees) that turns the avatar to face the camera at the first frame.

    The clip's ``global_orient`` sets the body's absolute facing, which is
    arbitrary per generated clip. This computes the single about-vertical yaw that
    rotates frame 0's facing onto glTF +Z (toward the camera). Because it is a
    constant yaw applied to the root for the whole clip, all *relative* body
    rotation in the motion (e.g. a turn) is preserved -- only the starting
    orientation is normalised.

    Args:
        global_orient0: Frame-0 root axis-angle (3,), i.e. ``poses[0, :3]``.

    Returns:
        Yaw in degrees to pass as ``yaw_deg`` to the converter.
    """
    g_base = quat_from_axis_angle((1.0, 0.0, 0.0), -90.0)        # up-fix only
    root0 = q_mul(g_base, axis_angle_to_quat(np.asarray(global_orient0)))
    fwd = _rotate_vec(root0, VRM_FORWARD)                        # facing in glTF
    # Angle of the ground-plane facing from +Z; negate to rotate it back to +Z.
    return float(-np.degrees(np.arctan2(fwd[0], fwd[2])))


def load_dart_npz(path: Path) -> tuple[np.ndarray, float]:
    """Load and validate a DART SMPL-X ``.npz``.

    Args:
        path: Path to the DART export (must contain ``poses`` and a frame rate).

    Returns:
        Tuple of (``poses`` as ``(T, 165)`` float64, ``fps`` float).

    Raises:
        ValueError: If ``poses`` is missing, mis-shaped, or contains NaN.
    """
    data = np.load(path, allow_pickle=True)
    if "poses" not in data:
        raise ValueError(f"{path}: no 'poses' array (not a DART SMPL-X export?)")
    poses = np.asarray(data["poses"], dtype=np.float64)
    if poses.ndim != 2 or poses.shape[1] != POSE_DIM:
        raise ValueError(f"{path}: expected poses (T, {POSE_DIM}), got {poses.shape}")
    if not np.isfinite(poses).all():
        raise ValueError(f"{path}: poses contains NaN/Inf")
    fps = 30.0
    for key in ("mocap_framerate", "mocap_frame_rate", "fps", "framerate"):
        if key in data:
            fps = float(np.asarray(data[key]).reshape(-1)[0])
            break
    if fps <= 0:
        raise ValueError(f"{path}: non-positive frame rate {fps}")
    return poses, fps


def convert_poses_to_tracks(
    poses: np.ndarray, yaw_deg: float = 0.0
) -> dict[str, np.ndarray]:
    """Convert SMPL-X axis-angle poses to per-VRM-bone normalized quaternion tracks.

    The root (hips, SMPL joint 0) gets a left-multiplied rigid re-orientation
    ``G_pre`` (stand-up + facing yaw); every other bone keeps its raw SMPL local
    rotation, since ``G_pre`` cancels in the child telescoping. See
    :func:`build_root_transform` and the module docstring.

    Args:
        poses: ``(T, 165)`` SMPL-X axis-angle pose parameters.
        yaw_deg: Facing yaw passed to :func:`build_root_transform`.

    Returns:
        Dict mapping each ``J_Bip_*`` bone name to a ``(T, 4)`` float64 array of
        unit quaternions (x, y, z, w) in three-vrm normalized space.

    Raises:
        ValueError: If any produced quaternion is non-finite.
    """
    g_pre = build_root_transform(yaw_deg)
    n_frames = poses.shape[0]
    g_pre_b = np.broadcast_to(g_pre, (n_frames, 4))
    tracks: dict[str, np.ndarray] = {}
    for j, bone in SMPL_BONE_MAP.items():
        aa = poses[:, 3 * j : 3 * j + 3]            # (T, 3) local axis-angle
        q_smpl = axis_angle_to_quat(aa)             # (T, 4)
        if j == 0:
            # Root: rigidly stand the body upright in glTF Y-up (left-multiply).
            q_norm = q_normalize(q_mul(g_pre_b, q_smpl))
        else:
            # Child: raw local — the rigid root rotation cancels in the chain.
            q_norm = q_smpl
        if not np.isfinite(q_norm).all():
            raise ValueError(f"bone {bone}: non-finite quaternion produced")
        tracks[bone] = q_norm
    return tracks


# ── GLB assembly (animations-only, J_Bip_* named nodes) ────────────────────────

def build_glb(tracks: dict[str, np.ndarray], fps: float, anim_name: str) -> tuple[dict, bytearray]:
    """Assemble an animations-only GLB the viewer's retarget path can ingest.

    Produces one node per bone (named ``J_Bip_*``) and a single animation whose
    rotation channels target those nodes with LINEAR quaternion samplers. Only
    rotation is emitted -- the viewer drops position/scale anyway. ``asset.extras
    .vrmNormalizedSpace`` is flagged so the values are self-documenting (and so
    ``convert_to_normalized.py`` refuses to double-convert the output).

    Args:
        tracks: Bone name -> ``(T, 4)`` quaternion array (from
            :func:`convert_poses_to_tracks`).
        fps: Sampling rate, used to build the time accessor.
        anim_name: Name stored on the glTF animation.

    Returns:
        Tuple of (gltf JSON dict, BIN bytearray) ready for ``write_glb``.
    """
    bones = list(tracks)
    n_frames = tracks[bones[0]].shape[0]
    times = (np.arange(n_frames, dtype=np.float32) / fps)

    binary = bytearray()
    buffer_views: list[dict] = []
    accessors: list[dict] = []

    def add_accessor(arr: np.ndarray, comp_type: str, extra: dict | None = None) -> int:
        """Append a tightly-packed float32 accessor + its bufferView; return its index."""
        raw = np.ascontiguousarray(arr, dtype="<f4").tobytes()
        # 4-byte align each bufferView (float32 component boundary).
        if len(binary) % 4:
            binary.extend(b"\x00" * (-len(binary) % 4))
        offset = len(binary)
        binary.extend(raw)
        bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
        acc = {
            "bufferView": bv_idx,
            "componentType": 5126,  # FLOAT
            "count": arr.shape[0],
            "type": comp_type,
        }
        if extra:
            acc.update(extra)
        accessors.append(acc)
        return len(accessors) - 1

    time_acc = add_accessor(
        times.reshape(-1, 1), "SCALAR",
        {"min": [float(times[0])], "max": [float(times[-1])]},
    )

    nodes: list[dict] = []
    channels: list[dict] = []
    samplers: list[dict] = []
    for bone in bones:
        node_idx = len(nodes)
        nodes.append({"name": bone})
        out_acc = add_accessor(tracks[bone].astype("<f4"), "VEC4")
        samplers.append({"input": time_acc, "output": out_acc, "interpolation": "LINEAR"})
        channels.append({
            "sampler": len(samplers) - 1,
            "target": {"node": node_idx, "path": "rotation"},
        })

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "waifu-rt3d dart_to_glb (Stage 3 Phase 2)",
            "extras": {"vrmNormalizedSpace": True},
        },
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "animations": [{"name": anim_name, "channels": channels, "samplers": samplers}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    return gltf, binary


def convert_file(
    src: Path,
    dst: Path,
    *,
    yaw_deg: float = 0.0,
    face_camera: bool = False,
    anim_name: str | None = None,
) -> dict:
    """Convert one DART ``.npz`` to a normalized-VRM GLB on disk.

    Args:
        src: Input DART SMPL-X ``.npz``.
        dst: Output ``.glb`` path.
        yaw_deg: Explicit facing yaw (ignored if ``face_camera`` is set).
        face_camera: If True, auto-compute the yaw so the avatar faces the camera
            at frame 0 (see :func:`compute_facing_yaw`).
        anim_name: Animation name (defaults to the output stem).

    Returns:
        Stats dict: ``{frames, fps, bones, duration, yaw}``.
    """
    poses, fps = load_dart_npz(src)
    if face_camera:
        yaw_deg = compute_facing_yaw(poses[0, :3])
    tracks = convert_poses_to_tracks(poses, yaw_deg=yaw_deg)
    gltf, binary = build_glb(tracks, fps, anim_name or dst.stem)
    write_glb(dst, gltf, binary)
    return {
        "frames": poses.shape[0],
        "fps": fps,
        "bones": len(tracks),
        "duration": round(poses.shape[0] / fps, 3),
        "yaw": round(yaw_deg, 1),
    }


def main() -> None:
    """CLI entry. See module docstring."""
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("npz", help="input DART SMPL-X .npz (poses (T,165) + trans)")
    p.add_argument("-o", "--out", help="output .glb (default: <stem>.glb next to input)")
    p.add_argument("--name", help="animation name (default: output stem)")
    p.add_argument(
        "--yaw", type=float, default=0.0,
        help="explicit facing yaw about glTF +Y in degrees (default 0)",
    )
    p.add_argument(
        "--face-camera", action="store_true",
        help="auto-yaw so the avatar faces the camera at frame 0 (overrides --yaw)",
    )
    args = p.parse_args()

    src = Path(args.npz)
    dst = Path(args.out) if args.out else src.with_suffix(".glb")
    stats = convert_file(
        src, dst, yaw_deg=args.yaw, face_camera=args.face_camera, anim_name=args.name
    )
    print(f"[dart_to_glb] {src.name} -> {dst.name}")
    print(
        f"[dart_to_glb] OK frames={stats['frames']} fps={stats['fps']:.0f} "
        f"bones={stats['bones']} duration={stats['duration']}s yaw={stats['yaw']}"
        + (" (face-camera)" if args.face_camera else "")
    )


if __name__ == "__main__":
    main()
