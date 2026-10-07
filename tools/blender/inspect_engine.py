"""
Track A, step A1: inspect an imported engine model inside Blender.

Run inside Blender (Text Editor > Run Script, or via the BlenderMCP execute_blender_code tool
after importing the Sketchfab model). Prints a JSON report to the system console and writes it
next to the .blend file as engine-inspect.json.

Pass criteria for the real-asset path (see docs/PLAN.md, Track A):
  crank, 8 pistons, 8 rods, heads are separate objects OR separable loose parts.
"""

import json
import os
import re

import bpy
from mathutils import Vector

PART_HINTS = {
    "crank": re.compile(r"crank|kurbel", re.I),
    "piston": re.compile(r"piston|kolben", re.I),
    "rod": re.compile(r"\brod\b|conrod|con_rod|connecting|pleuel", re.I),
    "head": re.compile(r"head|zylinderkopf", re.I),
    "block": re.compile(r"block|crankcase", re.I),
    "cam": re.compile(r"cam", re.I),
    "valve": re.compile(r"valve|ventil", re.I),
    "intake": re.compile(r"intake|manifold|plenum|throttle", re.I),
    "exhaust": re.compile(r"exhaust|header", re.I),
}


def bbox_world(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return lo, hi


def classify(name):
    for part, rx in PART_HINTS.items():
        if rx.search(name):
            return part
    return "unknown"


def loose_parts_count(obj):
    """Count connected components without entering edit mode (cheap union-find on edges)."""
    me = obj.data
    n = len(me.vertices)
    if n == 0:
        return 0
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for e in me.edges:
        a, b = e.vertices
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    return len({find(i) for i in range(n)})


def inspect():
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    report = {
        "blender_version": bpy.app.version_string,
        "object_count": len(bpy.data.objects),
        "mesh_count": len(meshes),
        "material_count": len(bpy.data.materials),
        "image_count": len(bpy.data.images),
        "total_faces": sum(len(o.data.polygons) for o in meshes),
        "objects": [],
        "by_part": {},
    }
    scene_lo = Vector((1e9, 1e9, 1e9))
    scene_hi = Vector((-1e9, -1e9, -1e9))

    for o in meshes:
        lo, hi = bbox_world(o)
        scene_lo = Vector(map(min, scene_lo, lo))
        scene_hi = Vector(map(max, scene_hi, hi))
        part = classify(o.name)
        loose = loose_parts_count(o) if len(o.data.vertices) < 400_000 else -1
        entry = {
            "name": o.name,
            "part_guess": part,
            "parent": o.parent.name if o.parent else None,
            "faces": len(o.data.polygons),
            "verts": len(o.data.vertices),
            "materials": [s.material.name for s in o.material_slots if s.material],
            "loose_parts": loose,
            "bbox_min": [round(v, 4) for v in lo],
            "bbox_max": [round(v, 4) for v in hi],
            "size": [round(v, 4) for v in (hi - lo)],
        }
        report["objects"].append(entry)
        report["by_part"].setdefault(part, []).append(o.name)

    report["scene_bbox_min"] = [round(v, 4) for v in scene_lo]
    report["scene_bbox_max"] = [round(v, 4) for v in scene_hi]
    report["scene_size"] = [round(v, 4) for v in (scene_hi - scene_lo)]

    counts = {k: len(v) for k, v in report["by_part"].items()}
    report["part_counts"] = counts
    report["a1_gate"] = {
        "crank_present": counts.get("crank", 0) >= 1,
        "pistons_8": counts.get("piston", 0) >= 8,
        "rods_8": counts.get("rod", 0) >= 8,
        "heads_present": counts.get("head", 0) >= 1,
        "single_merged_mesh": len(meshes) == 1,
        "verdict": None,
    }
    g = report["a1_gate"]
    if g["crank_present"] and g["pistons_8"] and g["rods_8"]:
        g["verdict"] = "PASS: parts are separate objects. Proceed to decimate.py."
    elif g["single_merged_mesh"] and report["objects"][0]["loose_parts"] > 20:
        g["verdict"] = "SEPARABLE: one mesh with many loose parts. Run Separate by Loose Parts, then re-inspect."
    elif len(bpy.data.materials) > 8:
        g["verdict"] = "MAYBE: try Separate by Material, then re-inspect."
    else:
        g["verdict"] = "FAIL: fused. Use the shell as static exterior and model internals (fallback 3 in PLAN.md)."

    out = os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "engine-inspect.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k != "objects"}, indent=2))
    print(f"full report: {out}")
    return report


if __name__ == "__main__":
    inspect()
