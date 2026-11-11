"""
Blender 工具鏈探針:確認背景模式下能做 M1 需要的操作。
  1. 倒角(bevel)、細分(subdivision)、布林(boolean)
  2. 純色材質(不用貼圖),平滑著色
  3. 輸出 GLB
  4. 算預覽圖(PNG)

用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/models/probe.py -- <輸出.glb> <預覽.png>
接著用 node tools/models/check-glb.mjs <輸出.glb> 確認 three.js 能載入。
"""
import sys, math
import bpy

out_glb, out_png = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    # Workbench 預覽圖讀的是 viewport 顏色,不是節點顏色;兩個都要設(實測踩過)
    m.diffuse_color = (*rgb, 1)
    return m

# 車身:倒角 + 細分 → 圓潤方塊
bpy.ops.mesh.primitive_cube_add(size=1)
body = bpy.context.active_object
body.scale = (2.0, 0.85, 0.5)
bpy.ops.object.transform_apply(scale=True)
bev = body.modifiers.new("bevel", "BEVEL"); bev.width = 0.18; bev.segments = 3
sub = body.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 1
# 布林:挖一個圓柱(輪拱)
bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=3, location=(1.2, 0, -0.3), rotation=(math.pi / 2, 0, 0))
cutter = bpy.context.active_object
boo = body.modifiers.new("arch", "BOOLEAN"); boo.object = cutter; boo.operation = "DIFFERENCE"
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
bpy.data.objects.remove(cutter)
bpy.ops.object.shade_smooth()
# 布林運算會留下空的材質槽,必須先清空再指定,否則顏色會掉(實測踩過)
body.data.materials.clear()
body.data.materials.append(mat("body", (0.02, 0.02, 0.025)))

# 白車頂
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.2, 0, 0.45))
roof = bpy.context.active_object
roof.scale = (1.1, 0.75, 0.05)
bpy.ops.object.transform_apply(scale=True)
r = roof.modifiers.new("bevel", "BEVEL"); r.width = 0.04; r.segments = 2
bpy.ops.object.modifier_apply(modifier="bevel")
roof.data.materials.append(mat("roof", (0.92, 0.92, 0.9)))

tris = sum(len(p.vertices) - 2 for o in (body, roof) for p in o.data.polygons)

bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_apply=True)

# 預覽圖:Workbench(快、不需 GPU 算光線)
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.render.resolution_x = 800
scene.render.resolution_y = 600
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (3.2, -3.4, 1.9)
direction = (-cam.location[0], -cam.location[1], -cam.location[2] + 0.2)
from mathutils import Vector
cam.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print(f"PROBE_OK tris={tris} glb={out_glb} png={out_png}")
