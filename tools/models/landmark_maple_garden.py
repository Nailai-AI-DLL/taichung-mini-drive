"""
秋紅谷廣場 Maple Garden — Q 版下沉公園地標(decisions/0035)。

依據:docs/art/places4-reference.md §二(Wikimedia Commons 照片 p1–p7 + OSM;色碼目視估計):
  - 整座公園比四周馬路低(下凹式滯洪公園),像一個綠色的碗 → 遊戲地面在外框挖洞,模型往下凹 sink 公尺;
  - 碗底細長的湖(OSM natural=water)+ 橫跨湖面的折線步橋(OSM bridge=yes;2024 現況橘紅色 + 白色格柵);
  - 東北端碗緣上的白色波浪屋頂玻璃亭(OSM 沒畫,位置與尺寸推估)。
下沉深度 not_stated,照片比例推估 5–7 m,取 footprints 的 sink(6 m)。
碗壁做兩段草坡,中間夾一圈步道平台;樹是 Q 版圓球樹(約四分之一紅葉,呼應「秋紅」;實際多為綠色闊葉樹)。
沒做:東側 S 形坡道、西南白色平台、東南木棧平台、外框外的停車場(位置與形狀 not_stated 或不在外框內)。
用法:
  Blender -b --factory-startup -P tools/models/landmark_maple_garden.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import json
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, offset_ring, ring_ccw, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv, ring_loft, flat_poly, segment_box, ball_tree, edge_facing, tube  # noqa: E402

LID = 'maple-garden'
RAIL_T = 0.25  # 碗緣欄杆厚;高度讀外框檔的 rail(= 遊戲碰撞量體高 SINK_RAIL_H)
LEDGE = (4.5, 6.5)  # 中段步道平台:離外框內縮距離(起、迄)
FLOOR_IN = 10.0  # 碗底離外框內縮距離
LEDGE_Z = 0.55  # 步道平台深度(佔 sink 的比例)
PAVILION_AT = (25.0, 120.0)  # 玻璃亭位置:公園形心往北 120 m、往東 25 m(研究報告 §二-B,推估);取離這點最近的外框邊

C = {  # §二-D(目視估計)
    'grass': '#6E9A3C',
    'slope': '#7FA845',  # 草坡(比碗底亮一點,分得出層次)
    'path': '#D8D2C4',
    'wall': '#B8B8B2',  # 擋土牆、玻璃亭基座
    'pebble': '#CFC8BA',
    'lake': '#4F5E44',
    'bridge': '#E0502A',
    'lattice': '#EDEDED',
    'roof': '#F2F2EE',
    'glass': '#7FA8A8',
    'rail': '#5A5F63',
    'tree': '#4E7A3A',
    'maple': '#B5442E',
    'trunk': '#6B5440',
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    with open(footprint_path, encoding='utf-8') as f:
        info = json.load(f)['landmarks'][LID]
    S = info['sink']
    RAIL_H = info['rail']
    ring = rings[0]
    m = {k: mat(f'maple_{k}', v, roughness=0.25 if k in ('lake', 'glass') else 0.85) for k, v in C.items()}
    parts = []

    # ---- 碗:欄杆 → 草坡 → 步道平台 → 草坡 → 碗底 ----
    r_in = offset_ring(ring, -RAIL_T)
    parts.append(ring_loft('rail', [(ring, 0), (ring, RAIL_H), (r_in, RAIL_H), (r_in, 0)], m['rail'], ring, vertical='out'))
    # 欄杆內側那面朝碗內
    parts.append(ring_loft('rail_in', [(r_in, RAIL_H), (r_in, 0)], m['rail'], ring, vertical='in'))
    zl = -S * LEDGE_Z
    r_l0, r_l1, r_f = offset_ring(ring, -LEDGE[0]), offset_ring(ring, -LEDGE[1]), offset_ring(ring, -FLOOR_IN)
    parts.append(ring_loft('slope_top', [(r_in, 0), (r_l0, zl)], m['slope'], ring))
    parts.append(ring_loft('ledge', [(r_l0, zl), (r_l1, zl)], m['path'], ring))
    parts.append(ring_loft('slope_low', [(r_l1, zl), (r_f, -S)], m['slope'], ring))
    parts.append(flat_poly('floor', r_f, -S, m['grass']))

    # ---- 湖(OSM)+ 卵石岸 ----
    for i, w in enumerate(info.get('water', [])):
        w = ring_ccw([tuple(p) for p in w])
        parts.append(flat_poly(f'pebble{i}', offset_ring(w, 1.6), -S + 0.15, m["pebble"]))
        parts.append(flat_poly(f'lake{i}', w, -S + 0.3, m["lake"]))

    # ---- 折線步橋(OSM):橘紅橋面 + 白色格柵欄杆 + 橘紅扶手 ----
    zb = -S + 0.9
    for bi, line in enumerate(info.get('bridges', [])):
        for k, (a, b) in enumerate(zip(line, line[1:])):
            parts.append(segment_box(f'deck{bi}_{k}', a, b, 1.6, zb - 0.45, zb, m['bridge']))
            fr_dx, fr_dy = b[0] - a[0], b[1] - a[1]
            l = math.hypot(fr_dx, fr_dy)
            nx, ny = -fr_dy / l * 1.45, fr_dx / l * 1.45
            for sgn in (1, -1):
                aa, bb = (a[0] + nx * sgn, a[1] + ny * sgn), (b[0] + nx * sgn, b[1] + ny * sgn)
                parts.append(segment_box(f'lat{bi}_{k}', aa, bb, 0.06, zb, zb + 0.95, m['lattice']))
                parts.append(segment_box(f'hand{bi}_{k}', aa, bb, 0.12, zb + 0.95, zb + 1.1, m['bridge']))
        for k, p in enumerate(line[1:-1]):  # 轉折處的細圓柱橋墩
            parts.append(tube(f'pier{bi}_{k}', p[0], p[1], 0.35, -S, zb - 0.45, m['wall'], verts=8))

    # ---- 東北碗緣的玻璃亭:擋土基座從碗壁升到街面,上面一層玻璃盒 + 波浪白屋頂 ----
    def edge_dist(fr):
        px, py = PAVILION_AT
        t = max(-fr.len / 2, min(fr.len / 2, (px - fr.ox) * fr.ux + (py - fr.oy) * fr.uy))
        return math.hypot(px - fr.ox - t * fr.ux, py - fr.oy - t * fr.uy)
    # (第一版用「朝東北的邊」挑,挑到的是南半部朝停車場缺口的那條邊,位置錯了)
    fr = min((EdgeFrame(ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring))), key=lambda f: edge_dist(f) if f.len >= 40 else 1e9)
    half = min(22.0, fr.len / 2 - 6)
    parts.append(box_uv('plinth', fr, -half, half, -15.0, -RAIL_T, -S, 0, m['wall']))
    parts.append(box_uv('glass', fr, -half + 1.5, half - 1.5, -13.5, -2.0, 0, 3.8, m['glass']))
    seg = 5
    for k in range(seg):  # 屋頂分 5 段高低,像起伏的波浪;最高點 = H
        u0 = -half - 1.5 + (2 * half + 3) * k / seg
        u1 = -half - 1.5 + (2 * half + 3) * (k + 1) / seg
        top = H - (0.0, 0.5, 0.15, 0.6, 0.25)[k]
        parts.append(box_uv('roof', fr, u0, u1, -16.5, -0.6, top - 0.5, top, m['roof']))

    # ---- 樹:步道平台上一圈 + 碗底湖邊幾棵 ----
    trees = []
    rl = offset_ring(ring, -(LEDGE[0] + LEDGE[1]) / 2)
    per = sum(math.hypot(rl[i][0] - rl[i - 1][0], rl[i][1] - rl[i - 1][1]) for i in range(len(rl)))
    step, acc, idx = per / 22, 0.0, 0
    for i in range(len(rl)):
        a, b = rl[i - 1], rl[i]
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        t = acc
        while t < l:
            x, y = a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l
            u, v = ((x - fr.ox) * fr.ux + (y - fr.oy) * fr.uy), ((x - fr.ox) * fr.vx + (y - fr.oy) * fr.vy)
            if not (abs(u) < half + 4 and v > -20):  # 玻璃亭前面不種
                red = idx % 4 == 1
                trees += ball_tree(f'tree{idx}', x, y, zl, 3.0 if red else 3.4, 1.6, m['maple' if red else 'tree'], m['trunk'])
                idx += 1
            t += step
        acc = t - l
    for w in info.get('water', []):
        w = ring_ccw([tuple(p) for p in w])
        for k, p in enumerate(offset_ring(w, 6.0)[::3]):
            trees += ball_tree(f'lt{k}', p[0], p[1], -S, 2.6, 1.3, m['maple' if k % 2 else 'tree'], m['trunk'])
    parts += trees

    model = join(parts, LID)
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, H, S


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, H, S = build(footprint_path)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, f'{LID}.glb'), [model])
    az = 90 - 40  # 鏡頭在東北、往西南看湖(代表視角)
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, -S), distance=300, size=(1200, 800), views={
        'front': (az, 25),
        'aerial': (az, 65),
        'back': (az + 180, 25),
    })
    print(f"MODEL_OK {LID} tris={tris}")
