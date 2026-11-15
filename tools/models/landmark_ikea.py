"""
IKEA 台中店(向上路二段 168 號)— Q 版低面數地標模型(decisions/0035)。

依據:docs/art/places4-reference.md §三。**沒有任何一張外觀照片**(Commons 只有室內),以下是 OSM 外框 + Esri 航照 + 新聞 + 推估,
Cooper 可以補現場照再修:
  - 143(南北)× 88 m 的大方盒,地上 4 層 + 屋頂花園;高度 not_stated,推估 26 m;
  - 外牆 IKEA 藍(航照屋頂邊緣是藍色;品牌慣例,推估);東南角一塊黃色(航照看到黃色邊框,低信心);
  - 1 樓是停車場(官網),做成內縮的深色帶;
  - 屋頂空中花園(2024 開放,航照):中央綠地 + S 形淺灰步道、東西兩側深藍太陽能板、北端機房、南端圓形廣場。
不放任何商標或字樣,店名由遊戲端的樓頂文字招牌顯示。
用法:
  Blender -b --factory-startup -P tools/models/landmark_ikea.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, min_area_rect, activate  # noqa: E402
from landmark_kit import AxisFrame, box_uv, edge_facing, ring_loft, flat_poly, segment_box, tube  # noqa: E402

LID = 'ikea'
FRONT_BEARING = 180.0  # 正面朝南(向上路二段,推估)
F1 = 4.5  # 1 樓停車層
PARAPET = 1.2

C = {
    'blue': '#0058A3',
    'yellow': '#FFDB00',
    'park': '#3A3F44',  # 1 樓停車層
    'garden': '#7FA34A',
    'path': '#C9C6BE',
    'solar': '#2B3550',
    'plant': '#9A9A96',
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = rings[0]
    m = {k: mat(f'ikea_{k}', v, roughness=0.8) for k, v in C.items()}
    parts = []
    top = H - PARAPET
    parts.append(footprint_prism('ground', offset_ring(ring, -1.0), 0, F1, m['park']))
    parts.append(footprint_prism('box', ring, F1, top, m['blue']))
    inn = offset_ring(ring, -0.8)
    parts.append(ring_loft('parapet', [(ring, top), (ring, H), (inn, H), (inn, top)], m['blue'], ring, vertical='out'))
    parts.append(ring_loft('parapet_in', [(inn, H), (inn, top)], m['blue'], ring, vertical='in'))

    # 屋頂:沿長軸的座標(u 沿長邊、v 橫向)
    cx, cy, ang, L, W = min_area_rect(ring)
    ax = AxisFrame(cx, cy, math.cos(ang), math.sin(ang))
    if ax.uy < 0:  # 讓 +u 朝北
        ax = AxisFrame(cx, cy, -ax.ux, -ax.uy)
    z = top + 0.05
    gl, gw = L * 0.33, W * 0.31  # 中央花園(航照約 55 × 95 m)
    parts.append(box_uv('garden', ax, -gl, gl, -gw, gw, top, z + 0.1, m['garden']))
    # S 形步道:沿長軸的正弦曲線
    pts = [ax.p(-gl + 2 * gl * i / 16, gw * 0.55 * math.sin(i / 16 * 2 * math.pi), 0)[:2] for i in range(17)]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        parts.append(segment_box(f'walk{k}', a, b, 4.5, z, z + 0.25, m['path']))
    # 東西兩側太陽能板帶
    for sgn in (1, -1):
        parts.append(box_uv('solar', ax, -gl, gl, sgn * (gw + 2), sgn * (gw + 9), top, z + 0.6, m['solar']))
    # 北端機房、南端圓形廣場
    for v in (-12, 12):
        parts.append(box_uv('plant', ax, gl + 8, gl + 20, v - 5, v + 5, top, H, m['plant']))
    sx, sy, _ = ax.p(-gl - 2, 0)
    parts.append(tube('plaza', sx, sy, 10.0, top, z + 0.3, m['path'], verts=16))

    # 東南角黃色塊(航照的黃色邊框,推估是黃色立面)
    south = edge_facing(ring, FRONT_BEARING, min_len=30)
    east_end = 1 if south.ux > 0 else -1  # 南面朝外,往東 = +u 還是 -u
    u1 = east_end * (south.len / 2)
    u0 = u1 - east_end * 22
    parts.append(box_uv('yellow', south, min(u0, u1), max(u0, u1), -0.3, 0.6, F1, H, m['yellow']))
    east = edge_facing(ring, 90.0, min_len=30)
    s_end = 1 if east.uy < 0 else -1
    v1 = s_end * (east.len / 2)
    v0 = v1 - s_end * 16
    parts.append(box_uv('yellow', east, min(v0, v1), max(v0, v1), -0.3, 0.6, F1, H, m['yellow']))

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
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.45), distance=260, size=(1200, 800), views={
        'front': (az, 8),
        'front34': (az + 40, 18),
        'back': (az + 180, 12),
        'aerial': (az + 30, 55),
    })
    print(f"MODEL_OK {LID} tris={tris}")
