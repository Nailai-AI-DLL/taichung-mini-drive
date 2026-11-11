"""
Blender 建模共用工具(在 Blender 內執行)。

座標慣例(Blender 為 Z 向上):+X = 車頭 / 物件前方、+Y = 左、+Z = 上。
輸出 glTF 時 Blender 自動轉成 Y 向上:Blender (x, y, z) → glTF (x, z, -y),
所以 Blender +Y(左)對應遊戲車體座標的 -Z(左),和 src/vehicle/vehicle.ts 一致。

已知的坑(probe.py 實測):
  1. 布林運算後會留下空材質槽,指定顏色前必須清空材質槽 → set_material() 已處理
  2. Workbench 預覽圖讀 viewport 顏色,不是節點顏色 → mat() 兩個都設
  3. bpy.ops.object.transform_apply() 預設連「位置」一起套用,原點會跑到世界原點,
     之後旋轉、縮放都會繞世界原點 → 一律用 apply_rot() / apply_scale(),只套用需要的那一項
"""
import json
import math
import bpy
import bmesh
from mathutils import Vector

_MATS = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    """'#RRGGBB'(sRGB)→ 線性 RGB,glTF baseColorFactor 與 Blender 內部都用線性值"""
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def mat(name, hex_color, roughness=0.75, metallic=0.0):
    """純色材質(不用貼圖)。同名重複呼叫回傳同一個材質。"""
    if name in _MATS:
        return _MATS[name]
    rgb = hex_rgb(hex_color)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    m.diffuse_color = (*rgb, 1)  # Workbench 預覽圖用
    _MATS[name] = m
    return m


