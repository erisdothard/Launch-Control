"""
Track A, step A2: decimate the engine per object to a web budget and bake normals/AO.

Run inside Blender after inspect_engine.py passed (or after the fallback reassembly).
Produces two collections: ENGINE_HI (untouched source, hidden) and ENGINE_LO (decimated).

Budgets (docs/PLAN.md): ~150k tris desktop, ~50k tris mobile. Pass TARGET via the
LC_TARGET_TRIS environment variable or edit below. Small moving parts (pistons, rods, crank)
keep a higher share of the budget so their silhouettes stay crisp.
"""

import os

import bpy

TARGET_TRIS = int(os.environ.get("LC_TARGET_TRIS", "150000"))
# Minimum ratio a small part may be decimated to, so pistons never turn into blobs.
MIN_RATIO_MOVING = 0.35
MIN_RATIO_STATIC = 0.02
MOVING_HINTS = ("crank", "piston", "rod", "cyl_")


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def is_moving(obj):
    n = obj.name.lower()
    return any(h in n for h in MOVING_HINTS)


def ensure_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def duplicate_into(obj, col):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = obj.name + "_LO"
    col.objects.link(dup)
    return dup


def decimate_object(obj, ratio):
    mod = obj.modifiers.new("LC_Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.001, min(1.0, ratio))
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def run():
    hi = ensure_collection("ENGINE_HI")
    lo = ensure_collection("ENGINE_LO")
    sources = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.endswith("_LO")]
    for o in sources:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        hi.objects.link(o)

    total = sum(tri_count(o) for o in sources)
    moving = [o for o in sources if is_moving(o)]
    static = [o for o in sources if not is_moving(o)]
    moving_tris = sum(tri_count(o) for o in moving)
    static_tris = sum(tri_count(o) for o in static)

    # Give moving parts 40% of the budget regardless of their source share.
    moving_budget = TARGET_TRIS * 0.4 if moving else 0
    static_budget = TARGET_TRIS - moving_budget

    print(f"source tris: {total:,}  target: {TARGET_TRIS:,}")
    for o in sources:
        t = tri_count(o)
        if o in moving:
            ratio = max(MIN_RATIO_MOVING, moving_budget / max(1, moving_tris))
        else:
            ratio = max(MIN_RATIO_STATIC, static_budget / max(1, static_tris))
        ratio = min(1.0, ratio)
        d = duplicate_into(o, lo)
        bpy.ops.object.select_all(action="DESELECT")
        decimate_object(d, ratio)
        print(f"  {o.name:40} {t:>9,} -> {tri_count(d):>8,}  (ratio {ratio:.3f})")

    hi.hide_viewport = True
    hi.hide_render = True
    out = sum(tri_count(o) for o in lo.objects)
    print(f"ENGINE_LO total tris: {out:,}")
    print("Next: bake normals + AO from ENGINE_HI onto ENGINE_LO (see bake_maps in this file), then rig_bake.py")


def bake_maps(size=2048):
    """
    Bake normal + AO from the hi collection to the lo one using Cycles selected-to-active.
    Each LO object gets its own image pair; atlas in a later pass if texture count is a problem.
    """
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
    except TypeError as exc:
        raise RuntimeError(f"Cycles not available: {exc}") from exc
    scene.cycles.samples = 32
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.01
    lo = bpy.data.collections["ENGINE_LO"]
    hi = bpy.data.collections["ENGINE_HI"]
    hi.hide_viewport = False
    hi.hide_render = False
    for d in lo.objects:
        src_name = d.name[: -len("_LO")]
        src = bpy.data.objects.get(src_name)
        if src is None:
            continue
        mat = bpy.data.materials.new(f"{d.name}_mat")
        mat.use_nodes = True
        d.data.materials.clear()
        d.data.materials.append(mat)
        nodes = mat.node_tree.nodes
        for kind, color_space in (("normal", "Non-Color"), ("ao", "Non-Color")):
            img = bpy.data.images.new(f"{d.name}_{kind}", size, size)
            img.colorspace_settings.name = color_space
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = img
            nodes.active = tex
            bpy.ops.object.select_all(action="DESELECT")
            src.select_set(True)
            d.select_set(True)
            bpy.context.view_layer.objects.active = d
            if kind == "normal":
                bpy.ops.object.bake(type="NORMAL")
            else:
                bpy.ops.object.bake(type="AO")
            img.filepath_raw = f"//baked/{d.name}_{kind}.png"
            img.file_format = "PNG"
            img.save()
    hi.hide_viewport = True
    hi.hide_render = True


if __name__ == "__main__":
    run()
