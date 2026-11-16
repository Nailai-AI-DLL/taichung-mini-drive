"""
把「一張 3×3 排好的樹組」GLB(例:Tripo 社群的 blossom trees,九棵排在一個面上)拆成九棵、減面、貼圖烘成頂點色。
遊戲畫風是純色、低多邊形、不用貼圖(0015 方向 A),行道樹數量多(畫面上 5,000+ 棵,InstancedMesh),
所以每棵壓到 target 個三角形以下,顏色取貼圖在每個面中心的顏色(面內同色,卡通平塗)。

步驟(每棵):
  1. 依面中心在 X(左右)與 Z(上下)的位置分到 3×3 的格子(Blender 座標 Z 朝上;樹組是立著排的)
  2. 合併重疊頂點(Tripo 在 UV 接縫處斷開)→ Decimate(collapse)到目標面數
  3. 每個面取 UV 中心 → 讀 basecolor 貼圖 → 寫進面角的頂點色(sRGB)
  4. 原點 = 底部中心、底部貼 z=0;縮放成 height 公尺高;拿掉貼圖與材質,只留頂點色
輸出:一個 GLB,節點 tree_<列><行>(列 0 = 最上面那排),每個節點一棵;另輸出一張九棵並排的預覽圖。

用法:
  Blender -b --factory-startup -P tools/models/tree_grid_split.py -- <輸入.glb> <輸出.glb> <預覽.png> [每棵三角形上限=450] [高度公尺=7] [grid|row]
  grid(預設):3×3 立著排(例:blossom trees);
  row:站在地上排成一排、寬度不一(例:low poly trees 五棵)。先找貼地的樹幹(X 位置分群),
       再把每個互不相連的零件(樹葉團、樹枝)整個分給 X 最近的樹幹,樹葉不會被切半。
最後一行印 TREES_DONE {...}(每棵的三角形數、外框)。
"""
import sys, json, math
import bpy, bmesh
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, dst, preview = args[:3]
target = int(args[3]) if len(args) > 3 else 450
height = float(args[4]) if len(args) > 4 else 7.0
layout = args[5] if len(args) > 5 else 'grid'
GRID = 3

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
src_obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = src_obj
src_obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# basecolor 貼圖 → 像素陣列(RGBA float,線性;寫頂點色時轉回 sRGB 由 Blender 處理)
mat = src_obj.material_slots[0].material
img = None
for n in mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE' and n.image and 'basecolor' in n.image.name.lower():
        img = n.image
if img is None:
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            img = n.image
            break
W, H = img.size
px = list(img.pixels[:])


def sample(u, v):
    x = min(W - 1, max(0, int((u % 1.0) * W)))
    y = min(H - 1, max(0, int((v % 1.0) * H)))
    i = (y * W + x) * 4
    return px[i], px[i + 1], px[i + 2]


me = src_obj.data
xs = [v.co.x for v in me.vertices]
zs = [v.co.z for v in me.vertices]
x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
cell = {}
if layout == 'grid':
    for p in me.polygons:
        c = p.center
        col = min(GRID - 1, int((c.x - x0) / (x1 - x0) * GRID))
        row = min(GRID - 1, int((z1 - c.z) / (z1 - z0) * GRID))  # 列 0 = 最上面
        cell.setdefault((row, col), []).append(p.index)
