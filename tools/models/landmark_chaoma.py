"""
朝馬國民運動中心 — Q 版低面數地標模型(decisions/0036)。

依據:docs/art/places5-reference.md §三(Commons 照片 c1 + 市府 / 新聞照片 c2–c4 + OSM way 544051984 + Esri 航照):
  - 不規則六邊形,正面朝南南西(196°,潮洋溪);官方地上 3 層,高度 not_stated,推估東段 20 m、西段 10 m;
  - 亮橘色「緞帶」外框:西端懸挑的橘色方盒(端頭像開口相框)→ 沿南立面斜向往東爬升 → 東段頂部;
  - 斜帶下面是深綠玻璃 + 不規則灰色面板;東南角深灰實牆塔(推估是樓梯間);屋頂幾乎鋪滿太陽能板(航照)。
做法:整個外框擠出 10 m(西段高度);東段在上面再疊一層,屋頂高度沿東西向從 10 m 斜升到 20 m(照片的斜帶);
  西南凸出的那塊做橘色懸挑方盒。
不放商標;館名由遊戲端的樓頂文字招牌顯示。
用法:
  Blender -b --factory-startup -P tools/models/landmark_chaoma.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv, edge_facing, flat_poly, segment_box  # noqa: E402

LID = 'chaoma'
FRONT_BEARING = 196.0
LOW, HIGH = 10.0, 20.0  # 西段、東段高度(推估)
RAMP = (-22.0, 30.0)  # 斜屋頂在 x(東)方向從這裡爬升到這裡

C = {
    'orange': '#F2A33A',
    'orange2': '#D9862A',  # 陰影面 / 相框內緣
    'glass': '#2F5A50',
    'panel': '#9A9A96',
    'tower': '#4A4A4C',
    'ground': '#6F8A88',  # 1 樓玻璃
    'solar': '#3E4A5A',
    'mosaic': '#2E4FA8',  # 入口藍色馬賽克門框
    'frame_in': '#3A3D40',
}


def roof_z(x):
    t = max(0.0, min(1.0, (x - RAMP[0]) / (RAMP[1] - RAMP[0])))
    return LOW + (HIGH - LOW) * t


def clip_x(ring, x0):
    """外框裁到 x ≥ x0 那一側"""
    out = []
    for i in range(len(ring)):
        a, b = ring[i - 1], ring[i]
        ia, ib = a[0] >= x0, b[0] >= x0
        if ia != ib:
            t = (x0 - a[0]) / (b[0] - a[0])
            out.append((x0, a[1] + (b[1] - a[1]) * t))
        if ib:
            out.append(b)
    return out


def clip_half(ring, f):
    """保留 f(p) ≥ 0 的部分"""
    out = []
    for i in range(len(ring)):
        a, b = ring[i - 1], ring[i]
        fa, fb = f(a), f(b)
        if (fa >= 0) != (fb >= 0):
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        if fb >= 0:
            out.append(b)
    return out


def sloped_prism(name, ring, z0, material, top_material):
    """直立柱體,頂面高度依 roof_z(x)(頂面分成三角形)"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in ring]
    top = [bm.verts.new((x, y, roof_z(x))) for x, y in ring]
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    cap = bm.faces.new(top)
    cap.material_index = 1
    res = bmesh.ops.triangulate(bm, faces=[cap])
    for f in res['faces']:
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    o.data.materials.append(top_material)
    return o


