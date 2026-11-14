"""
新光三越 台中中港店 — Q 版低面數地標模型(decisions/0032)。

依據:docs/art/dept-stores-reference.md §1(Wikimedia Commons 照片 P1–P6 + OSM 外框;色碼與比例都是目視估計):
  - 一整塊長條方盒(面寬 58 m、進深 122 m),正面朝東北(臺灣大道);
  - 正面嵌一個大圓筒(銀白金屬板、每層一圈深色橫線、藍綠玻璃,最上面兩層整圈玻璃),從裙樓頂到屋頂;
  - 圓筒頂一圈外挑的金屬光環;圓筒兩側各一支紅褐色方柱(書擋),背面兩角也有紅褐方塔;
  - 約 0.8 高度一道鮮紅色水平簷線繞側牆與背面;背面紅線以上是黃色面板;
  - 正面底部約 1/5 高是深灰藍鋼構裙樓,向廣場凸出。
高度 70 m 是樓層推估(14 層 × 5 m),實際高度 not_stated。不放任何商標或店名(文字招牌由遊戲端另外立)。
外框:data/landmarks/footprints-range-a.json 的 shin-kong(矩形 + 北側前端的圓弧 + 東側前角的方柱)。
用法:
  Blender -b --factory-startup -P tools/models/landmark_shin_kong.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
座標:X = 東、Y = 北、Z = 上,原點 = 外框形心。u = 往正面(東北)、v = u 的左側(西北)。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, activate  # noqa: E402
from landmark_kit import AxisFrame, box_uv, tube, fit_circle  # noqa: E402

FRONT_BEARING = 32.0  # 正面(臺灣大道)方位;§0 方位總表
PODIUM = 0.2  # 裙樓高(總高比例)
EAVE = 0.8  # 紅色簷線高度(總高比例)
FLOOR = 5.0  # 圓筒橫線的間距(一層)
HALO_OUT, HALO_H = 2.2, 1.2  # 光環外挑、厚度
PILLAR = 9.0  # 背面角塔的邊長

C = {  # §1-D(目視估計)
    'wall': '#B9BDC0',  # 側牆中段淺灰板
    'brick': '#8A5A52',  # 紅褐面磚(方柱、角塔)
    'drum': '#D9DDDD',  # 圓筒銀白板
    'band': '#3A4046',  # 圓筒每層的深色橫線
    'glass': '#5E9A96',  # 藍綠玻璃
    'halo': '#C6CCD1',  # 光環(金屬格柵)
    'podium': '#4A5560',  # 鋼構裙樓
    'eave': '#D8262E',  # 紅色簷線
    'yellow': '#E2B33A',  # 背面頂層黃板
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, 'shin-kong')
    ring = rings[0]
    m = {k: mat(f'shinkong_{k}', v, roughness=0.35 if k in ('glass', 'drum') else 0.75) for k, v in C.items()}
    fb = math.radians(FRONT_BEARING)
    fr = AxisFrame(0, 0, math.sin(fb), math.cos(fb))
    uv = [fr.uv(x, y) for x, y in ring]
    u_back, u_front = min(u for u, _ in uv), max(u for u, _ in uv)
    v_e, v_w = min(v for _, v in uv), max(v for _, v in uv)  # 東側牆(v 最小)、西側牆(v 最大)
    # 圓弧:外框上連續、彼此很近的頂點(間距 < 9 m)且在前半段 → 擬合成圓
    arc = [ring[i] for i in range(len(ring)) if uv[i][0] > u_front - 40 and min(
        math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]),
        math.hypot(ring[i][0] - ring[(i + 1) % len(ring)][0], ring[i][1] - ring[(i + 1) % len(ring)][1])) < 6.5]
    # 排除東側前角方柱的四個點(它們在 v 最小那一側)
    arc = [p for p in arc if fr.uv(*p)[1] > v_e + 12]
    cx, cy, R = fit_circle(arc)
    cu, cv = fr.uv(cx, cy)
    # 西側牆只到圓筒為止;東側牆一路到前角方柱
    u_west_end = max(u for u, v in uv if v > v_w - 2)
    top = H - HALO_H  # 主體屋頂(光環頂 = H)
    body_top = top - 2.0
    parts = []

    # 主體:照外框擠出(淺灰),高度到屋頂
    parts.append(footprint_prism('body', ring, 0, body_top, m['wall']))

    # 圓筒:裙樓頂到屋頂;每層一圈深色橫線;最上面兩層整圈玻璃;中段八條直玻璃
    z_pod = H * PODIUM
    # 圓筒要比外框擠出的主體大一點(外框的圓弧是折線,主體的牆會蓋住比它小的圓筒;2026-11-14 遊戲裡圓筒變成灰色就是這個原因)
    parts.append(tube('drum', cx, cy, R + 0.4, z_pod, top, m['drum']))
    z = z_pod + FLOOR
    while z < top - 2 * FLOOR:
        parts.append(tube('band', cx, cy, R + 0.6, z - 0.8, z, m['band'], caps=False))
        z += FLOOR
    parts.append(tube('glass_top', cx, cy, R + 0.6, top - 2 * FLOOR, top - 0.6, m['glass'], caps=False))
    for k in range(8):
        a = fb + math.radians(-78 + k * 22.3)  # 只放在朝外的半圈
        gx, gy = cx + math.sin(a) * (R + 0.4), cy + math.cos(a) * (R + 0.4)
        g = AxisFrame(gx, gy, math.sin(a), math.cos(a))
        parts.append(box_uv('glass_strip', g, -0.3, 0.25, -1.3, 1.3, z_pod + 1.5, top - 2 * FLOOR - 0.8, m['glass']))
    # 光環:比圓筒大一圈的薄環,頂 = 總高
    parts.append(tube('halo', cx, cy, R + HALO_OUT, top, H, m['halo'], verts=32))

    # 裙樓:八角形的鋼構基座(比圓筒凸出),只做正面這一塊
    parts.append(tube('podium', cx, cy, R + 2.0, 0, z_pod, m['podium'], verts=8))

    # 紅褐方柱:東側前角(外框那四個點)、西側牆前端(書擋)、背面兩角(角塔)
    ev = [(u, v) for u, v in uv if v < v_e + 12 and u > u_front - 14]
    eu0, eu1 = min(u for u, _ in ev), max(u for u, _ in ev)
    evv = max(v for _, v in ev)
    # 方柱比外框凸出 0.3 m,不和主體的牆面重疊(重疊會閃爍)
    parts.append(box_uv('pillar_e', fr, eu0 - 0.3, eu1 + 0.3, v_e - 0.3, evv + 0.3, 0, top, m['brick']))
    parts.append(box_uv('pillar_w', fr, u_west_end - PILLAR, u_west_end + 0.3, v_w - PILLAR, v_w + 0.3, 0, top, m['brick']))
    parts.append(box_uv('tower_be', fr, u_back - 0.3, u_back + PILLAR, v_e - 0.3, v_e + PILLAR, 0, top, m['brick']))
    parts.append(box_uv('tower_bw', fr, u_back - 0.3, u_back + PILLAR, v_w - PILLAR, v_w + 0.3, 0, top, m['brick']))

    # 紅色簷線:繞東側牆、西側牆、背面(凸出 1 m)
    ze = H * EAVE
    parts.append(box_uv('eave_e', fr, u_back - 1, eu0, v_e - 1.0, v_e + 0.5, ze, ze + 1.1, m['eave']))
    parts.append(box_uv('eave_w', fr, u_back - 1, u_west_end - PILLAR, v_w - 0.5, v_w + 1.0, ze, ze + 1.1, m['eave']))
    parts.append(box_uv('eave_b', fr, u_back - 1.6, u_back + 0.5, v_e - 1.0, v_w + 1.0, ze, ze + 1.4, m['eave']))
    # 背面紅線以上的黃色面板(兩支角塔之間)
    parts.append(box_uv('yellow', fr, u_back - 0.25, u_back + 0.5, v_e + PILLAR, v_w - PILLAR, ze + 1.4, body_top - 0.5, m['yellow']))
    # 背面紅線以下的成排玻璃窗(一大片玻璃帶)
    parts.append(box_uv('back_glass', fr, u_back - 0.2, u_back + 0.5, v_e + PILLAR, v_w - PILLAR, H * 0.3, ze - 1.0, m['glass']))

    model = join(parts, 'shin-kong')
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
    export_glb(os.path.join(out_dir, 'shin-kong.glb'), [model])
    front_az = 90 - FRONT_BEARING  # 預覽鏡頭的方位角:0 = +X(東),逆時針
    render_previews(os.path.join(preview_dir, 'shin-kong'), target=(0, 0, H * 0.45), distance=380, size=(1200, 800), views={
        'front': (front_az, 6),
        'front34': (front_az + 35, 14),
        'street': (front_az - 25, 1.5),
        'back': (front_az + 180, 8),
        'aerial': (front_az + 30, 45),
    })
    print(f"MODEL_OK shin-kong tris={tris}")
