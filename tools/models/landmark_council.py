"""
臺中市議會(議政大樓,Weber + Hofer)— Q 版低面數地標模型。

依據:docs/art/landmarks-reference.md §5,以 §10 的驗收更正為準:
  - 高 69.8 m、15 層;藍色反光玻璃方盒
  - 正面朝西南(市政北一路);背面朝東北(市政公園)
  - 上半部有前後貫穿的大方洞:上緣平、下緣是向下凹的弧線;位置偏西北端
    (從西南看在中段偏左、從東北看在中段偏右，是同一個位置)
外框:data/landmarks/footprints-range-a.json 的 council(矩形 108.3 × 31.5 m)
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/landmark_council.py -- <輸出資料夾 public/models/landmarks> <預覽圖資料夾> <外框檔>
輸出:council.glb、預覽圖 council-<視角>.png

座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心,地面 z = 0(docs/decisions/0013)。
沿長軸的座標 u(+u 往西北)、垂直的座標 v(+v = 正面，朝西南)。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import (reset, mat, boolean, join, triangle_count, export_glb, render_previews,  # noqa: E402
                    load_footprint, min_area_rect, activate)

# ---- 參數(除總高、層數外都是目視比例推論,landmarks-reference.md §5.2、§5.6、§10)----
FRONT_BEARING = 212.0  # 正面方位(市政北一路側)
NW_BEARING = 302.0  # 方洞偏向的一端
FLOORS = 15
HOLE_W = 30.0  # 方洞寬
HOLE_TOP = 0.86  # 方洞上緣(總高比例)
HOLE_BOTTOM = 0.62  # 方洞弧形下緣最低點(總高比例)
HOLE_SAG = 4.5  # 弧形下緣：兩端比中央高多少
HOLE_OFFSET = 0.13  # 方洞中心往西北偏移(長度比例)
ARCADE_W, ARCADE_H, ARCADE_D = 36.0, 5.0, 3.0  # 地面層架空廊:寬、高、內凹深度(前後兩面)
TRIM = 1.0  # 弧形下緣白邊寬

C = {  # landmarks-reference.md §5.4(推論色);綠地為推論
    'glass': '#8EA2B8',
    'line': '#B8C4D0',
    'hole': '#5C6066',
    'trim': '#E8EAEC',
    'green': '#A9C29A',
}


class Frame:
    """長軸座標 u(+u 往西北)、正面座標 v(+v 指向 FRONT_BEARING)↔ 世界 (x, y)"""

    def __init__(self, cx, cy, ang):
        self.cx, self.cy = cx, cy
        nx, ny = math.sin(math.radians(NW_BEARING)), math.cos(math.radians(NW_BEARING))
        ax, ay = math.cos(ang), math.sin(ang)
        if ax * nx + ay * ny < 0:
            ax, ay = -ax, -ay
        self.ax, self.ay = ax, ay
        fx, fy = math.sin(math.radians(FRONT_BEARING)), math.cos(math.radians(FRONT_BEARING))
        # +v 預設是 u 的左側;若左側不是正面就反向
        self.vs = 1 if -ay * fx + ax * fy > 0 else -1

    def p(self, u, v, z):
        v *= self.vs
        return (self.cx + u * self.ax - v * self.ay, self.cy + u * self.ay + v * self.ax, z)


def mesh_uv(name, fr, verts, faces, material):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bv = [bm.verts.new(fr.p(*q)) for q in verts]
    for f in faces:
        bm.faces.new([bv[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def box_uv(name, fr, u0, u1, v0, v1, z0, z1, material):
    vs = [(u, v, z) for z in (z0, z1) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_uv(name, fr, vs, fs, material)


def prism_v(name, fr, prof, v0, v1, material):
    """立面輪廓 prof = [(u, z), ...](逆時針)沿 v 從 v0 擠出到 v1"""
    n = len(prof)
    vs = [(u, v0, z) for u, z in prof] + [(u, v1, z) for u, z in prof]
    fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        fs.append((i, j, n + j, n + i))
    return mesh_uv(name, fr, vs, fs, material)


def sag_curve(uc, half, z_low, sag, segs=16):
    """弧形下緣：中央最低(z_low),兩端高 sag;回傳由左到右的 (u, z)"""
    return [(uc - half + 2 * half * i / segs, z_low + sag * (2 * i / segs - 1) ** 2) for i in range(segs + 1)]


def build(footprint_path):
    rings, total_h = load_footprint(footprint_path, 'council')
    cx, cy, ang, length, width = min_area_rect(rings[0])
    fr = Frame(cx, cy, ang)
    m = {k: mat(f'council_{k}', v, roughness=0.3 if k == 'glass' else 0.75) for k, v in C.items()}
    hl, hw = length / 2, width / 2
    parts = []

    body = box_uv('body', fr, -hl, hl, -hw, hw, 0, total_h, m['glass'])
    # 貫穿方洞：上緣平、下緣向下凹
    uc = length * HOLE_OFFSET
    z_top, z_low = total_h * HOLE_TOP, total_h * HOLE_BOTTOM
    curve = sag_curve(uc, HOLE_W / 2, z_low, HOLE_SAG)
    hole_prof = curve + [(uc + HOLE_W / 2, z_top), (uc - HOLE_W / 2, z_top)]
    boolean(body, prism_v('hole', fr, hole_prof, -hw - 2, hw + 2, m['hole']), transfer_material=True, solver='MANIFOLD')
    # 地面層架空廊(前後兩面各內凹)
    for side in (1, -1):
        v0, v1 = (hw - ARCADE_D, hw + 1) if side > 0 else (-hw - 1, -hw + ARCADE_D)
        boolean(body, box_uv('arcade', fr, -ARCADE_W / 2, ARCADE_W / 2, v0, v1, -1, ARCADE_H, m['hole']),
                transfer_material=True, solver='MANIFOLD')
    parts.append(body)

    # 弧形下緣的白邊(前後兩面，凸出 0.3 m)
    for side in (1, -1):
        band = [(u, z - TRIM) for u, z in curve] + [(u, z) for u, z in reversed(curve)]
        v0, v1 = (hw - 0.1, hw + 0.3) if side > 0 else (-hw - 0.3, -hw + 0.1)
        parts.append(prism_v('trim', fr, band, v0, v1, m['trim']))

    # 洞底空中花園：沿弧形下緣的綠色薄板 + 3 顆樹球
    green = [(u, z) for u, z in curve] + [(u, z + 0.4) for u, z in reversed(curve)]
    parts.append(prism_v('garden', fr, green, -hw + 1.0, hw - 1.0, m['green']))
    for k, (du, dv) in enumerate(((-6, -5), (0, 4), (6, -3))):
        z = z_low + HOLE_SAG * (2 * du / HOLE_W) ** 2 + 0.4
        x, y, _ = fr.p(uc + du, dv, 0)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=2.2, location=(x, y, z + 1.8))
        o = bpy.context.active_object
        o.name = f'tree{k}'
        o.data.materials.append(m['green'])
        parts.append(o)

    # 樓層線:每層一圈(方洞與架空廊處會蓋在洞口上，切掉)
    floor_h = total_h / FLOORS
    for k in range(1, FLOORS):
        z = k * floor_h
        line = box_uv('line', fr, -hl - 0.15, hl + 0.15, -hw - 0.15, hw + 0.15, z - 0.3, z, m['line'])
        if z_low - 1 < z < z_top + 1:
            boolean(line, prism_v('hole_l', fr, hole_prof, -hw - 2, hw + 2, m['line']), solver='MANIFOLD')
        parts.append(line)

    model = join(parts, 'council')
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, fr


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, fr = build(footprint_path)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, 'council.glb'), [model])
    ox, oy, _ = fr.p(0, 0, 0)
    fx, fy, _ = fr.p(0, 1, 0)
    front_az = math.degrees(math.atan2(fy - oy, fx - ox))
    render_previews(os.path.join(preview_dir, 'council'), target=(0, 0, 32), distance=220, size=(1200, 800), views={
        'front': (front_az, 5),
        'front34': (front_az + 30, 12),
        'park': (front_az + 180, 8),
        'street': (front_az - 25, 1),
        'aerial': (front_az + 150, 40),
    })
    print(f"MODEL_OK council tris={tris}")
