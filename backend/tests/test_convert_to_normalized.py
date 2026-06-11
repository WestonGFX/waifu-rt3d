"""Tests for tools/convert_to_normalized.py — the Bug-2 raw→normalized GLB converter.

Locks in the measured three-vrm contract (ground_truth.mjs, 2026-06-11):

    normalized_local(b, t) = bind_world(parent(b)) ⊗ raw_local(b, t) ⊗ bind_world(b)⁻¹

Key invariant under test: a bone at its REST local must convert to IDENTITY
(bind pose == three-vrm normalized T-pose, ground-truth Probe D) — that identity
mapping is exactly what eliminates the distal-limb eversion of Bug 2.
See docs/research/2026-05-31-retarget-pipeline.md Findings 7-10.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.convert_to_normalized import (  # noqa: E402
    CHUNK_BIN,
    CHUNK_JSON,
    GLB_MAGIC,
    convert,
    q_inv,
    q_mul,
    q_normalize,
    read_glb,
    write_glb,
)


def axis_angle(axis: list[float], deg: float) -> np.ndarray:
    """Unit quaternion (x, y, z, w) for a rotation about ``axis`` by ``deg``."""
    a = np.array(axis, dtype=float)
    a /= np.linalg.norm(a)
    half = np.radians(deg) / 2
    return np.array([*(a * np.sin(half)), np.cos(half)])


def angle_between(a: np.ndarray, b: np.ndarray) -> float:
    """Angular distance in degrees between two unit quaternions."""
    return float(np.degrees(2 * np.arccos(np.clip(abs(np.dot(a, b)), 0, 1))))


# ── quaternion helpers ─────────────────────────────────────────────────────────

class TestQuaternionMath:
    def test_mul_identity(self):
        q = axis_angle([0, 0, 1], 45)
        ident = np.array([0.0, 0.0, 0.0, 1.0])
        assert np.allclose(q_mul(q, ident), q)
        assert np.allclose(q_mul(ident, q), q)

    def test_mul_matches_composition(self):
        # 90° about X then 90° about Y == known composite (three.js convention:
        # a.multiply(b) applies b first).
        qx = axis_angle([1, 0, 0], 90)
        qy = axis_angle([0, 1, 0], 90)
        composed = q_mul(qy, qx)
        # Rotating +Z by qx → -Y... then by qy: -Y stays -Y. Verify via vector rotate.
        v = np.array([0.0, 0.0, 1.0])
        def rot(q, v):
            x, y, z, w = q
            u = np.array([x, y, z])
            return 2 * np.dot(u, v) * u + (w * w - np.dot(u, u)) * v + 2 * w * np.cross(u, v)
        assert np.allclose(rot(composed, v), rot(qy, rot(qx, v)), atol=1e-12)

    def test_inv_roundtrip(self):
        q = axis_angle([1, 2, 3], 73)
        ident = q_mul(q, q_inv(q))
        assert angle_between(q_normalize(ident), np.array([0, 0, 0, 1.0])) < 1e-9

    def test_batch_shapes(self):
        qs = np.stack([axis_angle([0, 1, 0], d) for d in (0, 30, 60, 90)])
        out = q_mul(axis_angle([1, 0, 0], 90), qs)
        assert out.shape == (4, 4)


# ── synthetic GLB fixture ──────────────────────────────────────────────────────

def make_glb(tmp_path: Path, rests: dict[str, list[float]], anims: dict[str, np.ndarray]) -> Path:
    """Build a minimal 3-bone GLB: Root → J_Bip_C_Hips → J_Bip_L_UpperArm.

    Args:
        rests: node name → rest rotation (x, y, z, w).
        anims: node name → (frames, 4) raw local rotation samplers.

    Returns:
        Path to the written .glb.
    """
    names = ["Root", "J_Bip_C_Hips", "J_Bip_L_UpperArm"]
    nodes = []
    for i, n in enumerate(names):
        node = {"name": n}
        if n in rests:
            node["rotation"] = rests[n]
        if i + 1 < len(names):
            node["children"] = [i + 1]
        nodes.append(node)

    binary = bytearray()
    accessors, buffer_views, samplers, channels = [], [], [], []
    for name, vals in anims.items():
        idx = names.index(name)
        n_frames = vals.shape[0]
        times = np.arange(n_frames, dtype="<f4") / 30
        for arr, atype, ncomp in ((times, "SCALAR", 1), (vals.astype("<f4"), "VEC4", 4)):
            buffer_views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": arr.nbytes})
            accessors.append({
                "bufferView": len(buffer_views) - 1, "componentType": 5126,
                "count": n_frames, "type": atype,
            })
            binary.extend(arr.tobytes())
        samplers.append({"input": len(accessors) - 2, "output": len(accessors) - 1})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": idx, "path": "rotation"}})

    gltf = {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "animations": [{"name": "clip", "samplers": samplers, "channels": channels}],
    }
    out = tmp_path / "synthetic.glb"
    write_glb(out, gltf, bytes(binary))
    return out


class TestGlbContainer:
    def test_roundtrip(self, tmp_path):
        src = make_glb(tmp_path, {}, {"J_Bip_C_Hips": np.tile([0, 0, 0, 1.0], (3, 1))})
        gltf, binary = read_glb(src)
        assert gltf["asset"]["version"] == "2.0"
        out = tmp_path / "rt.glb"
        write_glb(out, gltf, binary)
        gltf2, binary2 = read_glb(out)
        assert gltf2 == gltf
        assert bytes(binary2) == bytes(binary)

    def test_header_magic(self, tmp_path):
        bad = tmp_path / "bad.glb"
        bad.write_bytes(b"NOPE" + b"\x00" * 20)
        with pytest.raises(ValueError, match="bad magic"):
            read_glb(bad)


# ── conversion semantics ───────────────────────────────────────────────────────

class TestConvert:
    def test_rest_pose_maps_to_identity(self, tmp_path):
        """A bone holding its rest local must convert to identity (T-pose ==
        normalized identity — THE Bug-2 eversion fix)."""
        hips_rest = axis_angle([1, 0, 0], 7.2).tolist()  # Raine-like hips offset
        arm_rest = axis_angle([0, 0, 1], -5).tolist()
        src = make_glb(
            tmp_path,
            {"J_Bip_C_Hips": hips_rest, "J_Bip_L_UpperArm": arm_rest},
            {
                "J_Bip_C_Hips": np.tile(hips_rest, (4, 1)),
                "J_Bip_L_UpperArm": np.tile(arm_rest, (4, 1)),
            },
        )
        gltf, binary = read_glb(src)
        convert(gltf, binary, verbose=False)
        out = tmp_path / "out.glb"
        write_glb(out, gltf, binary)
        gltf2, binary2 = read_glb(out)
        for ch in gltf2["animations"][0]["channels"]:
            acc = gltf2["animations"][0]["samplers"][ch["sampler"]]["output"]
            bv = gltf2["bufferViews"][gltf2["accessors"][acc]["bufferView"]]
            vals = np.frombuffer(
                bytes(binary2), dtype="<f4",
                count=gltf2["accessors"][acc]["count"] * 4,
                offset=bv.get("byteOffset", 0),
            ).reshape(-1, 4)
            for v in vals:
                assert angle_between(v.astype(float), np.array([0, 0, 0, 1.0])) < 1e-3

    def test_world_delta_preserved(self, tmp_path):
        """The converted clip must reproduce the same world rotation delta the
        raw clip encoded — verified by recomposing both chains."""
        hips_rest = axis_angle([1, 0, 0], 7.2)
        arm_rest = axis_angle([0, 1, 0], 12)
        # Animate the arm 82.7° about local X on top of rest; hips hold rest.
        arm_anim = np.stack([
            q_mul(arm_rest, axis_angle([1, 0, 0], d)) for d in (0, 30, 82.7)
        ])
        src = make_glb(
            tmp_path,
            {"J_Bip_C_Hips": hips_rest.tolist(), "J_Bip_L_UpperArm": arm_rest.tolist()},
            {"J_Bip_C_Hips": np.tile(hips_rest, (3, 1)), "J_Bip_L_UpperArm": arm_anim},
        )
        gltf, binary = read_glb(src)
        convert(gltf, binary, verbose=False)

        # Raw world delta of the arm at frame 2 (hips at rest):
        # world = hips_rest ⊗ arm_anim[2]; bind = hips_rest ⊗ arm_rest.
        world_raw = q_mul(hips_rest, arm_anim[2])
        bind = q_mul(hips_rest, arm_rest)
        delta_raw = q_mul(world_raw, q_inv(bind))

        # Normalized chain product (measured three-vrm contract: world delta ==
        # product of normalized locals root→bone).
        def channel_vals(name):
            anim = gltf["animations"][0]
            for ch in anim["channels"]:
                if gltf["nodes"][ch["target"]["node"]]["name"] == name:
                    acc = anim["samplers"][ch["sampler"]]["output"]
                    bv = gltf["bufferViews"][gltf["accessors"][acc]["bufferView"]]
                    return np.frombuffer(
                        bytes(binary), dtype="<f4",
                        count=gltf["accessors"][acc]["count"] * 4,
                        offset=bv.get("byteOffset", 0),
                    ).reshape(-1, 4).astype(float)
            raise AssertionError(f"no channel for {name}")

        norm_product = q_mul(channel_vals("J_Bip_C_Hips")[2], channel_vals("J_Bip_L_UpperArm")[2])
        assert angle_between(q_normalize(norm_product), q_normalize(delta_raw)) < 0.01

    def test_non_humanoid_channels_dropped(self, tmp_path):
        """Spring-bone / unmapped channels must be stripped, not converted."""
        src = make_glb(
            tmp_path, {},
            {"J_Bip_C_Hips": np.tile([0, 0, 0, 1.0], (2, 1)), "Root": np.tile([0, 0, 0, 1.0], (2, 1))},
        )
        gltf, binary = read_glb(src)
        stats = convert(gltf, binary, verbose=False)
        assert stats["nodes"] == 1
        kept = {gltf["nodes"][c["target"]["node"]]["name"] for c in gltf["animations"][0]["channels"]}
        assert kept == {"J_Bip_C_Hips"}

    def test_double_conversion_refused(self, tmp_path):
        """Converting an already-normalized clip must raise, not corrupt."""
        src = make_glb(tmp_path, {}, {"J_Bip_C_Hips": np.tile([0, 0, 0, 1.0], (2, 1))})
        gltf, binary = read_glb(src)
        convert(gltf, binary, verbose=False)
        with pytest.raises(ValueError, match="already normalized"):
            convert(gltf, binary, verbose=False)
