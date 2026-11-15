"""
金錢豹(臺灣大道二段)— Q 版低面數地標模型(decisions/0036)。

依據:docs/art/places5-reference.md §一。**外觀照片只有 1 張**(官網夜景橫幅,沒有圖說,無法確認是這間分店),
其餘是 OSM 外框 + Esri 航照 + 新聞;下面多為推估,Cooper 可以補現場照再修:
  - 55 × 37 m 的獨棟大方盒,長邊平行臺灣大道,正面朝西南(211°);新聞 4 層,高度推估 20 m;
  - 米色對稱立面(j1)、正面中央多層退縮的大門框 + 一排金色燈柱(j1)、頂部暖白燈帶(j1);
  - 平屋頂,中間偏西南一組深灰機電區(航照)。
不放商標;店名由遊戲端的樓頂文字招牌顯示。
用法:
  Blender -b --factory-startup -P tools/models/landmark_golden_jaguar.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv, edge_facing, ring_loft  # noqa: E402

LID = 'golden-jaguar'
FRONT_BEARING = 211.0

C = {
    'wall': '#D9C9A8',  # 米色立面(j1)
    'line': '#C7B692',  # 橫向分割線
    'frame': '#B89A6A',  # 門框
    'gold': '#E8B860',  # 金色燈柱(j1)
    'light': '#F3E6C8',  # 頂部暖白燈帶(j1)
    'bronze': '#5A4630',  # 深色窗框 / 門內
    'roof': '#DCD6C8',
    'plant': '#555555',  # 屋頂機電區(航照)
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = rings[0]
    m = {k: mat(f'gj_{k}', v, roughness=0.35 if k in ('gold', 'light') else 0.8) for k, v in C.items()}
    parts = []
    top = H - 1.2
    parts.append(footprint_prism('body', ring, 0, top, m['wall']))
    # 頂部暖白燈帶(外凸 0.15 m)
    out, inn = offset_ring(ring, 0.15), offset_ring(ring, -0.6)
    parts.append(ring_loft('lightband', [(out, top), (out, H), (inn, H), (inn, top)], m['light'], ring, vertical='out'))
    # 橫向分割:每 4.5 m 一條
    z = 4.5
    while z < top - 1:
        parts.append(footprint_prism('line', offset_ring(ring, 0.08), z - 0.25, z, m['line']))
        z += 4.5
    # 正面:中央 3 層門框(一層比一層小、往外凸,做成外凸的門廊;照片是多層退縮的門框,往內挖凹槽在低面數下看不出層次,推估改外凸)
    # + 門內深色 + 6 根金色燈柱
    f = edge_facing(ring, FRONT_BEARING, min_len=30)
    for k, (hw, zt, v) in enumerate(((9.0, 14.0, 0.4), (7.6, 12.6, 0.9), (6.2, 11.2, 1.4))):
        parts.append(box_uv(f'frame{k}', f, -hw, hw, -0.2, v, 0, zt, m['frame']))
    parts.append(box_uv('door', f, -5.0, 5.0, -0.2, 1.6, 0, 10.0, m['bronze']))
    for k in range(6):
        u = -4.2 + 8.4 * k / 5
        parts.append(box_uv('pillar', f, u - 0.35, u + 0.35, 1.6, 2.3, 0, 9.4, m['gold']))
    # 正面兩側的深色窗(對稱)
    for sgn in (1, -1):
        for zz in (5.0, 9.5):
            u0, u1 = sorted((sgn * 10.5, sgn * 22.0))
            parts.append(box_uv('win', f, u0, u1, -0.2, 0.12, zz, zz + 2.6, m['bronze']))
    # 屋頂機電區:中間偏正面(西南;航照)
    parts.append(box_uv('plant', f, -8, 8, -16, -6, top, H, m['plant']))

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
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.45), distance=120, size=(1200, 800), views={
        'front': (az, 8), 'front34': (az + 35, 16), 'back': (az + 180, 12)})
    print(f"MODEL_OK {LID} tris={tris}")
