"""
麥當勞獨棟門市批次建模腳本(10 間分店)— Q 版低面數地標模型。
沿用 landmark_mcdonalds.py(文心二店)的外觀語彙:
  - 1 樓深灰外牆 + 2 樓整圈落地玻璃與白色細直框 + 紅色樑側飾帶 + 深灰屋頂 + 女兒牆頂黃色細條;
  - 正面(依各店面對馬路的實際方位角)加木紋挑簷與 1 樓玻璃門面;
  - 側邊(順時針轉 90° 的側面)加紅色得來速取餐雨遮與窗口。
  - 底座向下延伸 3 m 實心深灰裙腳,確保在 3D DTM 斜坡地形上絕不懸空。
不放任何註冊商標圖案,店名由遊戲端的樓頂文字招牌顯示。

用法:
  Blender -b --factory-startup -P tools/models/landmark_mcdonalds_batch.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import box_uv, edge_facing, ring_loft, EdgeFrame  # noqa: E402

# (landmark_id, 正面朝向馬路的羅盤方位角, 是否渲染預覽圖)
STORES = [
    ('mcdonalds-wenxin6', 138.8, True),
    ('mcdonalds-wenxin5', 136.6, False),
    ('mcdonalds-chongde', 269.7, False),
    ('mcdonalds-chongde2', 91.3, False),
    ('mcdonalds-chongde3', 271.8, True),
    ('mcdonalds-zhongqing', 259.1, False),
    ('mcdonalds-zhongqing2', 241.5, False),
    ('mcdonalds-wuquanxi', 179.1, False),
    ('mcdonalds-fuxingbei', 263.2, False),
    ('mcdonalds-xitun', 118.9, False),
]

F1 = 4.2  # 1 樓高
SKIRT_DEPTH = 3.0  # 向下延伸地基裙腳(貼合 3D 地形斜坡)

C = {
    'body': '#3E3F42',   # 1 樓深灰外牆
    'glass': '#9DB3B8',  # 2 樓落地玻璃
    'frame': '#E8E8E4',  # 白色細框
    'red': '#D2402F',    # 紅色樑側 / 飾帶
    'wood': '#C9A27A',   # 木紋挑簷
    'awning': '#B8321F', # 取餐窗雨遮
    'roof': '#4A4A4A',
    'yellow': '#FFC72C', # 女兒牆頂黃色細條
    'door': '#6E8C92',
}


def build_store(footprint_path, lid, front_bearing):
    rings, H = load_footprint(footprint_path, lid)
    ring = rings[0]
    m = {k: mat(f'mcd_{k}', v, roughness=0.3 if k in ('glass', 'door') else 0.8) for k, v in C.items()}
    parts = []
    # 1 樓深灰主體(含向下地基裙腳)
    parts.append(footprint_prism('body', ring, -SKIRT_DEPTH, F1, m['body']))
    # 2 樓整圈落地玻璃(內縮 0.15 m)
    inner_glass = offset_ring(ring, -0.15)
    parts.append(footprint_prism('glass', inner_glass if len(inner_glass) >= 3 else ring, F1, H - 1.4, m['glass']))
    parts.append(footprint_prism('beam', ring, H - 1.4, H - 0.6, m['red']))
    parts.append(footprint_prism('parapet', ring, H - 0.6, H - 0.15, m['roof']))
    # 女兒牆頂一圈黃色細條
    out, inn = offset_ring(ring, 0.05), offset_ring(ring, -0.5)
    if len(out) >= 3 and len(inn) >= 3:
        parts.append(ring_loft('cap', [(out, H - 0.15), (out, H), (inn, H), (inn, H - 0.15)], m['yellow'], ring, vertical='out'))
    else:
        parts.append(footprint_prism('cap', ring, H - 0.15, H, m['yellow']))
    # 2 樓玻璃的白色直框:每面每 3 m 一根
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        fr = EdgeFrame(a, b)
        if fr.len < 1.5:
            continue
        k = max(2, int(fr.len / 3))
        for j in range(k + 1):
            u = -fr.len / 2 + fr.len * j / k
            parts.append(box_uv('mullion', fr, u - 0.11, u + 0.11, -0.2, 0.08, F1, H - 1.4, m['frame']))
    # 正面:木紋挑簷(外挑 1.8 m) + 1 樓玻璃門面
    front = edge_facing(ring, front_bearing, min_len=4)
    if front:
        soffit_half = min(front.len / 2, 12.0)
        parts.append(box_uv('soffit', front, -soffit_half, soffit_half, 0, 1.8, F1 - 0.4, F1, m['wood']))
        door_half = min(front.len * 0.32, 4.5)
        parts.append(box_uv('door', front, -door_half, door_half, -0.1, 0.12, 0, F1 - 0.6, m['door']))
    # 側面(順時針 90°):紅色得來速取餐雨遮與窗口
    side = edge_facing(ring, (front_bearing + 90.0) % 360.0, min_len=4)
    if side:
        aw_half = min(2.4, side.len * 0.35)
        parts.append(box_uv('awning', side, -aw_half, aw_half, 0, 1.3, 2.6, 3.0, m['awning']))
        parts.append(box_uv('window', side, -aw_half * 0.6, aw_half * 0.6, -0.1, 0.1, 0.9, 2.4, m['door']))

    model = join(parts, lid)
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, H


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    for lid, bearing, do_preview in STORES:
        reset()
        model, H = build_store(footprint_path, lid, bearing)
        tris = triangle_count([model])
        export_glb(os.path.join(out_dir, f'{lid}.glb'), [model])
        if do_preview:
            az = 90 - bearing
            render_previews(os.path.join(preview_dir, lid), target=(0, 0, H * 0.45), distance=45, size=(1200, 800), views={
                'front': (az, 8),
                'front34': (az - 35, 16),
            })
        print(f"MODEL_OK {lid} tris={tris}")
