"""Blender headless retarget — Mixamo FBX animation → onto a VRM's own rig → GLB.

Why: copying raw Mixamo bone quaternions onto a VRM fails because the two rigs have
different rest-pose bone orientations / up-axis / units (Mixamo Z-up cm vs VRM Y-up m),
so a runtime bone-name remap folds or ejects the avatar. The robust fix is to retarget
*onto the VRM's actual armature* inside Blender using Copy-Rotation constraints + a visual
bake, then export. The result is expressed in VRM (VRoid ``J_Bip_*``) bone space, so it
plays DIRECTLY on any VRoid-named VRM at runtime — no retarget, no frame math.

Run (never import directly — needs Blender's bpy):
    blender --background --python tools/blender/retarget_to_vrm.py -- \
        --vrm  backend/storage/avatars/Raine.vrm \
        --fbx  ~/Downloads/mixamo-fbx/walking.fbx \
        --out  backend/storage/animations/vrm-baked/walking.glb \
        --name walking

See docs/research/2026-05-31-retarget-pipeline.md.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile

import bpy  # type: ignore  # Blender runtime

# Mixamo bone name -> VRoid/VRM humanoid bone name. Covers the humanoid subset that
# carries pose; fingers/twist bones are intentionally omitted (VRMs vary).
MIXAMO_TO_VRM = {
    "mixamorig:Hips": "J_Bip_C_Hips",
    "mixamorig:Spine": "J_Bip_C_Spine",
    "mixamorig:Spine1": "J_Bip_C_Chest",
    "mixamorig:Spine2": "J_Bip_C_UpperChest",
    "mixamorig:Neck": "J_Bip_C_Neck",
    "mixamorig:Head": "J_Bip_C_Head",
    "mixamorig:LeftShoulder": "J_Bip_L_Shoulder",
    "mixamorig:LeftArm": "J_Bip_L_UpperArm",
    "mixamorig:LeftForeArm": "J_Bip_L_LowerArm",
    "mixamorig:LeftHand": "J_Bip_L_Hand",
    "mixamorig:RightShoulder": "J_Bip_R_Shoulder",
    "mixamorig:RightArm": "J_Bip_R_UpperArm",
    "mixamorig:RightForeArm": "J_Bip_R_LowerArm",
    "mixamorig:RightHand": "J_Bip_R_Hand",
    "mixamorig:LeftUpLeg": "J_Bip_L_UpperLeg",
    "mixamorig:LeftLeg": "J_Bip_L_LowerLeg",
    "mixamorig:LeftFoot": "J_Bip_L_Foot",
    "mixamorig:LeftToeBase": "J_Bip_L_ToeBase",
    "mixamorig:RightUpLeg": "J_Bip_R_UpperLeg",
    "mixamorig:RightLeg": "J_Bip_R_LowerLeg",
    "mixamorig:RightFoot": "J_Bip_R_Foot",
    "mixamorig:RightToeBase": "J_Bip_R_ToeBase",
}

# Target bones to leave at rest (not retargeted). Empty = retarget the full humanoid subset.
# Populate this to amputate problematic chains (e.g. arms) if a clip needs it. Left empty:
# the arm-splay distortion that earlier prompted amputation experiments was NOT a per-bone
# retarget-math error and NOT a harness artifact — it was a stale-parent chain-propagation
# bug in the bake loop (missing per-bone ``view_layer.update()``), now fixed. Full humanoid
# subset retargets cleanly. See docs/research/2026-05-31-retarget-pipeline.md Finding 7.
SKIP_TARGET_BONES: set[str] = set()


def _args(argv: list[str]) -> argparse.Namespace:
    after = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser(prog="retarget_to_vrm.py")
    p.add_argument("--vrm", required=True, help="target .vrm (loaded via glTF importer)")
    p.add_argument("--fbx", required=True, help="source Mixamo .fbx")
    p.add_argument("--out", required=True, help="destination .glb")
    p.add_argument("--name", default=None, help="clean clip name")
    return p.parse_args(after)


def _import_vrm_as_gltf(vrm_path: str) -> "bpy.types.Object":
    """Import a .vrm via Blender's glTF importer (a VRM is a glTF binary).

    Args:
        vrm_path: Path to the .vrm file.

    Returns:
        The imported VRM armature object.
    """
    tmp = os.path.join(tempfile.gettempdir(), "_retarget_vrm.glb")
    shutil.copyfile(vrm_path, tmp)
    bpy.ops.import_scene.gltf(filepath=tmp)
    arm = next((o for o in bpy.context.selected_objects if o.type == "ARMATURE"), None)
    if not arm:
        arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("[retarget] no armature in VRM")
    return arm


def _import_mixamo(fbx_path: str) -> "bpy.types.Object":
    """Import the Mixamo FBX, preserving native bone axes.

    Args:
        fbx_path: Path to the Mixamo .fbx.

    Returns:
        The Mixamo armature object (carrying the action).
    """
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False)
    arm = next((o for o in bpy.context.selected_objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("[retarget] no armature in FBX")
    return arm


def _frame_range(arm: "bpy.types.Object") -> tuple[int, int]:
    """Return (start, end) frame range from the armature's action."""
    ad = arm.animation_data
    if ad and ad.action:
        fr = ad.action.frame_range
        return int(fr[0]), int(fr[1])
    return 1, 1


