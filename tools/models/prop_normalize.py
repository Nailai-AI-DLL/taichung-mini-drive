"""
把 Tripo 產生的街道物件 GLB 整理成遊戲可直接用的樣板(decisions/0020)。
  - 合併重疊頂點(Tripo 在 UV 接縫處會斷開)
  - 原點移到「立在地上的那一點」(路燈 = 燈桿底部中心;樹 = 樹幹底部中心),底部貼 y=0
  - 縮放成真實尺寸(公尺)
  - 方向:路燈的懸臂朝 +X(遊戲端 InstancedMesh 用 a = 懸臂朝向 旋轉)
  - 材質:只留顏色貼圖(縮成 512²),拿掉金屬度/粗糙度與法線貼圖,改成不透明
  - trees 模式:一個檔案裡的多棵樹黏成一塊時，用「離哪根樹幹近」把面分給各棵樹，
    丟掉灌木(地面上沒有樹幹的零件),每棵樹輸出成一個節點 tree_0、tree_1…

用法:
  Blender -b --factory-startup -P tools/models/prop_normalize.py -- light <輸入.glb> <輸出.glb> <高度公尺>
  Blender -b --factory-startup -P tools/models/prop_normalize.py -- trees <輸入.glb> <輸出.glb> <最高那棵的高度公尺>
  Blender -b --factory-startup -P tools/models/prop_normalize.py -- group <輸入.glb> <輸出.glb> <最高點高度公尺>
    group:整組原樣保留(不拆),原點 = 前緣中點(Blender −Y 那一側;Tripo 樹組的灌木在這側),
          輸出後在 three.js 裡前緣朝 +z;遊戲端把 +z 轉向車道
最後一行印 PROP_DONE {...}(每個節點的面數、外框)。
"""
import sys, json, math
import bpy, bmesh
from mathutils import Vector

mode, src, dst, target_h = sys.argv[sys.argv.index("--") + 1:][:4]
target_h = float(target_h)
TEX = 512
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
# 套用匯入時的變換，之後全部用世界座標(Blender:Z 朝上)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o is not obj:
        bpy.data.objects.remove(o)

# 材質：只留顏色貼圖
mat = obj.material_slots[0].material
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
for inp in ("Metallic", "Roughness", "Normal"):
    for l in list(bsdf.inputs[inp].links):
        nt.links.remove(l)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.9
for n in list(nt.nodes):
    if n.type in ('NORMAL_MAP',) or (n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs["Base Color"] for l in n.outputs[0].links)):
        nt.nodes.remove(n)
mat.blend_method = 'OPAQUE'
for n in nt.nodes:
    if n.type == 'TEX_IMAGE' and n.image:
        n.image.scale(TEX, TEX)
        n.image.file_format = 'JPEG'
# 沒被用到的圖拿掉，避免被一起輸出
for im in list(bpy.data.images):
    if im.users == 0:
        bpy.data.images.remove(im)

bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
bm.to_mesh(obj.data)
bm.free()


def loose_parts(o):
    """互不相連的零件:回傳 [面索引集合…](大的在前)"""
    b = bmesh.new(); b.from_mesh(o.data); b.faces.ensure_lookup_table()
    seen = set(); parts = []
    for f in b.faces:
        if f.index in seen: continue
        st = [f]; seen.add(f.index); ids = []
        while st:
            c = st.pop(); ids.append(c.index)
            for e in c.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index); st.append(g)
        parts.append(ids)
    b.free()
    parts.sort(key=len, reverse=True)
    return parts


def split_faces(o, groups, names):
    """依面索引分組，每組複製成一個新物件"""
    outs = []
    for ids, nm in zip(groups, names):
        me = o.data.copy()
        no = bpy.data.objects.new(nm, me)
        bpy.context.scene.collection.objects.link(no)
        b = bmesh.new(); b.from_mesh(me); b.faces.ensure_lookup_table()
        keep = set(ids)
        bmesh.ops.delete(b, geom=[f for f in b.faces if f.index not in keep], context='FACES')
        b.to_mesh(me); b.free()
        outs.append(no)
    bpy.data.objects.remove(o)
    return outs


