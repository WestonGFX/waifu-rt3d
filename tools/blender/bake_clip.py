"""Blender headless bake worker — Mixamo FBX/GLB → clean GLB animation clip.

Why this exists: Mixamo (the largest free source of humanoid mocap) exports
**FBX**, which browsers / three.js GLTFLoader cannot load. This script runs inside
headless Blender to convert FBX→GLB while preserving the ``mixamorig:*`` bone names,
so the GLB drops straight into the viewer's runtime retarget path
(``ClipLayer.loadClip(url, name, {retarget:true})``) which remaps Mixamo→VRM bones.
It optionally strips horizontal root motion so locomotion clips loop in place
(no foot-slide / drift) — the in-place idle/walk case the avatar needs.

This is the offline-bake half of Stage 1 (docs/plans/2026-05-31-avatar-motion-staged.md):
runtime retarget proved the path; Blender unlocks the whole Mixamo library and bakes
cleaner clips once.

Run (never import directly — needs Blender's bpy):
    blender --background --python tools/blender/bake_clip.py -- \
        --in  /path/to/mixamo_walking.fbx \
        --out backend/storage/animations/baked/walk.glb \
        --in-place            # zero hips X/Z translation (loop in place)

Exit code 0 on success; non-zero on failure (stderr carries the reason).
"""
from __future__ import annotations

import argparse
import os
import sys

import bpy  # type: ignore  # provided by the Blender runtime, not the venv


def _parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse args after Blender's own ``--`` separator.

    Args:
        argv: The full ``sys.argv``; everything after ``--`` is ours.

    Returns:
        Parsed namespace with ``input``, ``output``, ``in_place``.
    """
    after = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser(prog="bake_clip.py")
    p.add_argument("--in", dest="input", required=True, help="source .fbx/.glb/.gltf")
    p.add_argument("--out", dest="output", required=True, help="destination .glb")
    p.add_argument(
        "--in-place",
        dest="in_place",
        action="store_true",
        help="zero hips horizontal (X/Z) translation so the clip loops in place",
    )
    p.add_argument(
        "--name",
        dest="name",
        default=None,
        help="rename the single/primary action to this clean clip name (e.g. 'walk')",
    )
    return p.parse_args(after)


def _reset_scene() -> None:
    """Wipe Blender to an empty factory state so each bake is isolated."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _import(path: str) -> None:
    """Import a source animation file by extension.

    Args:
        path: Path to a .fbx, .glb, or .gltf file.

    Raises:
        SystemExit: If the extension is unsupported or the file is missing.
    """
    if not os.path.isfile(path):
        sys.exit(f"[bake_clip] input not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        # automatic_bone_orientation keeps the Mixamo rig sane on round-trip.
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        sys.exit(f"[bake_clip] unsupported input extension: {ext}")


def _find_armature() -> "bpy.types.Object":
    """Return the first armature object in the scene.

    Returns:
        The armature object.

    Raises:
        SystemExit: If no armature was imported.
    """
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    sys.exit("[bake_clip] no armature found in import")


def _strip_root_motion(armature: "bpy.types.Object") -> int:
    """Zero horizontal translation on the hips bone so the clip loops in place.

    Keeps vertical (Y/Z-up) bob; removes the X and forward channels that cause the
    character to drift across the floor. Operates on the active action's fcurves.

    Args:
        armature: The armature whose action to edit.

    Returns:
        Number of keyframe points zeroed.
    """
    ad = armature.animation_data
    if not ad or not ad.action:
        return 0
    # Mixamo root is the hips bone; its location fcurves carry the locomotion.
    hip_aliases = ("mixamorig:hips", "mixamorighips", "hips")
    zeroed = 0
    for fc in ad.action.fcurves:
        path = fc.data_path.lower()  # e.g. pose.bones["mixamorig:Hips"].location
        if not path.endswith(".location"):
            continue
        if not any(a in path for a in hip_aliases):
            continue
        # Blender bone-space: index 0 = X, 1 = Y (up in pose space), 2 = Z (depth).
        # Zero X (0) and Z (2); keep Y (1) for the vertical bob.
        if fc.array_index in (0, 2):
            for kp in fc.keyframe_points:
                kp.co[1] = 0.0
                kp.handle_left[1] = 0.0
                kp.handle_right[1] = 0.0
                zeroed += 1
    return zeroed


def _clean_action_names(rename_to: str | None) -> list[str]:
    """Normalize action names so the GLB ships clean clip names.

    FBX import mangles actions into names like ``Armature|Armature|walk_Armature``;
    glTF then exposes those verbatim, breaking the viewer's name-based clip selection.
    Strip the ``Armature|...|`` wrappers and ``_Armature`` suffix. If ``rename_to`` is
    given and there is exactly one action, use it directly (the common single-clip
    Mixamo-FBX case).

    Args:
        rename_to: Explicit clean name for the sole action, or None.

    Returns:
        The resulting action names, in order.
    """
    actions = list(bpy.data.actions)
    if rename_to and len(actions) == 1:
        actions[0].name = rename_to
        return [rename_to]

    names = []
    for act in actions:
        n = act.name
        if "|" in n:  # Armature|Armature|walk_Armature → walk_Armature
            n = n.split("|")[-1]
        n = n.replace("_Armature", "").replace("Armature", "").strip("_ ")
        if n:
            act.name = n
        names.append(act.name)
    return names


def _export_glb(path: str) -> None:
    """Export the scene to GLB with animation, preserving bone names.

    Args:
        path: Destination .glb path (parent dirs created if missing).
    """
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
    )


def main() -> None:
    """Bake one source clip to a clean GLB. See module docstring for usage."""
    args = _parse_args(sys.argv)
    _reset_scene()
    _import(args.input)
    arm = _find_armature()

    zeroed = _strip_root_motion(arm) if args.in_place else 0
    names = _clean_action_names(args.name)

    _export_glb(args.output)
    print(
        f"[bake_clip] OK in={os.path.basename(args.input)} "
        f"out={os.path.basename(args.output)} clips={names} "
        f"root_motion_keys_zeroed={zeroed}"
    )


if __name__ == "__main__":
    main()
