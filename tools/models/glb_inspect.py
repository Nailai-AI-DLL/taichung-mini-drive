"""
GLB 體檢:判斷一個外部(Tripo 等)產生的 GLB 能不能直接拿來當街道物件用。
報告:物件/網格數、三角面數、頂點數、材質與貼圖尺寸、外框尺寸(Blender 單位)、
      幾個互不相連的零件(一個檔案裡是不是放了好幾棵樹)、每個零件的外框,並輸出四張預覽圖。

用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/models/glb_inspect.py -- <檔案.glb> <輸出資料夾>
輸出:<輸出資料夾>/<檔名>_report.json、<檔名>_{front,side,top,persp}.png
"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector

src, out_dir = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(out_dir, exist_ok=True)
name = os.path.splitext(os.path.basename(src))[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
rep = {"file": os.path.basename(src), "bytes": os.path.getsize(src), "objects": len(bpy.context.scene.objects),
       "meshes": [], "materials": [], "images": []}

allmin = Vector((1e9, 1e9, 1e9)); allmax = Vector((-1e9, -1e9, -1e9))
tot_tris = tot_verts = 0
for o in meshes:
    dg = bpy.context.evaluated_depsgraph_get()
    me = o.evaluated_get(dg).to_mesh()
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    ws = [o.matrix_world @ v.co for v in me.vertices]
    mn = Vector((min(v.x for v in ws), min(v.y for v in ws), min(v.z for v in ws)))
    mx = Vector((max(v.x for v in ws), max(v.y for v in ws), max(v.z for v in ws)))
    allmin = Vector(map(min, allmin, mn)); allmax = Vector(map(max, allmax, mx))
    # 互不相連的零件
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    seen = set(); parts = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; seen.add(v.index); ids = []
        while stack:
            c = stack.pop(); ids.append(c.index)
            for e in c.link_edges:
                w = e.other_vert(c)
                if w.index not in seen:
                    seen.add(w.index); stack.append(w)
        pts = [ws[i] for i in ids]
        pmn = [round(min(p[k] for p in pts), 3) for k in range(3)]
        pmx = [round(max(p[k] for p in pts), 3) for k in range(3)]
        parts.append({"verts": len(ids), "min": pmn, "max": pmx})
    bm.free()
    parts.sort(key=lambda p: -p["verts"])
    big = [p for p in parts if p["verts"] >= 50]
    rep["meshes"].append({"name": o.name, "tris": tris, "verts": len(me.vertices),
                          "materials": [s.material.name if s.material else None for s in o.material_slots],
                          "parts_total": len(parts), "parts_ge50verts": len(big), "big_parts": big[:12],
                          "has_uv": len(me.uv_layers) > 0, "has_vcol": len(me.color_attributes) > 0})
    tot_tris += tris; tot_verts += len(me.vertices)
    o.evaluated_get(dg).to_mesh_clear()

for m in bpy.data.materials:
    info = {"name": m.name, "blend": getattr(m, "blend_method", None)}
    if m.use_nodes:
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            info["base_color"] = [round(x, 3) for x in b.inputs["Base Color"].default_value]
            info["metallic"] = round(b.inputs["Metallic"].default_value, 3)
            info["roughness"] = round(b.inputs["Roughness"].default_value, 3)
            info["alpha_linked"] = b.inputs["Alpha"].is_linked
        info["tex"] = [n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    rep["materials"].append(info)
for im in bpy.data.images:
    if im.size[0]:
        rep["images"].append({"name": im.name, "size": list(im.size), "channels": im.channels})

size = allmax - allmin
rep.update({"tris": tot_tris, "verts": tot_verts, "bbox_min": [round(x, 3) for x in allmin],
            "bbox_max": [round(x, 3) for x in allmax], "size_xyz": [round(x, 3) for x in size],
            "note": "Blender 座標:Z 朝上;glTF 的 +Y 朝上匯入後變成 +Z"})
with open(os.path.join(out_dir, f"{name}_report.json"), "w") as f:
    json.dump(rep, f, ensure_ascii=False, indent=1)

# 預覽圖(Workbench,貼圖顏色)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 768
sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); sc.world = w
ctr = (allmin + allmax) / 2
R = max(size) * 0.62
cam_d = bpy.data.cameras.new("cam"); cam_d.type = 'ORTHO'; cam_d.ortho_scale = max(size) * 1.15
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
views = {"front": Vector((0, -1, 0)), "side": Vector((1, 0, 0)), "top": Vector((0, 0, 1)),
         "persp": Vector((0.8, -1, 0.6)).normalized()}
for k, d in views.items():
    cam.location = ctr + d * max(size) * 3
    up = Vector((0, 1, 0)) if k == "top" else Vector((0, 0, 1))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler() if k != "top" else (0, 0, 0)
    sc.render.filepath = os.path.join(out_dir, f"{name}_{k}.png")
    bpy.ops.render.render(write_still=True)
print("INSPECT_DONE", json.dumps({k: rep[k] for k in ("tris", "verts", "size_xyz")}))
