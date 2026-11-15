"""
台中日月千禧酒店 Millennium Hotel Taichung — Q 版低面數地標模型(decisions/0034)。

依據:docs/art/hotels-reference.md §2(Wikimedia Commons 照片 2 張、SkyscraperPage、Wikidata、OSM;色碼與比例是目視估計):
  - 49 × 23 m 長方形塔樓、24 層;屋頂 98.95 m(SkyscraperPage,來源標營建署)+ 屋頂招牌鋼構約 3 m;平頂;
  - 主立面朝北北東(市政路);
  - 白色方格開窗立面中間切出一條藍色玻璃帶(約佔寬 30–35%),玻璃帶上緣是城市天際線剪影;
  - 藍玻璃上漂著 7 朵白色雲朵形陽台;
  - 屋頂西北西端有紅色直條鋼架(這裡只做紅色直條,不做標誌圖形);
  - 底下 3–4 層裙樓,每層外挑白色水平樓板、轉角圓弧(裙樓實際比塔樓寬、往市政路外推,但地圖外框只畫了塔樓,這裡只外推 2 m)。
背面與東南東側面沒有照片(not_stated),比照正面的白色方格做,但不放藍玻璃帶與雲朵。
外框:data/landmarks/footprints-range-a.json 的 millennium(矩形)。
用法:
  Blender -b --factory-startup -P tools/models/landmark_millennium.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import box_uv, tube, edge_facing  # noqa: E402

FRONT_BEARING = 30.0
LOGO_H = 3.0  # 屋頂招牌鋼構
FLOORS = 24
PODIUM_FLOORS = 4
BAND_W = 0.33  # 藍玻璃帶寬(正面比例)
CLOUDS = 7

C = {  # §2-D(目視估計)
    'white': '#F1F1EC',
    'window': '#3C5C7E',
    'blue': '#35618A',
    'cloud': '#FFFFFF',
    'red': '#D7262E',
    'slab': '#FAFAF7',
    'podium_glass': '#47676A',
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, 'millennium')
    ring = rings[0]
    m = {k: mat(f'millennium_{k}', v, roughness=0.3 if k in ('blue', 'window', 'podium_glass') else 0.8) for k, v in C.items()}
    roof = H - LOGO_H
    fh = roof / FLOORS
    zp = fh * PODIUM_FLOORS
    parts = []
    # 裙樓:玻璃 + 每層外挑白樓板(外框外推 2.4 m,八角化當圓角)
    # 外推量在轉角會變成 √2 倍,樓板 2.0 m → 轉角 2.8 m(對位測試容許 3 m)
    pod = offset_ring(ring, 1.7)
    parts.append(footprint_prism('podium', pod, 0, zp, m['podium_glass']))
    for k in range(1, PODIUM_FLOORS + 1):
        parts.append(footprint_prism('slab', offset_ring(ring, 2.0), k * fh - 0.5, k * fh, m['slab']))
    # 塔樓:白色
    parts.append(footprint_prism('tower', ring, zp, roof, m['white']))
    # 方格窗:每層一條深色窗帶(四面,往外 0.12 m),中間用白色直框切開 → 這裡用「窗帶 + 直框」兩層
    for k in range(PODIUM_FLOORS, FLOORS):
        z = k * fh
        parts.append(footprint_prism('win', offset_ring(ring, 0.12), z + fh * 0.3, z + fh * 0.8, m['window']))
    front = edge_facing(ring, FRONT_BEARING, min_len=30)
    back = edge_facing(ring, (FRONT_BEARING + 180) % 360, min_len=30)
    for e in (front, back):
        for u in [x * 4.0 for x in range(-6, 7)]:
            parts.append(box_uv('mullion', e, u - 0.35, u + 0.35, 0.05, 0.3, zp, roof, m['white']))
    # 正面藍玻璃帶:中央,上緣是天際線剪影(5 段不同高度)
    bw = front.len * BAND_W / 2
    tops = [0.78, 0.9, 0.84, 0.95, 0.88]
    seg = 2 * bw / len(tops)
    for i, t in enumerate(tops):
        u0 = -bw + i * seg
        parts.append(box_uv('blue', front, u0, u0 + seg, 0.2, 0.55, zp, roof * t, m['blue']))
    # 7 朵雲朵陽台:每朵 = 3 個扁圓柱並排,在藍玻璃上不同高度、左右錯開
    for k in range(CLOUDS):
        z = zp + (roof * 0.75 - zp) * (k + 0.5) / CLOUDS
        u = (-0.45 if k % 2 else 0.35) * bw + (k % 3 - 1) * 1.2
        # 雲朵要夠大才看得出來(第一版半徑 1.2–1.6 m,49 m 寬的立面上只是小點);
        # 但凸出外框不能超過 3 m(地標碰撞照外框,凸太多會變成車子穿得過去的東西;tests/unit/landmark-models.test.ts)
        for j, (du, r) in enumerate(((-2.3, 1.8), (0, 2.4), (2.3, 1.8))):
            x, y, _ = front.p(u + du, 0.4)
            parts.append(tube('cloud', x, y, r, z - 0.35 - (0.25 if j == 1 else 0), z + 0.35, m['cloud'], verts=8))
    # 屋頂西北西端的紅色直條(長短不一,共 4 條)
    wnw = math.radians(300)
    wx, wy = math.sin(wnw), math.cos(wnw)
    # 沿長邊往西北西,取外框上最遠的點往回 5 m
    far = max(ring, key=lambda p: p[0] * wx + p[1] * wy)
    fx, fy = far[0] * 0.8, far[1] * 0.8
    # 高度照來源:鋼構約 3 m(SkyscraperPage);最高那條 = LOGO_H,模型總高 = H
    for i, (h, off) in enumerate(((LOGO_H * 0.7, -3), (LOGO_H, -1), (LOGO_H * 0.85, 1), (LOGO_H * 0.6, 3))):
        e = front
        x, y = fx + e.ux * off, fy + e.uy * off
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, roof + h / 2))
        o = bpy.context.active_object
        o.scale = (0.9, 0.9, h)
        o.rotation_euler = (0, 0, math.atan2(e.uy, e.ux))
        o.data.materials.append(m['red'])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        parts.append(o)
    model = join(parts, 'millennium')
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
    export_glb(os.path.join(out_dir, 'millennium.glb'), [model])
    az = 90 - FRONT_BEARING
    render_previews(os.path.join(preview_dir, 'millennium'), target=(0, 0, H * 0.45), distance=400, size=(1200, 800), views={
        'front': (az, 6),
        'front34': (az - 35, 14),
        'street': (az + 25, 2),
        'back': (az + 180, 8),
        'aerial': (az - 30, 45),
    })
    print(f"MODEL_OK millennium tris={tris}")
