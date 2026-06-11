"""Convert a VRM-rig-baked GLB clip from RAW bone space to three-vrm NORMALIZED space.

Why: clips baked by ``tools/blender/retarget_to_vrm.py`` carry each bone's local
rotation in the VRM's RAW rest frame (``J_Bip_*`` glTF nodes). The viewer's clip
mixer drives three-vrm *normalized* bone nodes, which expect rotations in a frame
where the bind pose is identity. Applying raw-space values there everts distal
limbs (dark-red backfaces) — Bug 2 in docs/research/2026-05-31-retarget-pipeline.md
Findings 7–9.

The conversion is the one MEASURED by tools/verify/ground_truth.mjs (2026-06-11,
report at docs/research/data/2026-06-11-three-vrm-ground-truth.json):

    raw_world(bone)        = Π(normalized locals, root→bone) ⊗ bind_world(bone)
    ⇒ normalized_local(b)  = Δ_world(parent_animated)⁻¹ ⊗ Δ_world(b)
       where Δ_world(b)    = world(t, b) ⊗ bind_world(b)⁻¹

Expanding world(t) down the ancestor chain, every time-dependent parent term
cancels, leaving a constant per-bone sandwich of the raw local sampler alone:

    normalized_local(b, t) = bind_world(parent(b)) ⊗ raw_local(b, t) ⊗ bind_world(b)⁻¹

(Sanity: raw_local == rest(b) telescopes to identity — the bind pose maps to
T-pose, exactly what ground-truth Probe D measured.) This means each rotation
channel converts independently — no cross-channel frame alignment — so the
exporter's constant-channel dedup (2-key samplers) is harmless.

All quantities live in the GLB's own glTF (Y-up) frame, so no Blender axis math
is involved. Rotation samplers are rewritten value-for-value (same byte count);
translation / scale channels are left untouched (the viewer's retarget path
drops them anyway).

Usage:
    .venv/bin/python tools/convert_to_normalized.py in.glb [-o out.glb]
    .venv/bin/python tools/convert_to_normalized.py --in-dir backend/storage/animations/vrm-baked --suffix .normalized.glb

Output defaults to ``<input stem>.normalized.glb`` next to the input.
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np

GLB_MAGIC = 0x46546C67  # 'glTF'
CHUNK_JSON = 0x4E4F534A  # 'JSON'
CHUNK_BIN = 0x004E4942  # 'BIN\0'

# The humanoid subset the bake actually keyframes (mirrors MIXAMO_TO_VRM values in
# tools/blender/retarget_to_vrm.py and VRM_BONE_MAP in viewer.html). The glTF
# exporter additionally dumps channels for every other node (spring bones,
# fingers); those are NOT pose data — they are dropped, not converted. Spring
# bones must stay free for Verlet physics, and fingers keep their natural rest.
HUMANOID_BONES = {
    "J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest",
    "J_Bip_C_Neck", "J_Bip_C_Head",
    "J_Bip_L_Shoulder", "J_Bip_L_UpperArm", "J_Bip_L_LowerArm", "J_Bip_L_Hand",
    "J_Bip_R_Shoulder", "J_Bip_R_UpperArm", "J_Bip_R_LowerArm", "J_Bip_R_Hand",
    "J_Bip_L_UpperLeg", "J_Bip_L_LowerLeg", "J_Bip_L_Foot", "J_Bip_L_ToeBase",
    "J_Bip_R_UpperLeg", "J_Bip_R_LowerLeg", "J_Bip_R_Foot", "J_Bip_R_ToeBase",
}


# ── quaternion helpers (glTF order x,y,z,w; arrays shaped (..., 4)) ────────────

def q_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Hamilton product a⊗b (apply b, then a) — matches three.js Quaternion.multiply.

    Args:
        a: Left quaternion(s), shape (..., 4) as (x, y, z, w).
        b: Right quaternion(s), broadcastable to a's shape.

    Returns:
        a⊗b with the same shape, (x, y, z, w).
    """
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack(
        [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ],
        axis=-1,
    )


def q_inv(q: np.ndarray) -> np.ndarray:
    """Inverse of unit quaternion(s): the conjugate."""
    out = q.copy()
    out[..., :3] *= -1
    return out


def q_normalize(q: np.ndarray) -> np.ndarray:
    """Renormalize quaternion(s) to unit length (guards float32 drift)."""
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def q_angle_deg(a: np.ndarray, b: np.ndarray) -> float:
    """Largest angular distance (degrees) between paired quaternion arrays."""
    d = np.clip(np.abs(np.sum(a * b, axis=-1)), 0.0, 1.0)
    return float(np.degrees(2 * np.arccos(d)).max())


# ── GLB container ──────────────────────────────────────────────────────────────

def read_glb(path: Path) -> tuple[dict, bytearray]:
    """Parse a GLB into (gltf JSON dict, mutable BIN chunk).

    Raises:
        ValueError: If the file is not a GLB or lacks a BIN chunk.
    """
    data = path.read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError(f"{path}: not a GLB (bad magic)")
    offset, gltf, binary = 12, None, None
    while offset < len(data):
        clen, ctype = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + clen]
        if ctype == CHUNK_JSON:
            gltf = json.loads(chunk)
        elif ctype == CHUNK_BIN:
            binary = bytearray(chunk)
        offset += 8 + clen
    if gltf is None or binary is None:
        raise ValueError(f"{path}: missing JSON or BIN chunk")
    return gltf, binary


