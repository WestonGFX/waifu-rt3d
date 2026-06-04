"""Probe v3 (throwaway): does the EXPORTED glb still carry correct arm motion?

Bake probe (v2) proved the in-Blender pose is correct (0.00 deg). But the render
is broken. This re-imports the baked .glb and measures J_Bip_L_UpperArm's world
delta-from-rest across the action. If it peaks near the source's ~83 deg about a
sane axis, the export is fine and the bug is in the three.js viewer. If it's
garbage, the glTF export (yup / bone-roll round-trip) is the culprit.

Run:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python \
        tools/blender/_probe_exported.py -- --glb backend/storage/animations/vrm-baked/waving.glb
"""
from __future__ import annotations

import argparse
import math
import sys

import bpy  # type: ignore
from mathutils import Matrix  # type: ignore

VR = "J_Bip_L_UpperArm"


def _args(argv):
    after = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    return p.parse_args(after)


def _ang(qa, qb):
    d = max(-1.0, min(1.0, abs(qa.dot(qb))))
    return math.degrees(2 * math.acos(d))


def main():
    args = _args(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.glb)
    arm = next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")
    if arm.type != "ARMATURE":
        arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    pb = arm.pose.bones
    if VR not in pb:
        sys.exit(f"no {VR}; bones={[b.name for b in pb][:30]}")

    scene = bpy.context.scene
    rot = lambda m: m.to_3x3().to_4x4()
    rest = rot(arm.matrix_world @ pb[VR].bone.matrix_local)
    rest_inv = rest.inverted()
    ID = Matrix.Identity(4).to_quaternion()

    ad = arm.animation_data
    f0, f1 = (int(ad.action.frame_range[0]), int(ad.action.frame_range[1])) if ad and ad.action else (1, 1)
    print(f"action frames {f0}-{f1}")

    best_f, best_ang, best_axis = f0, -1.0, None
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        world = rot(arm.matrix_world @ pb[VR].matrix)
        delta = world @ rest_inv
        q = delta.to_quaternion()
        a = _ang(q, ID)
        if a > best_ang:
            best_ang, best_f = a, f
            best_axis = q.axis
    print(f"{VR}: peak world delta-from-rest = {best_ang:.1f} deg at frame {best_f}")
    print(f"  rotation axis (world) = ({best_axis.x:+.2f}, {best_axis.y:+.2f}, {best_axis.z:+.2f})")
    print("  expected: peak ~70-90 deg (arm raises during wave); garbage = export bug")


if __name__ == "__main__":
    main()