def base_point(o, zmax_frac=0.08):
    """立地點:最低的那一圈頂點(高度前 zmax_frac)的 XY 中心"""
    vs = [v.co for v in o.data.vertices]
    z0 = min(v.z for v in vs); z1 = max(v.z for v in vs)
    low = [v for v in vs if v.z <= z0 + (z1 - z0) * zmax_frac]
    return Vector((sum(v.x for v in low) / len(low), sum(v.y for v in low) / len(low), z0))


if mode == "light":
    objs = [obj]
    obj.name = "light"
    # 燈桿底部 = 最低 3% 高度的頂點中心(底座)
    bp = base_point(obj, 0.03)
    obj.data.transform(__import__("mathutils").Matrix.Translation(-bp))
    # 懸臂朝向:燈頭(最高 15% 的頂點)相對燈桿的水平方向，轉到 +X
    vs = [v.co for v in obj.data.vertices]
    zt = max(v.z for v in vs)
    head = [v for v in vs if v.z > zt * 0.85]
    hx = sum(v.x for v in head) / len(head); hy = sum(v.y for v in head) / len(head)
    ang = math.atan2(hy, hx)
    from mathutils import Matrix
    obj.data.transform(Matrix.Rotation(-ang, 4, 'Z'))
    s = target_h / zt
    obj.data.transform(Matrix.Scale(s, 4))
elif mode == "trees":
    from mathutils import Matrix
    parts = loose_parts(obj)
    me = obj.data
    me.calc_loop_triangles()
    poly_z = lambda i: me.polygons[i].center.z
    # 樹 = 最高點超過整體高度一半的零件(灌木矮)
    H = max(v.co.z for v in me.vertices)
    tree_faces = [i for p in parts if max(poly_z(i) for i in p) > H * 0.5 for i in p]
    # 樹幹:很低(< 12% 高)的面，依 X 分群(相距 > 5% 寬就是不同棵)
    low = sorted((me.polygons[i].center for i in tree_faces if poly_z(i) < H * 0.12), key=lambda c: c.x)
    trunks = []
    for c in low:
        if trunks and c.x - trunks[-1][-1].x < H * 0.08:
            trunks[-1].append(c)
        else:
            trunks.append([c])
    trunks = [Vector((sum(c.x for c in t) / len(t), sum(c.y for c in t) / len(t))) for t in trunks if len(t) >= 2]
    groups = [[] for _ in trunks]
    for i in tree_faces:
        c = me.polygons[i].center
        k = min(range(len(trunks)), key=lambda j: (c.x - trunks[j].x) ** 2 + (c.y - trunks[j].y) ** 2)
        groups[k].append(i)
    objs = split_faces(obj, groups, [f"tree_{i}" for i in range(len(groups))])
    s = target_h / H
    for o, t in zip(objs, trunks):
        z0 = min(v.co.z for v in o.data.vertices)
        o.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-t.x, -t.y, -z0))))
elif mode == "group":
    from mathutils import Matrix
    objs = [obj]
    obj.name = "group"
    vs = [v.co for v in obj.data.vertices]
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
    y0 = min(v.y for v in vs)
    z0 = min(v.z for v in vs); z1 = max(v.z for v in vs)
    s = target_h / (z1 - z0)
    obj.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-cx, -y0, -z0))))
else:
    raise SystemExit(f"未知模式 {mode}")

info = {}
for o in objs:
    o.data.calc_loop_triangles()
    vs = [v.co for v in o.data.vertices]
    info[o.name] = {"tris": len(o.data.loop_triangles),
                    "min": [round(min(v[k] for v in vs), 2) for k in range(3)],
                    "max": [round(max(v[k] for v in vs), 2) for k in range(3)]}
    o.location = (0, 0, 0)

bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_image_format='JPEG',
                          export_jpeg_quality=85, export_apply=True)
print("PROP_DONE", json.dumps(info, ensure_ascii=False))