def set_material(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def apply_rot(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def apply_scale(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_all(obj):
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def bevel(obj, width, segments=3, apply=True):
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(30)
    if apply:
        apply_all(obj)
    return obj


def smooth(obj, angle=40):
    """平滑著色,但保留大於 angle 度的硬邊"""
    activate(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    return obj


def box(name, size, loc, material, bevel_w=0.0, segments=3, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    apply_scale(o)
    if bevel_w > 0:
        bevel(o, bevel_w, segments)
    set_material(o, material)
    smooth(o)
    return o


def cylinder(name, radius, depth, loc, material, axis='X', verts=32, bevel_w=0.0, segments=2):
    rot = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    apply_rot(o)
    if bevel_w > 0:
        bevel(o, bevel_w, segments)
    set_material(o, material)
    smooth(o)
    return o


def torus(name, major, minor, loc, material, axis='X', major_seg=32, minor_seg=8):
    rot = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_seg,
                                     minor_segments=minor_seg, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    apply_rot(o)
    set_material(o, material)
    smooth(o, 80)
    return o


def profile_extrude(name, pts_xz, half_width, material, bevel_w=0.0, segments=4, y_center=0.0):
    """側面輪廓(x, z 點列,逆時針)沿 Y 擠出成實體。適合車身、車窗帶這類側面決定形狀的零件。"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    left = [bm.verts.new((x, y_center + half_width, z)) for x, z in pts_xz]
    right = [bm.verts.new((x, y_center - half_width, z)) for x, z in pts_xz]
    n = len(pts_xz)
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], right[i], right[j], left[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    if bevel_w > 0:
        bevel(o, bevel_w, segments)
    set_material(o, material)
    smooth(o)
    return o


def boolean(target, cutter, op='DIFFERENCE', remove_cutter=True, transfer_material=False, solver='EXACT'):
    """transfer_material=True:切出來的新面沿用切割體的材質(例如挖洞後洞內是玻璃色)。
    solver='MANIFOLD':Blender 5.2 的 EXACT 對地標尺度的擠出切割體會把整個物件切光(landmark_opera.py 實測),
    兩邊都是封閉網格時改用 MANIFOLD。"""
    m = target.modifiers.new("bool", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.solver = solver
    if transfer_material:
        m.material_mode = 'TRANSFER'
    apply_all(target)
    if remove_cutter:
        bpy.data.objects.remove(cutter)
    return target


def join(objs, name):
    """合併成一個物件(保留各自材質),減少遊戲中的物件數"""
    activate(objs[0])
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def mirror_y(obj):
    """複製一份並沿 Y 鏡射(做左右對稱零件)"""
    activate(obj)
    bpy.ops.object.duplicate()
    d = bpy.context.active_object
    d.scale.y *= -1
    apply_scale(d)
    activate(d)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode='OBJECT')
    return d


def triangle_count(objs):
    total = 0
    for o in objs:
        if o.type == 'MESH':
            total += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return total


def export_glb(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True)


def render_previews(out_prefix, target=(0, 0, 0), views=None, distance=6.5, size=(900, 650)):
    """Workbench 快速預覽圖:多個視角,檔名 <out_prefix>-<視角>.png"""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.cavity_type = 'WORLD'
    sh.show_object_outline = True
    sh.object_outline_color = (0.25, 0.25, 0.28)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w") if not scene.world else scene.world
    scene.world = world
    world.color = hex_rgb('#EAEDEE')
    views = views or {
        'front34': (35, 18),
        'rear34': (145, 18),
        'side': (90, 5),
        'front': (0, 8),
        'top': (60, 60),
        'photo': (32, 8),  # 對照 Cooper 實車照片(mini60/cooper-own-3q-front.jpg)的角度
    }
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 55
    cam_data.clip_end = max(100.0, distance * 4)  # 地標尺度(數百公尺)要放大遠裁切面
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    t = Vector(target)
    outputs = []
    for name, (az, el) in views.items():
        # az:0 = 正前方(+X),往 +Y(左側)逆時針增加;地標腳本的 +X = 東、+Y = 北
        a = math.radians(az)
        e = math.radians(el)
        cam.location = t + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * distance
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        path = f"{out_prefix}-{name}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outputs.append(path)
    bpy.data.objects.remove(cam)
    return outputs


def superellipse_loop(hw, zb, zt, n=3.0, count=16, top_scale=1.0, bump=None):
    """
    一個斷面(Y-Z 平面)的封閉圈:超橢圓,n 越大越方、n = 2 是橢圓。
    top_scale < 1:越往上越窄(車窗內傾 tumblehome)。
    bump(y) -> dz:頂部額外加高(例如頭燈上方的葉子板隆起),只作用在上半圈。
    回傳 [(y, z), ...],從右下開始逆時針(看向 +X)。
    """
    zc = (zb + zt) / 2
    hh = (zt - zb) / 2
    pts = []
    for k in range(count):
        t = 2 * math.pi * k / count - math.pi / 2 + math.pi / count
        c, s = math.cos(t), math.sin(t)
        y = hw * math.copysign(abs(c) ** (2 / n), c)
        z = zc + hh * math.copysign(abs(s) ** (2 / n), s)
        f = (z - zb) / (zt - zb) if zt > zb else 0
        y *= 1 + (top_scale - 1) * f
        if bump and s > 0:
            z += bump(y) * s
        pts.append((y, z))
    return pts


def loft(name, sections, material, levels=2, cap=True):
    """
    沿 X 軸串接多個斷面圈(點數相同),兩端封口,再套細分曲面變圓滑。
    sections: [(x, [(y, z), ...]), ...],x 由小到大。
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for (y, z) in loop] for x, loop in sections]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    if levels:
        m = o.modifiers.new("subsurf", "SUBSURF")
        m.levels = levels
        m.render_levels = levels
        apply_all(o)
    set_material(o, material)
    activate(o)
    bpy.ops.object.shade_smooth()
    return o


def surface_strip(name, x0, x1, y_center, width, target, material, offset=0.006, segments=24):
    """
    貼在曲面上的細長色帶(例如引擎蓋條紋):在上方建一條細分平面,往下投影包覆到 target 表面。
    用在曲面上;直接放方塊會埋進去或浮起來(實測踩過)。
    """
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=segments, y_subdivisions=2, size=1,
                                    location=((x0 + x1) / 2, y_center, 3.0))
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, width, 1)
    apply_scale(o)
    m = o.modifiers.new("wrap", "SHRINKWRAP")
    m.target = target
    m.wrap_method = 'PROJECT'
    m.use_project_z = True
    m.use_negative_direction = True
    m.use_positive_direction = False
    m.offset = offset
    apply_all(o)
    set_material(o, material)
    activate(o)
    bpy.ops.object.shade_smooth()
    return o


def surface_hit(target, origin, direction):
    """從 origin 沿 direction 射線打到 target 表面,回傳 (位置, 法向量);target 需已套用所有修改器、無物件變形。"""
    ok, loc, normal, _ = target.ray_cast(Vector(origin), Vector(direction).normalized())
    if not ok:
        raise RuntimeError(f"射線沒有打到 {target.name}:{origin} → {direction}")
    return loc, normal


def orient_to(obj, normal, local_axis='Z'):
    """把物件的 local_axis 轉到 normal 方向(繞物件原點),並套用旋轉"""
    src = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[local_axis]
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = src.rotation_difference(Vector(normal))
    apply_rot(obj)
    return obj


def side_strip(name, x, z0, z1, width, side, target, material, offset=0.004, segments=8):
    """貼在車身側面的直條(例如門縫):在側面外建細分平面,沿 ∓Y 投影包覆到 target。"""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=2, y_subdivisions=segments, size=1,
                                    location=(x, side * 3.0, (z0 + z1) / 2), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.scale = (width, z1 - z0, 1)
    apply_scale(o)
    apply_rot(o)
    m = o.modifiers.new("wrap", "SHRINKWRAP")
    m.target = target
    m.wrap_method = 'PROJECT'
    m.use_project_y = True
    m.use_negative_direction = side > 0
    m.use_positive_direction = side < 0
    m.offset = offset
    apply_all(o)
    set_material(o, material)
    activate(o)
    bpy.ops.object.shade_smooth()
    return o


# ---------------- 地標用(docs/decisions/0013) ----------------
# 外框檔:data/landmarks/footprints-<area>.json,由 tools/map-build/build.ts 產生。
# 座標 X = 東、Y = 北、原點 = 地標形心,單位公尺;模型照這個座標建,輸出 GLB 後直接貼齊遊戲裡的 OSM 外框。


def load_footprint(path, lid):
    """回傳 (rings, h):rings 為 [(x, y), ...] 的串列(已轉成逆時針),h 為 OSM 高度或樓層推估(公尺)"""
    with open(path, encoding='utf-8') as f:
        lm = json.load(f)['landmarks'][lid]
    return [ring_ccw([tuple(p) for p in r]) for r in lm['rings']], lm['h']


def ring_area(ring):
    a = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        a += x0 * y1 - x1 * y0
    return a / 2


def ring_ccw(ring):
    return ring if ring_area(ring) > 0 else list(reversed(ring))


def min_area_rect(ring):
    """最小面積外接矩形:回傳 (cx, cy, angle, length, width),angle 為長邊方向(弧度,從 +X 逆時針)"""
    best = None
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        ang = math.atan2(y1 - y0, x1 - x0)
        c, s = math.cos(ang), math.sin(ang)
        us = [x * c + y * s for x, y in ring]
        vs = [-x * s + y * c for x, y in ring]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            um, vm = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (area, um * c - vm * s, um * s + vm * c, ang, max(us) - min(us), max(vs) - min(vs))
    _, cx, cy, ang, l, w = best
    if w > l:  # 讓 angle 指向長邊
        ang += math.pi / 2
        l, w = w, l
    return cx, cy, ang, l, w


def offset_ring(ring, d):
    """沿斜接方向往外(d > 0)或往內(d < 0)平移逆時針環;尖角限制在 4 倍距離內"""
    n = len(ring)
    out = []
    for i in range(n):
        px, py = ring[i - 1]
        cx, cy = ring[i]
        nx_, ny_ = ring[(i + 1) % n]

        def rn(ax, ay, bx, by):  # 右手(外側)法向量
            dx, dy = bx - ax, by - ay
            l = math.hypot(dx, dy) or 1.0
            return dy / l, -dx / l
        n1 = rn(px, py, cx, cy)
        n2 = rn(cx, cy, nx_, ny_)
        mx, my = n1[0] + n2[0], n1[1] + n2[1]
        ml = math.hypot(mx, my) or 1.0
        mx, my = mx / ml, my / ml
        dot = max(0.25, mx * n1[0] + my * n1[1])
        out.append((cx + mx * d / dot, cy + my * d / dot))
    return out


def footprint_prism(name, ring, z0, z1, material, bevel_w=0.0, segments=2):
    """依外框(逆時針 (x, y) 點列)擠出直立柱體,z0 到 z1"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, z0)) for x, y in ring]
    top = [bm.verts.new((x, y, z1)) for x, y in ring]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    if bevel_w > 0:
        bevel(o, bevel_w, segments)
    set_material(o, material)
    return o


def oriented_box(name, cx, cy, ang, length, width, z0, z1, material, bevel_w=0.0, segments=2):
    """沿 ang 方向擺放的長方體(地標的量體分段常沿外框主軸)"""
    o = box(name, (length, width, z1 - z0), (cx, cy, (z0 + z1) / 2), material, bevel_w=bevel_w, segments=segments)
    o.rotation_euler = (0, 0, ang)
    apply_rot(o)
    return o
