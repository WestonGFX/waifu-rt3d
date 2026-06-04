"""Diagnostic probe v2 (throwaway): is the arm splay a chain-propagation bug?

Single-bone formula A is provably correct (probe v1: 0.000 deg invariant error).
So the splay must come from posing a CHILD against a stale PARENT within the same
frame. This probe poses the whole L arm chain (Shoulder->UpperArm->LowerArm->Hand)
with formula A two ways:
  (1) set all bones, no view_layer.update() between them  (current committed code)
  (2) view_layer.update() after EACH bone set            (candidate fix)
and reports each bone's final world delta-from-rest vs the source's intended delta.
If (1) shows large error on UpperArm and (2) shows ~0, the fix is the update call.

Run:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python \
        tools/blender/_probe_chain.py -- \
        --vrm backend/storage/avatars/Raine.vrm --fbx ~/Downloads/mixamo-fbx/waving.fbx
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import sys
import tempfile

import bpy  # type: ignore
from mathutils import Matrix  # type: ignore

CHAIN = [
    ("mixamorig:LeftShoulder", "J_Bip_L_Shoulder"),
    ("mixamorig:LeftArm", "J_Bip_L_UpperArm"),
    ("mixamorig:LeftForeArm", "J_Bip_L_LowerArm"),
    ("mixamorig:LeftHand", "J_Bip_L_Hand"),
]


def _args(argv):
    after = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--vrm", required=True)
    p.add_argument("--fbx", required=True)
    return p.parse_args(after)


def _import_vrm(path):
    tmp = os.path.join(tempfile.gettempdir(), "_probe_vrm.glb")
    shutil.copyfile(path, tmp)
    bpy.ops.import_scene.gltf(filepath=tmp)
    return next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")


def _import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")


def _ang(qa, qb):
    d = max(-1.0, min(1.0, abs(qa.dot(qb))))
    return math.degrees(2 * math.acos(d))


def main():
    args = _args(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    vrm = _import_vrm(args.vrm)
    mix = _import_fbx(args.fbx)
    scene = bpy.context.scene
    mpb, vpb = mix.pose.bones, vrm.pose.bones
    rot = lambda m: m.to_3x3().to_4x4()
    ID = Matrix.Identity(4).to_quaternion()

    pairs = [(mx, vr) for mx, vr in CHAIN if mx in mpb and vr in vpb]

    src_rest_inv = {mx: rot(mix.matrix_world @ mpb[mx].bone.matrix_local).inverted() for mx, _ in pairs}
    tgt_rest = {vr: rot(vrm.matrix_world @ vpb[vr].bone.matrix_local) for _, vr in pairs}
    tgt_rest_inv = {vr: tgt_rest[vr].inverted() for _, vr in pairs}
    vrm_world_inv = vrm.matrix_world.inverted()

    ad = mix.animation_data
    f0, f1 = (int(ad.action.frame_range[0]), int(ad.action.frame_range[1])) if ad and ad.action else (1, 1)

    # extreme upper-arm frame
    best_f, best_ang = f0, -1.0
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        sp = rot(mix.matrix_world @ mpb["mixamorig:LeftArm"].matrix)
        a = _ang((sp @ src_rest_inv["mixamorig:LeftArm"]).to_quaternion(), ID)
        if a > best_ang:
            best_ang, best_f = a, f
    print(f"\n=== extreme frame {best_f} (upperarm src delta {best_ang:.1f} deg) ===")

    bpy.ops.object.select_all(action="DESELECT")
    vrm.select_set(True)
    bpy.context.view_layer.objects.active = vrm
    bpy.ops.object.mode_set(mode="POSE")

    def run(update_each: bool):
        # reset pose
        for _, vr in pairs:
            vpb[vr].matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        scene.frame_set(best_f)
        # intended per-bone source world delta
        want = {}
        for mx, vr in pairs:
            sp = rot(mix.matrix_world @ mpb[mx].matrix)
            want[vr] = (sp @ src_rest_inv[mx]) @ tgt_rest[vr]
        for mx, vr in pairs:
            pb = vpb[vr]
            loc = pb.matrix.to_translation()
            m = vrm_world_inv @ want[vr]
            pb.matrix = Matrix.Translation(loc) @ m.to_3x3().to_4x4()
            if update_each:
                bpy.context.view_layer.update()
        bpy.context.view_layer.update()
        print(f"\n--- update_each={update_each} ---")
        for mx, vr in pairs:
            produced = rot(vrm.matrix_world @ vpb[vr].matrix)
            tgt_delta = produced @ tgt_rest_inv[vr]
            src_delta = (rot(mix.matrix_world @ mpb[mx].matrix) @ src_rest_inv[mx])
            err = _ang(tgt_delta.to_quaternion(), src_delta.to_quaternion())
            print(f"  {vr:22s} world-delta err vs source = {err:6.2f} deg")

    run(update_each=False)
    run(update_each=True)


if __name__ == "__main__":
    main()