def write_glb(path: Path, gltf: dict, binary: bytes) -> None:
    """Serialize (gltf, binary) back to a GLB with correct chunk padding."""
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)  # JSON chunk pads with spaces
    bn = bytes(binary) + b"\x00" * (-len(binary) % 4)  # BIN pads with zeros
    total = 12 + 8 + len(js) + 8 + len(bn)
    with path.open("wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, total))
        f.write(struct.pack("<II", len(js), CHUNK_JSON))
        f.write(js)
        f.write(struct.pack("<II", len(bn), CHUNK_BIN))
        f.write(bn)


def accessor_floats(gltf: dict, binary: bytearray, idx: int) -> tuple[np.ndarray, int]:
    """Return (float32 view-copy, byte offset into BIN) for a tightly-packed accessor.

    Raises:
        ValueError: If the accessor is not float32 or uses a byte stride.
    """
    acc = gltf["accessors"][idx]
    if acc["componentType"] != 5126:
        raise ValueError(f"accessor {idx}: expected float32")
    bv = gltf["bufferViews"][acc["bufferView"]]
    if bv.get("byteStride") not in (None, 0):
        raise ValueError(f"accessor {idx}: strided buffer views unsupported")
    ncomp = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"] * ncomp
    arr = np.frombuffer(binary, dtype="<f4", count=count, offset=start).reshape(acc["count"], ncomp)
    return arr.astype(np.float64), start


# ── conversion ────────────────────────────────────────────────────────────────

def convert(gltf: dict, binary: bytearray, verbose: bool = True) -> dict:
    """Rewrite the first animation's rotation samplers raw→normalized, in place.

    Returns:
        Stats dict: {nodes, frames, maxRestOffset_deg}.

    Raises:
        ValueError: On structural surprises (no animation, mismatched frame
            counts, already-converted input) — better loud than a third bad bake.
    """
    if gltf["asset"].get("extras", {}).get("vrmNormalizedSpace"):
        raise ValueError("input is already normalized-space (asset.extras flag set)")
    anims = gltf.get("animations") or []
    if len(anims) != 1:
        raise ValueError(f"expected exactly 1 animation, found {len(anims)}")
    anim = anims[0]
    nodes = gltf["nodes"]

    # Parent map from the children arrays (glTF stores only downward links).
    parent: dict[int, int] = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    rest = {i: np.array(n.get("rotation", [0.0, 0.0, 0.0, 1.0])) for i, n in enumerate(nodes)}

    # Keep ONLY humanoid rotation channels; rebuild channels+samplers without the
    # exporter's spring-bone / finger / translation dumps (rotation-only contract).
    kept_channels, kept_samplers = [], []
    rot: dict[int, tuple[np.ndarray, int]] = {}
    for ch in anim["channels"]:
        node_idx = ch["target"].get("node")
        if (
            ch["target"].get("path") != "rotation"
            or node_idx is None
            or nodes[node_idx].get("name") not in HUMANOID_BONES
        ):
            continue
        sampler = anim["samplers"][ch["sampler"]]
        kept_samplers.append(sampler)
        kept_channels.append({**ch, "sampler": len(kept_samplers) - 1})
        rot[node_idx] = accessor_floats(gltf, binary, sampler["output"])
    if not rot:
        raise ValueError("animation has no humanoid rotation channels")
    anim["channels"], anim["samplers"] = kept_channels, kept_samplers

    # Bind world rotation per node (rest chain product) — frame-independent.
    bind_world: dict[int, np.ndarray] = {}

    def bind(idx: int) -> np.ndarray:
        if idx not in bind_world:
            chain = [idx]
            while chain[-1] in parent:
                chain.append(parent[chain[-1]])
            q = np.array([0.0, 0.0, 0.0, 1.0])
            for a in reversed(chain):
                q = q_mul(q, rest[a])
            bind_world[idx] = q
        return bind_world[idx]

    max_frames = 0
    identity = np.array([0.0, 0.0, 0.0, 1.0])
    for idx, (vals, offset) in rot.items():
        # The constant sandwich (see module docstring). For a root channel
        # (no parent) the prefix is identity.
        prefix = bind(parent[idx]) if idx in parent else identity
        suffix = q_inv(bind(idx))
        normalized = q_normalize(q_mul(q_mul(prefix, vals), suffix))
        max_frames = max(max_frames, vals.shape[0])
        # Overwrite the sampler bytes in place (same count, same dtype).
        binary[offset : offset + normalized.size * 4] = normalized.astype("<f4").tobytes()
        if verbose:
            name = nodes[idx].get("name", f"node{idx}")
            print(f"  {name}: {vals.shape[0]} frames converted")

    gltf["asset"].setdefault("extras", {})["vrmNormalizedSpace"] = True
    return {"nodes": len(rot), "frames": max_frames}


def main() -> None:
    """CLI entry. See module docstring."""
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("glb", nargs="?", help="input .glb (raw VRM-rig bake)")
    p.add_argument("-o", "--out", help="output path (default: <stem>.normalized.glb)")
    p.add_argument("--in-dir", help="convert every *.glb in a directory (skips *.normalized.glb)")
    p.add_argument("--suffix", default=".normalized.glb", help="output suffix in --in-dir mode")
    args = p.parse_args()

    targets: list[tuple[Path, Path]] = []
    if args.in_dir:
        for f in sorted(Path(args.in_dir).glob("*.glb")):
            if f.name.endswith(".normalized.glb"):
                continue
            targets.append((f, f.with_name(f.stem + args.suffix)))
    elif args.glb:
        src = Path(args.glb)
        targets.append((src, Path(args.out) if args.out else src.with_name(src.stem + ".normalized.glb")))
    else:
        p.error("provide a .glb or --in-dir")

    for src, dst in targets:
        gltf, binary = read_glb(src)
        print(f"[normalize] {src.name} -> {dst.name}")
        stats = convert(gltf, binary, verbose=False)
        write_glb(dst, gltf, binary)
        print(f"[normalize] OK nodes={stats['nodes']} frames={stats['frames']}")


if __name__ == "__main__":
    main()
