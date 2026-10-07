"""
Track A, step A3: rename parts to the node contract, rig the crank + pistons + rods with
slider-crank drivers, and bake one looping revolution (60 frames) as a node-TRS animation.

The contract lives in web/src/lib/engine/engineContract.ts. Node names:
  Block, HeadL, HeadR, Crank, Cyl_1..8_Piston, Cyl_1..8_Rod
Geometry constants are mirrored here; keep both files in sync.

Assumptions about the source model after reassembly:
  * Crank axis is along world +Y. Cylinder 1 is at the lowest Y, cylinder 8 at the highest.
  * The left bank (odd cylinders) leans to -X, the right bank (even) to +X, 90° apart.
  * Each piston/rod object has its origin at its wrist pin. If not, set origins first.

Run inside Blender after decimate.py. Set MAPPING to the source object names.
"""

import math

import bpy
from mathutils import Euler, Vector

# ---- geometry (mirror of engineContract.ts) ----
BANK_ANGLE_DEG = 90
CRANK_RADIUS = 0.045
ROD_LENGTH = 0.155
CYL_PITCH = 0.11
JOURNAL_THROW_DEG = [0, 90, 270, 180]
CYLINDER_JOURNAL = [0, 0, 1, 1, 2, 2, 3, 3]
FRAMES = 60

# ---- map source object names to contract names. Fill from engine-inspect.json ----
MAPPING = {
    "Block": "ENGINE_BLOCK_SOURCE_NAME_LO",
    "HeadL": "HEAD_LEFT_SOURCE_NAME_LO",
    "HeadR": "HEAD_RIGHT_SOURCE_NAME_LO",
    "Crank": "CRANK_SOURCE_NAME_LO",
}
for i in range(1, 9):
    MAPPING[f"Cyl_{i}_Piston"] = f"PISTON_{i}_SOURCE_NAME_LO"
    MAPPING[f"Cyl_{i}_Rod"] = f"ROD_{i}_SOURCE_NAME_LO"


def bank_angle_rad(cyl):
    half = math.radians(BANK_ANGLE_DEG / 2)
    return -half if cyl % 2 == 1 else half


def cylinder_crank_angle(cyl, crank):
    throw = math.radians(JOURNAL_THROW_DEG[CYLINDER_JOURNAL[cyl - 1]])
    return crank + throw - bank_angle_rad(cyl)


def slider_crank(theta):
    s, c = math.sin(theta), math.cos(theta)
    y = CRANK_RADIUS * c + math.sqrt(ROD_LENGTH**2 - CRANK_RADIUS**2 * s * s)
    phi = math.asin(CRANK_RADIUS * s / ROD_LENGTH)
    return y, phi


def rename_to_contract():
    missing = []
    for target, source in MAPPING.items():
        obj = bpy.data.objects.get(source)
        if obj is None:
            missing.append(source)
            continue
        obj.name = target
        obj.data.name = target
    if missing:
        raise RuntimeError(f"MAPPING has {len(missing)} unresolved source names: {missing[:5]} ...")


def build_rig(crank_origin=Vector((0, 0, 0))):
    """
    Parent each piston and rod to a bank-aligned empty so local +Z is the cylinder axis.
    Keyframe the crank rotation and piston/rod transforms over FRAMES frames.
    """
    crank = bpy.data.objects["Crank"]
    crank.rotation_mode = "XYZ"
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FRAMES

    rigs = {}
    for cyl in range(1, 9):
        bank = bank_angle_rad(cyl)
        y_pos = crank_origin.y + (CYLINDER_JOURNAL[cyl - 1] + 0.5) * CYL_PITCH - 2 * CYL_PITCH
        empty = bpy.data.objects.new(f"Cyl_{cyl}_Axis", None)
        scene.collection.objects.link(empty)
        empty.location = Vector((crank_origin.x, y_pos, crank_origin.z))
        empty.rotation_euler = Euler((0, bank, 0), "XYZ")
        piston = bpy.data.objects[f"Cyl_{cyl}_Piston"]
        rod = bpy.data.objects[f"Cyl_{cyl}_Rod"]
        for part in (piston, rod):
            part.parent = empty
            part.matrix_parent_inverse.identity()
            part.rotation_mode = "XYZ"
        rigs[cyl] = (empty, piston, rod)

    for f in range(1, FRAMES + 1):
        crank_angle = 2 * math.pi * (f - 1) / FRAMES
        crank.rotation_euler = Euler((0, crank_angle, 0), "XYZ")
        crank.keyframe_insert("rotation_euler", frame=f)
        for cyl, (_, piston, rod) in rigs.items():
            theta = cylinder_crank_angle(cyl, crank_angle)
            y, phi = slider_crank(theta)
            piston.location = Vector((0, 0, y))
            piston.keyframe_insert("location", frame=f)
            # Rod: big end follows the crank pin, small end at the piston. Position it at the pin
            # and tilt by phi so its local +Z points at the wrist pin.
            pin = Vector((CRANK_RADIUS * math.sin(theta), 0, CRANK_RADIUS * math.cos(theta)))
            rod.location = pin
            rod.rotation_euler = Euler((0, -phi, 0), "XYZ")
            rod.keyframe_insert("location", frame=f)
            rod.keyframe_insert("rotation_euler", frame=f)

    for obj in [crank] + [p for _, p, _ in rigs.values()] + [r for _, _, r in rigs.values()]:
        if obj.animation_data and obj.animation_data.action:
            for fc in obj.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
                fc.modifiers.new("CYCLES")


def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    for name in MAPPING:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.select_set(True)
    for cyl in range(1, 9):
        bpy.data.objects[f"Cyl_{cyl}_Axis"].select_set(True)
    kwargs = dict(
        filepath=path,
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=True,
        export_yup=True,
    )
    # export_format enum varies by version; read valid ids first (MCP guidance).
    valid = [i.identifier for i in bpy.ops.export_scene.gltf.get_rna_type().properties["export_format"].enum_items]
    kwargs["export_format"] = "GLB" if "GLB" in valid else valid[0]
    bpy.ops.export_scene.gltf(**kwargs)


if __name__ == "__main__":
    rename_to_contract()
    build_rig()
    export_glb(bpy.path.abspath("//engine-raw.glb"))
    print("exported //engine-raw.glb. Next: tools/blender/export.sh")