else:
    # 樹幹:貼地(z < 3% 高度)的頂點 X,依間隙 > 2% 寬度分群
    ground = sorted(v.co.x for v in me.vertices if v.co.z < z0 + (z1 - z0) * 0.03)
    gap = (x1 - x0) * 0.02
    trunks, grp = [], [ground[0]]
    for x in ground[1:]:
        if x - grp[-1] > gap:
            trunks.append(sum(grp) / len(grp))
            grp = []
        grp.append(x)
    trunks.append(sum(grp) / len(grp))
    # 互不相連的零件(以頂點並查集)
    parent = list(range(len(me.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    # 位置相同但沒相連的頂點(UV 接縫)也算同一零件
    pos = {}
    for v in me.vertices:
        k = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5))
        if k in pos:
            a, b = find(v.index), find(pos[k])
            if a != b:
                parent[a] = b
        else:
            pos[k] = v.index
    part_faces, part_x = {}, {}
    for p in me.polygons:
        r = find(p.vertices[0])
        part_faces.setdefault(r, []).append(p.index)
        sx, n = part_x.get(r, (0.0, 0))
        part_x[r] = (sx + p.center.x, n + 1)
    for r, faces in part_faces.items():
        cx = part_x[r][0] / part_x[r][1]
        k = min(range(len(trunks)), key=lambda i: abs(trunks[i] - cx))
        cell.setdefault((0, k), []).extend(faces)
    print("TRUNKS", [round(t, 3) for t in trunks], "PARTS", len(part_faces))

report = {}
out_objs = []
for (row, col), faces in sorted(cell.items()):
    name = f"tree_{row}{col}"
    # 複製出只含這一格面的物件
    bm = bmesh.new()
    bm.from_mesh(me)
    keep = set(faces)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    m2 = bpy.data.meshes.new(name)
    bm.to_mesh(m2)
    bm.free()
    o = bpy.data.objects.new(name, m2)
    bpy.context.scene.collection.objects.link(o)
    # 減面
    tris0 = sum(len(p.vertices) - 2 for p in m2.polygons)
    if tris0 > target:
        mod = o.modifiers.new("dec", 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = target / tris0
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    m2 = o.data
    # 面中心 UV → 貼圖顏色 → 面角頂點色
    uv = m2.uv_layers.active.data
    attr = m2.color_attributes.new(name="Color", type='BYTE_COLOR', domain='CORNER')
    for p in m2.polygons:
        us = [uv[li].uv for li in p.loop_indices]
        u = sum(t.x for t in us) / len(us)
        v = sum(t.y for t in us) / len(us)
        # 中心 + 往三個角各 1/3 的點,四點逐色版取中位數:單點會落在 UV 島邊緣、取到隔壁島的顏色(樹幹底出現綠色三角形)
        pts = [(u, v)] + [(u + (t.x - u) / 3, v + (t.y - v) / 3) for t in us[:3]]
        cs = [sample(a, b) for a, b in pts]
        r, g, b = (sorted(c[i] for c in cs)[len(cs) // 2] for i in range(3))
        for li in p.loop_indices:
            attr.data[li].color = (r, g, b, 1.0)
    # 貼地 12% 高度內的面是樹幹:取到綠色(g 最大)的改成這一段非綠色面的中位色(0044:low poly 第一棵樹幹底有一塊綠)
    zs_ = [v.co.z for v in m2.vertices]
    zlo, zhi = min(zs_), max(zs_)
    low = [p for p in m2.polygons if p.center.z < zlo + (zhi - zlo) * 0.12]
    def col_of(p):
        return attr.data[p.loop_indices[0]].color
    bark = [col_of(p) for p in low if not (col_of(p)[1] > col_of(p)[0] and col_of(p)[1] > col_of(p)[2])]
    if bark:
        med = [sorted(c[i] for c in bark)[len(bark) // 2] for i in range(3)]
        for p in low:
            c = col_of(p)
            if c[1] > c[0] and c[1] > c[2]:
                for li in p.loop_indices:
                    attr.data[li].color = (med[0], med[1], med[2], 1.0)
    # 拿掉 UV 與材質
    while m2.uv_layers:
        m2.uv_layers.remove(m2.uv_layers[0])
    m2.materials.clear()
    # 原點 = 底部中心,底部貼 z=0,縮放到 height 公尺
    vs = [v.co.copy() for v in m2.vertices]
    zmin = min(v.z for v in vs)
    zmax = max(v.z for v in vs)
    base = [v for v in vs if v.z < zmin + (zmax - zmin) * 0.05]
    cx = sum(v.x for v in base) / len(base)
    cy = sum(v.y for v in base) / len(base)
    s = height / (zmax - zmin)
    for v in m2.vertices:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
    # 平面陰影(每個面一個法向量):低多邊形的稜角感;匯出時頂點會依面拆開
    for poly in m2.polygons:
        poly.use_smooth = False
    m2.update()
    vs = [v.co for v in m2.vertices]
    report[name] = {
        "tris_before": tris0,
        "tris": sum(len(p.vertices) - 2 for p in m2.polygons),
        "size": [round(max(v.x for v in vs) - min(v.x for v in vs), 2), round(max(v.y for v in vs) - min(v.y for v in vs), 2), round(max(v.z for v in vs), 2)],
    }
    out_objs.append(o)

bpy.data.objects.remove(src_obj)

# 匯出(只有頂點色;glTF +Y 朝上由匯出器轉換)
for o in bpy.context.scene.objects:
    o.select_set(o in out_objs)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_materials='NONE',
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_apply=True)

# 預覽:全部排成一列,依各棵寬度留間隔(Workbench,頂點色、平塗)
xcur = 0.0
for o in out_objs:
    xs_ = [v.co.x for v in o.data.vertices]
    o.location.x = xcur - min(xs_)
    xcur += (max(xs_) - min(xs_)) + height * 0.2
span = xcur - height * 0.2
cam_data = bpy.data.cameras.new("cam")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = span + 2
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cx = span / 2
cam.location = (cx, -60, height * 0.55)
cam.rotation_euler = (math.radians(90), 0, 0)
sc = bpy.context.scene
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'VERTEX'
sc.render.resolution_x = 2400
sc.render.resolution_y = max(300, int(2400 * (height * 1.15) / (span + 2)))
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new("w")
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)

print("TREES_DONE " + json.dumps(report, ensure_ascii=False))
