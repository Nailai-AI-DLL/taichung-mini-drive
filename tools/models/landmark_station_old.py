"""
臺中驛(舊站紅磚站房,1917)— Q 版低面數地標模型。

依據:docs/art/landmarks-reference.md §3、§11(文化部保存計畫 PDF 的剖面量測,經獨立核對)
  - 塔尖 21 m(= 外框檔的 h)、屋脊約 14 m、簷高約 8 m、側山牆頂約 11.4 m
  - 1917 本體在西段(長約 36.8 m),鐘塔與主入口在本體正中;東段是 1949–50 增建的候車室(較低)
  - 四坡石板瓦屋頂、前後各一面中央山牆、本體兩端各一面側山牆;紅磚 + 米白飾帶
外框:data/landmarks/footprints-range-a.json 的 station-old(矩形 58 × 14.6 m)
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/landmark_station_old.py -- <輸出資料夾 public/models/landmarks> <預覽圖資料夾> <外框檔>
輸出:station-old.glb、預覽圖 station-old-<視角>.png

座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心,地面 z = 0(docs/decisions/0013)。
沿長軸的座標 u(往東北東為正)、垂直的座標 v(往北北西為正 = 正面，面對站前廣場)。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import (reset, mat, boolean, join, triangle_count, export_glb, render_previews,  # noqa: E402
                    load_footprint, min_area_rect, activate)

# ---- 參數 ----
BODY_LEN = 36.8  # 1917 本體長(OSM 外框西段;剖面量 36.5 m)
EAVE = 8.0  # 簷高(剖面量測)
RIDGE = 14.0  # 屋脊(剖面量測)
SIDE_GABLE = 11.4  # 本體兩端側山牆頂(剖面量測)
WALL_HALF = 6.2  # 兩翼牆面半進深(剖面量 12.1–12.8 m);中央山牆量體前後凸到外框(14.6 m)
PAV_HALF = 6.0  # 中央山牆量體半寬(推論)
PAV_EAVE = 9.0  # 中央量體簷高(推論:比兩翼略高;參考資料 §3.6 原本建議高 4 m,是在不知道簷高 8 m 時估的)
ANNEX_EAVE = 6.0  # 東側增建簷高(推論:照片上明顯較低;剖面沒量)
ANNEX_RIDGE = 9.5  # (推論)
OVERHANG = 0.6
TOWER_W = 3.0  # 鐘塔塔身寬(圖上約 2.6 m,精度低;稍放大)
# 以下鐘塔分段高度都是推論(PDF 只有塔尖 21 m);塔身從屋脊下方伸出
TOWER_BASE = 12.0
TOWER_CLOCK = 15.6
TOWER_CAP = 17.4  # 帽頂起點;帽頂到 19.5,其上是尖針到總高

C = {  # landmarks-reference.md §3.4(推論色);窗為推論
    'brick': '#A86A5C',
    'cream': '#EDE6D6',
    'roof': '#6B7078',
    'cap': '#565C63',
    'clock': '#F4F2EC',
    'canopy': '#8C8B82',
    'window': '#5F6670',
}


class Frame:
    def __init__(self, cx, cy, ang):
        self.cx, self.cy = cx, cy
        ax, ay = math.cos(ang), math.sin(ang)
        if ax < 0:  # u 往東
            ax, ay = -ax, -ay
        self.ax, self.ay = ax, ay

    def xy(self, u, v):
        # v = u 的左側(u 往東北東時，左側是北北西 = 正面)
        return self.cx + u * self.ax - v * self.ay, self.cy + u * self.ay + v * self.ax

    def p(self, u, v, z):
        x, y = self.xy(u, v)
        return (x, y, z)


def solid(name, fr, faces_uvz, material):
    """以 (u, v, z) 頂點表與面索引建封閉網格。faces_uvz = (頂點串列, 面串列)"""
    verts, faces = faces_uvz
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
    vs = [(u0, v0, z0), (u1, v0, z0), (u1, v1, z0), (u0, v1, z0),
          (u0, v0, z1), (u1, v0, z1), (u1, v1, z1), (u0, v1, z1)]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return solid(name, fr, (vs, fs), material)


def hip_roof(name, fr, u0, u1, v0, v1, z0, z1, material):
    """四坡頂:底面 (u0..u1, v0..v1) 在 z0,屋脊沿 u 在 z1"""
    d = (v1 - v0) / 2
    vc = (v0 + v1) / 2
    r0, r1 = (u0 + d, u1 - d) if u1 - u0 > 2 * d else ((u0 + u1) / 2, (u0 + u1) / 2 + 0.01)
    vs = [(u0, v0, z0), (u1, v0, z0), (u1, v1, z0), (u0, v1, z0), (r0, vc, z1), (r1, vc, z1)]
    fs = [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4)]
    return solid(name, fr, (vs, fs), material)


def gable_roof_v(name, fr, u0, u1, v0, v1, z0, z1, material):
    """雙坡頂，屋脊沿 v(中央山牆量體用,山牆面朝 ±v)"""
    uc = (u0 + u1) / 2
    vs = [(u0, v0, z0), (u1, v0, z0), (uc, v0, z1), (u0, v1, z0), (u1, v1, z0), (uc, v1, z1)]
    fs = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)]
    return solid(name, fr, (vs, fs), material)


def gable_slab(name, fr, u_or_v, at, half, z0, z1, thick, material):
    """三角山牆板。u_or_v='v':板在 v = at 的平面(面朝 ±v),沿 u 寬 2*half;'u':板在 u = at 的平面"""
    t = thick / 2
    if u_or_v == 'v':
        c = at
        vs = [(-half, c - t, z0), (half, c - t, z0), (0, c - t, z1), (-half, c + t, z0), (half, c + t, z0), (0, c + t, z1)]
    else:
        c = at
        vs = [(c - t, -half, z0), (c - t, half, z0), (c - t, 0, z1), (c + t, -half, z0), (c + t, half, z0), (c + t, 0, z1)]
    fs = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)]
    return vs, fs


def shift_u(geom, du):
    vs, fs = geom
    return [(u + du, v, z) for u, v, z in vs], fs


def arch_cutter(name, fr, u, v_face, normal, w, z0, h, depth, material, segs=8, out=1.0):
    """圓拱窗切割體:寬 w、直段到 z0+h-w/2 後接半圓;沿 v 法線方向從牆外 out 切入 depth(也用來做貼在牆面的拱窗板)"""
    prof = [(-w / 2, z0), (w / 2, z0)]  # 逆時針：底邊 → 右側 → 拱 → 左側
    r = w / 2
    zc = z0 + h - r
    for i in range(segs + 1):
        a = math.pi * i / segs
        prof.append((r * math.cos(a), zc + r * math.sin(a)))
    n = len(prof)
    vs = [(u + du, v_face + normal * out, z) for du, z in prof] + [(u + du, v_face - normal * depth, z) for du, z in prof]
    fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        fs.append((i, j, n + j, n + i))
    return solid(name, fr, (vs, fs), material)


def build(footprint_path):
    rings, total_h = load_footprint(footprint_path, 'station-old')
    ring = rings[0]
    cx, cy, ang, length, width = min_area_rect(ring)
    fr = Frame(cx, cy, ang)
    m = {k: mat(f'old_{k}', v, roughness=0.9 if k == 'brick' else 0.7) for k, v in C.items()}
    u_min, u_max = -length / 2, length / 2
    v_max = width / 2
    u_split = u_min + BODY_LEN
    uc = (u_min + u_split) / 2  # 本體中央(主入口與鐘塔)
    parts = []

    # ---- 1917 本體：紅磚牆 + 四坡頂 ----
    body = box_uv('body', fr, u_min, u_split, -WALL_HALF, WALL_HALF, 0, EAVE, m['brick'])
    # 中央山牆量體(前後凸到外框)
    pav = box_uv('pav', fr, uc - PAV_HALF, uc + PAV_HALF, -v_max, v_max, 0, PAV_EAVE, m['brick'])
    # 1 樓圓拱窗(兩翼前後各 4 個)與中央量體的大拱門 / 2 樓拱窗
    cutters = []
    wing_spans = [(u_min + 2.0, uc - PAV_HALF - 1.0), (uc + PAV_HALF + 1.0, u_split - 1.0)]
    for side in (1, -1):
        for a, b in wing_spans:
            for k in range(4):
                u = a + (b - a) * (k + 0.5) / 4
                cutters.append((body, arch_cutter('win', fr, u, side * WALL_HALF, side, 2.0, 1.0, 3.0, 0.4, m['window'])))
                cutters.append((body, arch_cutter('win2', fr, u, side * WALL_HALF, side, 1.6, 4.8, 2.2, 0.4, m['window'])))
        cutters.append((pav, arch_cutter('door', fr, uc, side * v_max, side, 4.0, 0.0, 5.0, 0.6, m['window'])))
        for du in (-3.6, 3.6):
            cutters.append((pav, arch_cutter('pwin', fr, uc + du, side * v_max, side, 1.6, 1.2, 3.0, 0.4, m['window'])))
    for target, c in cutters:
        boolean(target, c, transfer_material=True, solver='MANIFOLD')
    parts += [body, pav]

    # 米白飾帶：樓層線與簷下各一條(兩翼與中央量體各自一圈，凸出 0.15 m)
    for z0, z1 in ((4.0, 4.5), (EAVE - 0.6, EAVE)):
        parts.append(box_uv('band', fr, u_min - 0.15, u_split + 0.15, -WALL_HALF - 0.15, WALL_HALF + 0.15, z0, z1, m['cream']))
    for z0, z1 in ((4.0, 4.5), (PAV_EAVE - 0.6, PAV_EAVE)):
        parts.append(box_uv('pband', fr, uc - PAV_HALF - 0.15, uc + PAV_HALF + 0.15, -v_max - 0.15, v_max + 0.15, z0, z1, m['cream']))

    parts.append(hip_roof('roof', fr, u_min - OVERHANG, u_split + OVERHANG, -WALL_HALF - OVERHANG, WALL_HALF + OVERHANG,
                          EAVE, RIDGE, m['roof']))
    # 中央量體的雙坡頂與前後三角山牆(米白)
    parts.append(gable_roof_v('pav_roof', fr, uc - PAV_HALF - OVERHANG, uc + PAV_HALF + OVERHANG, -v_max - 0.3, v_max + 0.3,
                              PAV_EAVE, RIDGE, m['roof']))
    for side in (1, -1):
        # 山牆板要凸出屋頂端面(v_max + 0.3),否則兩個面重疊會閃爍
        g = shift_u(gable_slab('pediment', fr, 'v', side * (v_max + 0.45), PAV_HALF + 0.3, PAV_EAVE, RIDGE - 0.4, 0.3, m['cream']), uc)
        parts.append(solid('pediment', fr, g, m['cream']))
        # 山牆上的大拱窗(暗色板，貼在山牆面外)
        parts.append(arch_cutter('gable_win', fr, uc, side * (v_max + 0.6), side, 2.4, PAV_EAVE + 0.5, 3.4, 0.05, m['window'],
                                 out=0.06))
    # 本體兩端的側山牆(頂 11.4 m)
    for u_end in (u_min + 0.4, u_split - 0.4):
        parts.append(solid('side_gable', fr, gable_slab('sg', fr, 'u', u_end, WALL_HALF, EAVE - 0.6, SIDE_GABLE, 0.8, m['cream']),
                           m['cream']))

    # ---- 東側增建(1949–50 候車室,較低)----
    annex = box_uv('annex', fr, u_split, u_max, -WALL_HALF, WALL_HALF, 0, ANNEX_EAVE, m['brick'])
    for side in (1, -1):
        for k in range(4):
            u = u_split + 1.5 + (u_max - u_split - 3.0) * (k + 0.5) / 4
            boolean(annex, arch_cutter('awin', fr, u, side * WALL_HALF, side, 2.0, 1.0, 3.2, 0.4, m['window']),
                    transfer_material=True, solver='MANIFOLD')
    parts.append(annex)
    parts.append(box_uv('aband', fr, u_split, u_max + 0.15, -WALL_HALF - 0.15, WALL_HALF + 0.15, ANNEX_EAVE - 0.5, ANNEX_EAVE,
                        m['cream']))
    parts.append(hip_roof('aroof', fr, u_split - 2.0, u_max + OVERHANG, -WALL_HALF - OVERHANG, WALL_HALF + OVERHANG,
                          ANNEX_EAVE, ANNEX_RIDGE, m['roof']))

    # ---- 迴廊雨棚：正面兩翼前的單坡棚 + 細柱 ----
    for a, b in wing_spans:
        a, b = a - 1.0, b + 0.5
        vs = [(a, WALL_HALF, 4.2), (b, WALL_HALF, 4.2), (b, WALL_HALF + 2.6, 3.5), (a, WALL_HALF + 2.6, 3.5)]
        top = vs
        bot = [(u, v, z - 0.25) for u, v, z in vs]
        fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        parts.append(solid('canopy', fr, (top + bot, fs), m['canopy']))
        n = max(2, int((b - a) / 4))
        for k in range(n + 1):
            u = a + 0.3 + (b - a - 0.6) * k / n
            parts.append(box_uv('post', fr, u - 0.15, u + 0.15, WALL_HALF + 2.3, WALL_HALF + 2.6, 0, 3.5, m['cream']))

    # ---- 鐘塔：本體正中，方塔身 + 四面圓鐘 + 金字塔帽 + 尖針;尖端 = 總高 ----
    hw = TOWER_W / 2
    parts.append(box_uv('tower', fr, uc - hw, uc + hw, -hw, hw, TOWER_BASE, TOWER_CAP, m['cream']))
    parts.append(box_uv('tower_band', fr, uc - hw - 0.2, uc + hw + 0.2, -hw - 0.2, hw + 0.2, TOWER_CAP - 0.4, TOWER_CAP, m['brick']))
    cap_top = TOWER_CAP + 2.1
    vs = [(uc - hw - 0.3, -hw - 0.3, TOWER_CAP), (uc + hw + 0.3, -hw - 0.3, TOWER_CAP), (uc + hw + 0.3, hw + 0.3, TOWER_CAP),
          (uc - hw - 0.3, hw + 0.3, TOWER_CAP), (uc, 0, cap_top)]
    parts.append(solid('cap', fr, (vs, [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]), m['cap']))
    vs = [(uc - 0.2, -0.2, cap_top - 0.2), (uc + 0.2, -0.2, cap_top - 0.2), (uc + 0.2, 0.2, cap_top - 0.2),
          (uc - 0.2, 0.2, cap_top - 0.2), (uc, 0, total_h)]
    parts.append(solid('spire', fr, (vs, [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]), m['cap']))
    # 四面圓鐘(扁圓柱，貼在塔身外)
    for du, dv in ((0, hw), (0, -hw), (hw, 0), (-hw, 0)):
        x, y = fr.xy(uc + du * 1.04, dv * 1.04)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.0, depth=0.2, location=(x, y, TOWER_CLOCK))
        o = bpy.context.active_object
        nx, ny = fr.xy(uc + du, dv)
        ox, oy = fr.xy(uc, 0)
        o.rotation_euler = (math.pi / 2, 0, math.atan2(ny - oy, nx - ox) + math.pi / 2)
        o.data.materials.append(m['clock'])
        parts.append(o)

    model = join(parts, 'station-old')
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
    export_glb(os.path.join(out_dir, 'station-old.glb'), [model])
    ox, oy = fr.xy(0, 0)
    fx, fy = fr.xy(0, 1)
    front_az = math.degrees(math.atan2(fy - oy, fx - ox))
    render_previews(os.path.join(preview_dir, 'station-old'), target=(0, 0, 8), distance=95, size=(1200, 800), views={
        'front': (front_az, 6),
        'front34': (front_az - 35, 12),
        'street': (front_az + 30, 1),
        'back': (front_az + 180, 12),
        'aerial': (front_az - 25, 50),
    })
    print(f"MODEL_OK station-old tris={tris}")
