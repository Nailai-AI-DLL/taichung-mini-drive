"""
林酒店 The Lin Hotel — Q 版低面數地標模型(decisions/0034)。

依據:docs/art/hotels-reference.md §1(Wikimedia Commons 照片、SkyscraperPage、Wikidata、OSM;色碼與比例是目視估計):
  - 一棟薄板狀塔樓,高約 106 m(SkyscraperPage 屋頂 347 ft,來源標營建署;Wikidata 106 m);
  - 主立面是整片**內凹弧面**的銅棕色玻璃(弦長約 54 m、內凹約 3.3 m),朝西北西的朝富路;
  - 每層一條米白橫線(約 20 條,均勻);
  - 底下 2–4 層米白古典石材裙樓,有拱窗;
  - 平頂。
塔樓深度 not_stated:推估 20–25 m(頂樓整層面積 ÷ 弦長),這裡取 24 m;OSM 的 55 × 52 m 外框其餘部分做成裙樓。
不放「THE LIN」字樣或任何商標(遊戲端有自己的文字招牌)。
外框:data/landmarks/footprints-range-a.json 的 the-lin(四邊形,西北邊是 6 點的凹弧)。
用法:
  Blender -b --factory-startup -P tools/models/landmark_the_lin.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv  # noqa: E402

FRONT_BEARING = 302.0  # 凹弧面朝向(§0 方位總表)
TOWER_DEPTH = 24.0  # 推估
PODIUM_H = 15.0  # 裙樓(約 3 層)
LINES = 20  # 樓層橫線
ARCH_N = 6  # 裙樓正面拱窗數

C = {  # §1-D(目視估計)
    'glass': '#9C5A4A',  # 銅棕色玻璃
    'line': '#EDE4D6',  # 米白樓層線
    'stone': '#E9DFCB',  # 象牙色石材裙樓
    'arch': '#5A4A40',  # 拱窗暗面
    'roof': '#C9C2B6',
}


def arc_points(ring):
    """外框上的凹弧:連續、間距 < 15 m 的那一串頂點(含兩端)。回傳依環的順序排列的點列"""
    n = len(ring)
    short = [math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]) < 15 for i in range(n)]
    # 找最長的一段連續短邊
    best, cur, start = (0, 0), 0, 0
    for k in range(2 * n):
        i = k % n
        if short[i]:
            if cur == 0:
                start = i
            cur += 1
            if cur > best[0]:
                best = (cur, start)
        else:
            cur = 0
    cnt, s = best
    cnt = min(cnt, n - 1)
    return [ring[(s + j) % n] for j in range(cnt + 1)]


def build(footprint_path):
    rings, H = load_footprint(footprint_path, 'the-lin')
    ring = rings[0]
    m = {k: mat(f'thelin_{k}', v, roughness=0.3 if k == 'glass' else 0.8) for k, v in C.items()}
    arc = arc_points(ring)
    (ax, ay), (bx, by) = arc[0], arc[-1]
    cl = math.hypot(bx - ax, by - ay)
    # 往建築內側(朝形心)的法向量
    nx, ny = -(by - ay) / cl, (bx - ax) / cl
    if nx * (0 - ax) + ny * (0 - ay) < 0:
        nx, ny = -nx, -ny
    back = [(x + nx * TOWER_DEPTH, y + ny * TOWER_DEPTH) for x, y in arc]
    tower = arc + list(reversed(back))
    # 繞向:footprint_prism 要逆時針
    area = sum(tower[i - 1][0] * tower[i][1] - tower[i][0] * tower[i - 1][1] for i in range(len(tower))) / 2
    if area < 0:
        tower = list(reversed(tower))
    parts = []
    # 裙樓:整個外框,米白石材
    parts.append(footprint_prism('podium', ring, 0, PODIUM_H, m['stone']))
    parts.append(footprint_prism('podium_cap', offset_ring(ring, 0.5), PODIUM_H - 0.8, PODIUM_H, m['line']))
    # 塔樓:凹弧 + 往內 24 m
    parts.append(footprint_prism('tower', tower, PODIUM_H, H, m['glass']))
    parts.append(footprint_prism('roof', offset_ring(tower, -0.6), H - 0.2, H, m['roof']))
    # 樓層橫線:整圈(往外 0.15 m)
    for k in range(1, LINES + 1):
        z = PODIUM_H + (H - PODIUM_H) * k / (LINES + 1)
        parts.append(footprint_prism('line', offset_ring(tower, 0.15), z - 0.35, z + 0.35, m['line']))
    # 裙樓正面(凹弧那一側)的拱窗:每段弧上一扇,方窗 + 半圓頂用 6 邊近似
    for i in range(len(arc) - 1):
        e = EdgeFrame(arc[i], arc[i + 1])
        # 窗板凸出牆面 0.2 m(兩側都凸,不管弧在環上是哪個方向)
        w = min(3.0, e.len * 0.25)
        parts.append(box_uv('arch', e, -w, w, -0.3, 0.3, 2.0, PODIUM_H - 4.0, m['arch']))
    model = join(parts, 'the-lin')
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
    export_glb(os.path.join(out_dir, 'the-lin.glb'), [model])
    az = 90 - FRONT_BEARING
    render_previews(os.path.join(preview_dir, 'the-lin'), target=(0, 0, H * 0.45), distance=420, size=(1200, 800), views={
        'front': (az, 6),
        'front34': (az + 35, 14),
        'street': (az - 25, 2),
        'back': (az + 180, 8),
        'aerial': (az + 30, 45),
    })
    print(f"MODEL_OK the-lin tris={tris}")