def _bake_rest_relative(
    vrm_arm: "bpy.types.Object",
    mix_arm: "bpy.types.Object",
    f0: int,
    f1: int,
    action_name: str,
) -> int:
    """Retarget by applying each source bone's rotation-from-rest onto the target's rest.

    The robust cross-rig retarget formula (rotation only): for each mapped bone, take the
    source bone's world delta from its own rest pose, then apply that delta to the target
    bone's rest pose. This transfers the *motion* while respecting each rig's distinct
    rest-pose bone directions / rolls — so the limbs follow the animation instead of
    snapping to absolute Mixamo orientations (which leaves arms/legs splayed).

        delta_world          = src_pose_world @ src_rest_world⁻¹      (rotation only)
        tgt_pose_world_want  = delta_world @ tgt_rest_world
        tgt_pbone.matrix     = armature-space form of tgt_pose_world_want

    Bones are processed parent-first each frame so the matrix setter sees posed parents.

    Note: ``scene.frame_set(f)`` already re-evaluates the source action onto the original
    datablock pose (verified: original == evaluated-depsgraph read, identical per frame),
    so ``mix_pb[mx].matrix`` is the live posed source — no evaluated-depsgraph dance is
    needed here.

    Args:
        vrm_arm: Target VRM armature.
        mix_arm: Source Mixamo armature (carrying the action).
        f0: First frame.
        f1: Last frame.
        action_name: Name for the baked action.

    Returns:
        Number of bone pairs retargeted.
    """
    from mathutils import Matrix  # provided by Blender

    scene = bpy.context.scene
    vrm_pb = vrm_arm.pose.bones
    mix_pb = mix_arm.pose.bones

    # Resolve mapped pairs that exist on both rigs, ordered root→tip on the target so the
    # parent is already posed when a child's matrix is set.
    pairs = [(mx, vr) for mx, vr in MIXAMO_TO_VRM.items()
             if mx in mix_pb and vr in vrm_pb and vr not in SKIP_TARGET_BONES]
    def depth(bone):
        d, b = 0, bone
        while b.parent:
            d, b = d + 1, b.parent
        return d
    pairs.sort(key=lambda p: depth(vrm_arm.data.bones[p[1]]))

    # Per-bone rest world matrices (rotation only) — constant across frames.
    rot = lambda m: m.to_3x3().to_4x4()  # noqa: E731 — strip translation/scale
    src_rest_inv = {mx: rot(mix_arm.matrix_world @ mix_pb[mx].bone.matrix_local).inverted()
                    for mx, _ in pairs}
    tgt_rest = {vr: rot(vrm_arm.matrix_world @ vrm_pb[vr].bone.matrix_local)
                for _, vr in pairs}
    vrm_world_inv = vrm_arm.matrix_world.inverted()

    bpy.ops.object.select_all(action="DESELECT")
    vrm_arm.select_set(True)
    bpy.context.view_layer.objects.active = vrm_arm
    bpy.ops.object.mode_set(mode="POSE")

    if not vrm_arm.animation_data:
        vrm_arm.animation_data_create()
    action = bpy.data.actions.new(action_name)
    vrm_arm.animation_data.action = action

    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for mx, vr in pairs:
            src_pose_world = rot(mix_arm.matrix_world @ mix_pb[mx].matrix)
            delta = src_pose_world @ src_rest_inv[mx]
            want_world = delta @ tgt_rest[vr]
            pbone = vrm_pb[vr]
            # Preserve the bone's rest translation; only drive rotation.
            loc = pbone.matrix.to_translation()
            m = vrm_world_inv @ want_world
            pbone.matrix = Matrix.Translation(loc) @ m.to_3x3().to_4x4()
            # CRITICAL: propagate this bone's new pose through the dependency graph
            # BEFORE posing its children. ``pose_bone.matrix`` is a world-space setter
            # that back-solves the bone's local rotation against its PARENT's *current*
            # matrix — if the parent was just set in this same loop without an update,
            # the child solves against the stale (rest) parent and ends up rotated by
            # the parent's delta on top of its own. The error compounds down the chain
            # (measured: UpperArm 72deg / LowerArm 119deg / Hand 145deg off without this
            # update; 0.00deg with it). Invisible on legs — hips barely rotate — but
            # catastrophic on arms where shoulder+upper-arm both swing hard, which is
            # why arm-gesture clips splayed toward the source T-pose. See
            # docs/research/2026-05-31-retarget-pipeline.md Finding 7.
            bpy.context.view_layer.update()
        # keyframe after the whole chain is posed this frame
        for _, vr in pairs:
            vrm_pb[vr].keyframe_insert("rotation_quaternion", frame=f)

    bpy.ops.object.mode_set(mode="OBJECT")
    return len(pairs)


def main() -> None:
    """Retarget one Mixamo FBX onto a VRM rig and export GLB. See module docstring."""
    args = _args(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    vrm_arm = _import_vrm_as_gltf(args.vrm)
    mix_arm = _import_mixamo(args.fbx)
    f0, f1 = _frame_range(mix_arm)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = f0, f1

    baked_name = args.name or "clip"
    linked = _bake_rest_relative(vrm_arm, mix_arm, f0, f1, baked_name)

    # Drop the Mixamo source so only the VRM (with baked action) exports.
    bpy.data.objects.remove(mix_arm, do_unlink=True)
    # Purge every action except the one we just baked — otherwise the glTF ACTIONS
    # exporter ships the leftover Mixamo source action as a second animation track.
    for act in list(bpy.data.actions):
        if act.name != baked_name:
            bpy.data.actions.remove(act)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.out,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
    )
    print(f"[retarget] OK fbx={os.path.basename(args.fbx)} -> {os.path.basename(args.out)} "
          f"bones_linked={linked}/{len(MIXAMO_TO_VRM)} frames={f0}-{f1}")


if __name__ == "__main__":
    main()
