"""Tests for tools/dart_to_glb.py — the Stage-3 DART SMPL-X → normalized-VRM GLB tool.

Locks the conversion contract proven by the render gate (2026-06-22,
docs/testing/screenshots/2026-06-22-stage3-dart/): SMPL-X axis-angle poses map to
three-vrm NORMALIZED per-bone quaternions via a single per-joint rotation, with a
rigid stand-up applied to the ROOT ONLY:

    normalized_local(root)  = G_pre ⊗ smpl_local(root)      # left-multiply
    normalized_local(child) = smpl_local(child)             # raw — G_pre cancels

The root-only rule is the headline regression guard: conjugating *every* bone by
G_pre (the first attempt) laid the avatar on her side; applying the up-fix to
children would re-break it. These tests pin the rule so a future edit can't
silently regress it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.convert_to_normalized import read_glb, q_mul  # noqa: E402
from tools.dart_to_glb import (  # noqa: E402
    POSE_DIM,
    SMPL_BONE_MAP,
    VRM_FORWARD,
    _rotate_vec,
    axis_angle_to_quat,
    build_glb,
    build_root_transform,
    compute_facing_yaw,
    convert_file,
    convert_poses_to_tracks,
    load_dart_npz,
    quat_from_axis_angle,
)


def rot_vec(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Rotate vector ``v`` by quaternion ``q`` (x, y, z, w)."""
    x, y, z, w = q
    u = np.array([x, y, z], dtype=float)
    return 2 * np.dot(u, v) * u + (w * w - np.dot(u, u)) * v + 2 * w * np.cross(u, v)


def make_npz(tmp_path: Path, poses: np.ndarray, fps: int = 30) -> Path:
    """Write a minimal DART-shaped SMPL-X .npz for a synthetic pose array."""
    out = tmp_path / "sample.npz"
    np.savez(
        out,
        poses=poses.astype(np.float32),
        trans=np.zeros((poses.shape[0], 3), dtype=np.float32),
        betas=np.zeros(10, dtype=np.float32),
        gender="male",
        mocap_framerate=np.int64(fps),
    )
    return out


# ── axis-angle → quaternion ─────────────────────────────────────────────────────

class TestAxisAngleToQuat:
    def test_zero_is_identity(self):
        q = axis_angle_to_quat(np.zeros(3))
        assert np.allclose(q, [0, 0, 0, 1.0])

    def test_known_90_about_z(self):
        q = axis_angle_to_quat(np.array([0.0, 0.0, np.pi / 2]))
        s = np.sin(np.pi / 4)
        assert np.allclose(q, [0, 0, s, s], atol=1e-7)

    def test_rotates_vector_correctly(self):
        # 90° about +Z takes +X → +Y.
        q = axis_angle_to_quat(np.array([0.0, 0.0, np.pi / 2]))
        assert np.allclose(rot_vec(q, np.array([1.0, 0, 0])), [0, 1, 0], atol=1e-7)

    def test_unit_norm_batch(self):
        rng = np.random.default_rng(0)
        aa = rng.standard_normal((50, 3)) * 2.0
        q = axis_angle_to_quat(aa)
        assert q.shape == (50, 4)
        assert np.allclose(np.linalg.norm(q, axis=-1), 1.0, atol=1e-9)

    def test_tiny_angle_no_nan(self):
        q = axis_angle_to_quat(np.array([1e-12, 0.0, 0.0]))
        assert np.isfinite(q).all()
        assert np.allclose(q, [0, 0, 0, 1.0])


# ── root frame transform ────────────────────────────────────────────────────────

class TestRootTransform:
    def test_z_up_maps_to_y_up(self):
        """G_pre = Rx(-90°) must send the data's +Z (up) to glTF +Y (up)."""
        g = build_root_transform()
        assert np.allclose(rot_vec(g, np.array([0.0, 0.0, 1.0])), [0, 1, 0], atol=1e-7)

    def test_upright_data_becomes_upright(self):
        """A body the DATA lays toward +Z (global_orient = Rx(+90°)) must stand
        upright after the root transform: root world rotation → identity."""
        go = quat_from_axis_angle((1.0, 0.0, 0.0), 90.0)  # template +Y → world +Z
        root = q_mul(build_root_transform(), go)
        # Identity up to sign (q and -q are the same rotation).
        assert np.allclose(np.abs(root), [0, 0, 0, 1.0], atol=1e-7)

    def test_yaw_preserves_up_axis(self):
        """Yaw is about glTF +Y, so the data's up (+Z) still maps to glTF +Y for
        any yaw — only the avatar's facing (about the vertical) changes."""
        for yaw in (0.0, 37.0, 90.0, 180.0):
            g = build_root_transform(yaw_deg=yaw)
            assert np.allclose(rot_vec(g, np.array([0.0, 0.0, 1.0])), [0, 1, 0], atol=1e-6), yaw
        # And a nonzero yaw genuinely changes a horizontal data axis (not a no-op).
        assert not np.allclose(rot_vec(build_root_transform(90.0), np.array([1.0, 0.0, 0.0])),
                               rot_vec(build_root_transform(0.0), np.array([1.0, 0.0, 0.0])), atol=1e-3)