def ribbon(front, material, below=2.4, above=0.4, out=0.8, n=24):
    """沿正面頂緣的橘色緞帶:跟著斜屋頂連續爬升(外面、上面、下面三個面)"""
    me = bpy.data.meshes.new('ribbon')
    bm = bmesh.new()
    rows = []
    for k in range(n + 1):
        u = -front.len / 2 + front.len * k / n
        x = front.p(u, 0)[0]
        zt, zb = roof_z(x) + above, roof_z(x) - below
        rows.append([bm.verts.new(front.p(u, v, z)) for v, z in ((-0.2, zt), (out, zt), (out, zb), (-0.2, zb))])
    for a, b in zip(rows, rows[1:]):
        for i in range(3):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    for r in (rows[0], rows[-1]):
        bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('ribbon', me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = rings[0]
    m = {k: mat(f'cm_{k}', v, roughness=0.3 if k in ('glass', 'ground') else 0.75) for k, v in C.items()}
    parts = []
    # 1 樓玻璃 + 上面的深綠玻璃主體(西段到 10 m)
    parts.append(footprint_prism('ground', offset_ring(ring, -0.8), 0, 4.0, m['ground']))
    parts.append(footprint_prism('body', ring, 4.0, LOW, m['glass']))
    parts.append(flat_poly('roof_low', offset_ring(ring, -1.0), LOW + 0.05, m['solar']))
    # 東段:裁出 x ≥ RAMP[0] 的部分,斜屋頂
    east = clip_x(offset_ring(ring, -0.01), RAMP[0])
    parts.append(sloped_prism('east', east, LOW - 0.01, m['glass'], m['solar']))
    # 南立面(正面)上的灰色不規則面板 + 沿屋頂斜線的橘色緞帶
    front = edge_facing(ring, FRONT_BEARING, min_len=40)
    for k, (u, z, w, h) in enumerate(((-28, 5.5, 6, 2.5), (-15, 7.5, 4, 3), (-4, 11, 7, 2.2), (9, 6, 5, 3.5), (18, 13, 6, 2.5), (27, 8, 4, 4))):
        if abs(u) + w / 2 < front.len / 2 - 1:
            x, y, _ = front.p(u, 0)
            if z + h < roof_z(x) - 1:
                parts.append(box_uv('panel', front, u - w / 2, u + w / 2, -0.1, 0.15, z, z + h, m['panel']))
    parts.append(ribbon(front, m['orange']))
    # 東南角深灰實牆塔(研究報告推估是樓梯間;最高點 = H)
    se = max(ring, key=lambda p: p[0] - p[1])
    parts.append(footprint_prism('tower', [(se[0] - 8.5, se[1] + 0.5), (se[0] - 0.5, se[1] + 0.5), (se[0] - 0.5, se[1] + 8.5), (se[0] - 8.5, se[1] + 8.5)], 0, H, m['tower']))
    # 入口藍色馬賽克門框:正面靠東南塔那一側(位置推估,中低信心)
    eu = front.len / 2 - 14 if front.p(front.len / 2, 0)[0] > front.p(-front.len / 2, 0)[0] else -front.len / 2 + 14
    parts.append(box_uv('mosaic', front, eu - 3, eu + 3, -0.2, 1.2, 0, 5.0, m['mosaic']))
    # 西南凸出的橘色方盒:外框裁出凸出那塊(南邊、x ≤ 內角)當方盒平面,離地 5 m、高 8 m(研究報告推估);
    # 照片下方是 1 樓玻璃,這裡用 1 樓玻璃體撐著,不做真正的懸挑;
    # 西端那面做深色開口相框。(第一版用矩形方盒,西北角凸出斜邊外 6.8 m,被對位測試抓到)
    inner = max((p for p in ring if p[1] < 0), key=lambda p: p[1] if p[0] < 0 else -1e9)  # 凸出的內角(西段南側最北的凹點)
    blk = clip_half(clip_half(offset_ring(ring, 0.3), lambda p: inner[1] + 1.0 - p[1]), lambda p: inner[0] + 0.5 - p[0])
    parts.append(footprint_prism('box', blk, 5.0, 13.0, m['orange']))
    west = edge_facing(blk, 288.0, min_len=8)
    parts.append(box_uv('frame_in', west, -west.len / 2 + 2.2, west.len / 2 - 2.2, -0.2, 0.25, 6.6, 11.6, m['frame_in']))

    model = join(parts, LID)
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, H


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, H = build(footprint_path)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, f'{LID}.glb'), [model])
    az = 90 - FRONT_BEARING
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.4), distance=200, size=(1200, 800), views={
        'front': (az, 8), 'front34': (az - 35, 18), 'back': (az + 180, 15), 'aerial': (az, 55)})
    print(f"MODEL_OK {LID} tris={tris}")
