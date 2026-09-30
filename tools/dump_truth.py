"""Dump the evaluated 'build system' instance transforms from Cube.001 — ground truth
for validating the TypeScript port. Runs headless:

blender --background source/procedural_building.blend --python tools/dump_truth.py -- truth.json
"""
import bpy
import json
import sys

out_path = sys.argv[sys.argv.index("--") + 1]

dg = bpy.context.evaluated_depsgraph_get()

# map leaf object name -> owning collection(s) for aggregation
obj_to_cols = {}
for col in bpy.data.collections:
    for o in col.objects:
        obj_to_cols.setdefault(o.name, []).append(col.name)

instances = []
for inst in dg.object_instances:
    if not inst.is_instance:
        continue
    parent = inst.parent
    if not parent or parent.original.name != "Cube.001":
        continue
    o = inst.object.original
    instances.append({
        "name": o.name,
        "collections": obj_to_cols.get(o.name, []),
        "matrix": [list(r) for r in inst.matrix_world],
    })

mod = bpy.data.objects["Cube.001"].modifiers["GeometryNodes"]
params = {}
for item in mod.node_group.interface.items_tree:
    if item.item_type == "SOCKET" and item.in_out == "INPUT" and item.socket_type != "NodeSocketGeometry":
        try:
            params[item.name] = mod[item.identifier]
        except Exception:
            pass

with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"params": params, "instances": instances}, f)

print("TRUTH_OK", len(instances), "instances")