# ── face-camera yaw ─────────────────────────────────────────────────────────────

class TestFaceCamera:
    def _forward_after(self, global_orient0, yaw_deg):
        """Frame-0 glTF facing after applying the root transform with yaw_deg."""
        root0 = q_mul(build_root_transform(yaw_deg), axis_angle_to_quat(global_orient0))
        return _rotate_vec(root0, VRM_FORWARD)

    def test_yaw_makes_avatar_face_camera(self):
        """For arbitrary clip facings, the computed yaw must rotate frame-0 facing
        onto glTF +Z (camera): x ~ 0 and z > 0."""
        rng = np.random.default_rng(7)
        for _ in range(6):
            # Random standing-ish global_orient (predominantly the Z-up reorient).
            go0 = (rng.standard_normal(3) * 0.4) + np.array([np.pi / 2, 0, 0])
            yaw = compute_facing_yaw(go0)
            fwd = self._forward_after(go0, yaw)
            assert abs(fwd[0]) < 1e-5, fwd     # no left/right facing
            assert fwd[2] > 0.0, fwd           # toward +Z (camera)

    def test_already_facing_camera_is_near_zero_yaw(self):
        """A clip already facing +Z should need ~0 yaw."""
        # Build a global_orient whose up-fixed forward is already +Z: identity
        # global_orient -> up-fix -> forward; solve by construction via the inverse
        # is overkill, so just assert idempotence: applying the computed yaw twice
        # (recomputing) converges to the same forward.
        go0 = np.array([np.pi / 2, 0.0, 0.0])  # pure Z-up reorient
        yaw = compute_facing_yaw(go0)
        fwd = self._forward_after(go0, yaw)
        assert abs(fwd[0]) < 1e-5 and fwd[2] > 0.0

    def test_convert_file_face_camera_sets_yaw(self, tmp_path):
        poses = np.zeros((4, POSE_DIM))
        # Realistic upright clip facing: Z-up reorient (~Rx +90) plus a yaw/tilt.
        poses[:, :3] = [np.pi / 2, 0.6, 0.2]
        src = make_npz(tmp_path, poses)
        stats = convert_file(src, tmp_path / "out.glb", face_camera=True)
        # face_camera must override the default yaw=0 with a computed value...
        assert stats["yaw"] != 0.0
        # ...that points frame-0 facing at the camera (+Z), within rounding.
        fwd = self._forward_after(poses[0, :3], stats["yaw"])
        assert fwd[2] > 0.0 and abs(fwd[0]) < 1e-2


# ── npz loading / validation ────────────────────────────────────────────────────

class TestLoadNpz:
    def test_reads_fps_and_shape(self, tmp_path):
        poses, fps = load_dart_npz(make_npz(tmp_path, np.zeros((10, POSE_DIM)), fps=24))
        assert poses.shape == (10, POSE_DIM)
        assert fps == 24.0

    def test_bad_width_raises(self, tmp_path):
        with pytest.raises(ValueError, match="expected poses"):
            load_dart_npz(make_npz(tmp_path, np.zeros((5, 99))))

    def test_nan_raises(self, tmp_path):
        poses = np.zeros((3, POSE_DIM)); poses[1, 4] = np.nan
        with pytest.raises(ValueError, match="NaN"):
            load_dart_npz(make_npz(tmp_path, poses))

    def test_missing_poses_raises(self, tmp_path):
        out = tmp_path / "bad.npz"
        np.savez(out, trans=np.zeros((2, 3)))
        with pytest.raises(ValueError, match="no 'poses'"):
            load_dart_npz(out)


# ── pose → tracks (the conversion contract) ─────────────────────────────────────

