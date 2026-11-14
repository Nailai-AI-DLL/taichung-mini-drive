"""
Top City 台中大遠百 — Q 版低面數地標模型(decisions/0032)。

依據:docs/art/dept-stores-reference.md §2(Wikimedia Commons 照片 Q1–Q7 + OSM 外框;色碼與比例都是目視估計):
  - 前後兩個直角方盒相接(前棟約 66 × 60 m、後棟約 72 × 48 m),正面朝東北(臺灣大道);
  - 正面整片淡薄荷綠玻璃、密集水平細條紋(「巨型帆船」意象),幾乎沒有一般的窗;
  - 正面最上方一個內凹露台(寬約 0.55、高約 2 層、4 根白柱),偏右;中段一個略凸出的透明玻璃盒;
  - 底部中央 3 層樓高的玻璃入口大廳,左右是金色精品店面;
  - 正面與側牆交角一條從頂到底的橘色直條;側牆白灰板;後棟中灰、頂部一圈紫色帶。
高度 70 m 是樓層推估(14 層 × 5 m),實際高度 not_stated。正面的外傾 / 微弧角度 not_stated,這裡做成垂直平面。
不放任何商標或店名。
外框:data/landmarks/footprints-range-a.json 的 top-city。
用法:
  Blender -b --factory-startup -P tools/models/landmark_top_city.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import AxisFrame, box_uv, tube, edge_facing  # noqa: E402

FRONT_BEARING = 32.0
STRIPES = 11  # 正面水平條紋數
TERRACE_W, TERRACE_FLOORS = 0.55, 2  # 頂部露台:寬(正面比例)、高(層)
TERRACE_SHIFT = 0.12  # 露台往右偏(面對正面時;正面寬的比例)
BOX_W, BOX_Z = 0.5, (0.36, 0.5)  # 中段凸出玻璃盒:寬、高度範圍(總高比例)
BASE = 0.25  # 底部入口層高(總高比例)
LOBBY_W = 0.35
FLOOR = 5.0

C = {  # §2-D(目視估計)
    'side': '#D9D9D6',  # 前棟側牆白灰板
    'rear': '#A7AAAD',  # 後棟中灰
    'mint': '#A9CFC2',  # 正面淡薄荷綠玻璃
    'stripe': '#D6EAE2',  # 水平條紋(較亮)
    'recess': '#55605F',  # 露台內凹的暗面
    'white': '#F2F2EE',  # 露台白柱
    'glassbox': '#CFE6DE',  # 中段凸出玻璃盒
    'lobby': '#C8B27A',  # 入口大廳(室內暖光)
    'gold': '#D4A93A',  # 金色精品店面
    'orange': '#E07A1F',  # 轉角橘色直條
    'purple': '#7A5AA6',  # 後棟頂部紫色帶
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, 'top-city')
    ring = rings[0]
    m = {k: mat(f'topcity_{k}', v, roughness=0.3 if k in ('mint', 'glassbox', 'lobby') else 0.75) for k, v in C.items()}
    parts = []
    # 整體:照外框擠出(白灰)
    parts.append(footprint_prism('body', ring, 0, H - 0.4, m['side']))

    # 後棟:外框裡「離正面比較遠」的那一半,往外 0.3 m 包一層中灰,頂部一圈紫色帶
    fb = math.radians(FRONT_BEARING)
    ax = AxisFrame(0, 0, math.sin(fb), math.cos(fb))
    us = [ax.uv(x, y)[0] for x, y in ring]
    front = edge_facing(ring, FRONT_BEARING, min_len=40)
    u_front = ax.uv(front.ox, front.oy)[0]
    # 腰 = 正面往後約 60 m(前棟進深);後棟 = 腰以後的頂點
    waist = u_front - 62
    rear = [p for p, u in zip(ring, us) if u < waist + 6]
    if len(rear) >= 3:
        rr = offset_ring(rear, 0.3)
        parts.append(footprint_prism('rear', rr, 0, H - 2.0, m['rear']))
        parts.append(footprint_prism('purple', offset_ring(rear, 0.6), H - 8.0, H - 5.0, m['purple']))

    # 正面:以正面那條邊為基準(u 沿邊、v 往外)
    hw = front.len / 2
    zb = H * BASE
    parts.append(box_uv('mint', front, -hw, hw, -0.5, 0.6, zb, H, m['mint']))
    for k in range(1, STRIPES + 1):
        z = zb + (H - zb) * k / (STRIPES + 1)
        parts.append(box_uv('stripe', front, -hw + 0.4, hw - 0.4, 0.55, 0.8, z - 0.5, z + 0.5, m['stripe']))
    # 頂部內凹露台(暗面 + 4 根白柱);面對正面時偏右 = +u 方向
    # (逆時針環:沿邊走時建築在左手邊;站在外面面對建築的人看來,+u 是往他的右邊)
    tw = front.len * TERRACE_W / 2
    tc = front.len * TERRACE_SHIFT
    tz0, tz1 = H - 1.6 - TERRACE_FLOORS * FLOOR, H - 1.6
    parts.append(box_uv('terrace', front, tc - tw, tc + tw, 0.5, 0.95, tz0, tz1, m['recess']))
    for k in range(4):
        u = tc - tw + (2 * tw) * (k + 1) / 5
        parts.append(box_uv('column', front, u - 0.6, u + 0.6, 0.9, 1.5, tz0, tz1, m['white']))
    # 中段凸出的透明玻璃盒
    bw = front.len * BOX_W / 2
    parts.append(box_uv('glassbox', front, -bw, bw, 0.5, 2.4, H * BOX_Z[0], H * BOX_Z[1], m['glassbox']))
    # 底部:金色店面 + 中央玻璃大廳
    parts.append(box_uv('gold', front, -hw + 1.5, hw - 1.5, -0.5, 0.5, 0, zb, m['gold']))
    lw = front.len * LOBBY_W / 2
    parts.append(box_uv('lobby', front, -lw, lw, 0.4, 1.6, 0, zb - 1.0, m['lobby']))
    # 兩個轉角的橘色直條
    for s in (-1, 1):
        parts.append(box_uv('orange', front, s * hw - 0.9, s * hw + 0.9, -1.2, 0.9, 0, H, m['orange']))

    model = join(parts, 'top-city')
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
    export_glb(os.path.join(out_dir, 'top-city.glb'), [model])
    front_az = 90 - FRONT_BEARING
    render_previews(os.path.join(preview_dir, 'top-city'), target=(0, 0, H * 0.45), distance=430, size=(1200, 800), views={
        'front': (front_az, 6),
        'front34': (front_az - 35, 14),
        'street': (front_az + 25, 1.5),
        'back': (front_az + 180, 10),
        'aerial': (front_az - 30, 45),
    })
    print(f"MODEL_OK top-city tris={tris}")