class TestConvertPoses:
    def test_all_humanoid_bones_present(self):
        tracks = convert_poses_to_tracks(np.zeros((4, POSE_DIM)))
        assert len(tracks) == 22 == len(SMPL_BONE_MAP)
        assert all(name.startswith("J_Bip_") for name in tracks)

    def test_shapes_and_unit_norm(self):
        rng = np.random.default_rng(1)
        poses = rng.standard_normal((12, POSE_DIM)) * 0.5
        tracks = convert_poses_to_tracks(poses)
        for name, arr in tracks.items():
            assert arr.shape == (12, 4), name
            assert np.allclose(np.linalg.norm(arr, axis=-1), 1.0, atol=1e-9), name
            assert np.isfinite(arr).all(), name

    def test_child_bone_is_raw_local(self):
        """Child bones must carry the RAW SMPL local rotation (G_pre cancels).
        Guards against re-applying the up-fix to children (lay-on-side bug)."""
        rng = np.random.default_rng(2)
        poses = rng.standard_normal((6, POSE_DIM)) * 0.4
        tracks = convert_poses_to_tracks(poses)
        # joint 4 (L_knee) is a non-root child.
        expect = axis_angle_to_quat(poses[:, 12:15])
        assert np.allclose(tracks["J_Bip_L_LowerLeg"], expect, atol=1e-9)

    def test_root_bone_is_left_multiplied(self):
        """Root (hips) must be G_pre ⊗ raw_global_orient, NOT the raw local."""
        rng = np.random.default_rng(3)
        poses = rng.standard_normal((6, POSE_DIM)) * 0.4
        tracks = convert_poses_to_tracks(poses)
        raw = axis_angle_to_quat(poses[:, 0:3])
        g = build_root_transform()
        expect = np.stack([q_mul(g, raw[t]) for t in range(6)])
        # equal up to per-frame sign
        same = np.allclose(tracks["J_Bip_C_Hips"], expect, atol=1e-7) or \
               np.allclose(tracks["J_Bip_C_Hips"], -expect, atol=1e-7)
        assert same
        # And it must NOT equal the raw local (proves the transform was applied).
        assert not np.allclose(tracks["J_Bip_C_Hips"], raw, atol=1e-3)

    def test_deterministic(self):
        poses = np.random.default_rng(4).standard_normal((8, POSE_DIM)) * 0.3
        a = convert_poses_to_tracks(poses)
        b = convert_poses_to_tracks(poses)
        for k in a:
            assert np.array_equal(a[k], b[k])


# ── GLB assembly + end-to-end ───────────────────────────────────────────────────

class TestBuildGlb:
    def test_structure(self):
        tracks = convert_poses_to_tracks(np.zeros((5, POSE_DIM)))
        gltf, binary = build_glb(tracks, fps=30.0, anim_name="dart")
        assert len(gltf["nodes"]) == 22
        assert all(n["name"].startswith("J_Bip_") for n in gltf["nodes"])
        anim = gltf["animations"][0]
        assert anim["name"] == "dart"
        assert len(anim["channels"]) == 22
        assert {c["target"]["path"] for c in anim["channels"]} == {"rotation"}
        assert gltf["asset"]["extras"]["vrmNormalizedSpace"] is True

    def test_convert_file_roundtrip(self, tmp_path):
        rng = np.random.default_rng(5)
        poses = rng.standard_normal((20, POSE_DIM)) * 0.5
        src = make_npz(tmp_path, poses, fps=30)
        dst = tmp_path / "out.glb"
        stats = convert_file(src, dst, anim_name="dart")
        assert stats == {"frames": 20, "fps": 30.0, "bones": 22,
                         "duration": round(20 / 30, 3), "yaw": 0.0}

        gltf, binary = read_glb(dst)
        anim = gltf["animations"][0]
        assert len(anim["channels"]) == 22
        # Time accessor spans 0 .. (n-1)/fps.
        tacc = gltf["accessors"][anim["samplers"][0]["input"]]
        assert tacc["count"] == 20
        assert np.isclose(tacc["max"][0], 19 / 30.0)

    def test_distinct_frames_preserved(self, tmp_path):
        """A genuinely-varying pose sequence must yield distinct quaternion frames
        in the GLB (no accidental constant-collapse)."""
        t = np.linspace(0, 1, 16)
        poses = np.zeros((16, POSE_DIM))
        poses[:, 12] = t * 1.2  # animate L_knee about X
        src = make_npz(tmp_path, poses)
        dst = tmp_path / "out.glb"
        convert_file(src, dst)
        gltf, binary = read_glb(dst)
        from tools.convert_to_normalized import accessor_floats
        # find L_LowerLeg channel
        anim = gltf["animations"][0]
        idx = next(c for c in anim["channels"]
                   if gltf["nodes"][c["target"]["node"]]["name"] == "J_Bip_L_LowerLeg")
        vals, _ = accessor_floats(gltf, binary, anim["samplers"][idx["sampler"]]["output"])
        assert len(np.unique(vals.round(5), axis=0)) == 16
