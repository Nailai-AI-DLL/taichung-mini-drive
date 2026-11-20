"""
星巴克獨棟門市批次建模腳本(5 間分店)— Q 版低面數地標模型。
設計語彙(不放任何註冊商標圖案,店名由遊戲端樓頂文字招牌顯示):
  - 深炭灰現代基座 + 溫潤木紋垂直格柵與木質大挑簷 + 大片通透落地玻璃窗;
  - 屋簷與女兒牆外緣配置經典星巴克深綠飾帶(#00704A)與深灰平頂;
  - 正面(面對馬路方位角)加寬大木質入口挑簷、深綠入口門框與玻璃大門;
  - 支援單層挑高門市(5.5 m,如崇德昌平門市)與雙層門市(8.5 m);
  - 底座向下延伸 3 m 實心深灰裙腳,確保在 3D DTM 斜坡地形上絕不懸空。

用法:
  Blender -b --factory-startup -P tools/models/landmark_starbucks_batch.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import box_uv, edge_facing, ring_loft, EdgeFrame  # noqa: E402

# (landmark_id, 正面朝向馬路的羅盤方位角, 是否渲染預覽圖)
STORES = [
    ('starbucks-daying', 359.5, True),
    ('starbucks-zhongqing', 63.9, False),
    ('starbucks-yongchundong', 217.8, False),
    ('starbucks-xiangxin', 90.1, False),
    ('starbucks-chongde', 271.0, True),
]

SKIRT_DEPTH = 3.0

C = {
    'base': '#383A3D',   # 深炭灰混凝土基座與柱體
    'wall': '#4D4B48',   # 暖深灰外牆
    'wood': '#B8895A',   # 溫潤木紋格柵與入口挑簷
    'slat': '#A6784B',   # 側面木質格柵(獨立色供朝向驗證)
    'glass': '#8FB0B5',  # 大片落地玻璃
    'frame': '#2C2E30',  # 深色金屬窗框
    'green': '#00704A',  # 星巴克深綠飾帶與門框
    'roof': '#45484A',   # 深灰屋頂
    'door': '#63848A',   # 入口玻璃大門
}


def build_store(footprint_path, lid, front_bearing):
    rings, H = load_footprint(footprint_path, lid)
    ring = rings[0]
    m = {k: mat(f'sbx_{k}', v, roughness=0.25 if k in ('glass', 'door') else 0.8) for k, v in C.items()}
    parts = []
    two_story = H >= 7.0

    # 1. 基座與地基裙腳(地面以下 3 m 到 0.55 m 高的深炭灰踢腳板)
    parts.append(footprint_prism('skirt', ring, -SKIRT_DEPTH, 0.55, m['base']))

    inner_glass = offset_ring(ring, -0.18)
    glass_ring = inner_glass if len(inner_glass) >= 3 else ring

    if two_story:
        f1 = 4.0
        # 1 樓大片落地玻璃 + 2 樓外牆帶與通透景觀窗
        parts.append(footprint_prism('glass1', glass_ring, 0.55, f1 - 0.35, m['glass']))
        parts.append(footprint_prism('slab', ring, f1 - 0.35, f1 + 0.15, m['wood']))
        parts.append(footprint_prism('glass2', glass_ring, f1 + 0.15, H - 1.15, m['glass']))
        # 屋頂深綠飾帶 + 深灰女兒牆
        parts.append(footprint_prism('band', ring, H - 1.15, H - 0.55, m['green']))
        parts.append(footprint_prism('parapet', ring, H - 0.55, H, m['roof']))
        win_bands = [(0.55, f1 - 0.35), (f1 + 0.15, H - 1.15)]
    else:
        # 挑高單層獨棟門市(如崇德昌平門市)
        parts.append(footprint_prism('glass1', glass_ring, 0.55, H - 1.1, m['glass']))
        parts.append(footprint_prism('band', ring, H - 1.1, H - 0.5, m['green']))
        parts.append(footprint_prism('parapet', ring, H - 0.5, H, m['roof']))
        win_bands = [(0.55, H - 1.1)]

    # 屋簷外挑深綠細框
    out, inn = offset_ring(ring, 0.35), offset_ring(ring, -0.4)
    if len(out) >= 3 and len(inn) >= 3:
        parts.append(ring_loft('eave', [(out, H - 1.15), (out, H - 0.9), (inn, H - 0.9), (inn, H - 1.15)], m['wood'], ring, vertical='out'))

    # 落地窗深色金屬直框 + 轉角暖灰實牆柱
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        fr = EdgeFrame(a, b)
        if fr.len < 1.5:
            continue
        k = max(2, int(fr.len / 2.8))
        for y0, y1 in win_bands:
            for j in range(k + 1):
                u = -fr.len / 2 + fr.len * j / k
                is_corner = (j == 0 or j == k)
                w_half = 0.28 if is_corner else 0.08
                mat_use = m['wall'] if is_corner else m['frame']
                parts.append(box_uv('mullion', fr, u - w_half, u + w_half, -0.22, 0.06, y0, y1, mat_use))

    # 正面:溫潤木質大挑簷 + 綠框入口大門 + 側面垂直木格柵裝飾
    front = edge_facing(ring, front_bearing, min_len=4)
    if front:
        canopy_y = 3.6 if two_story else H - 1.35
        canopy_half = min(front.len * 0.45, 9.0)
        parts.append(box_uv('canopy', front, -canopy_half, canopy_half, 0, 2.1, canopy_y - 0.32, canopy_y, m['wood']))
        parts.append(box_uv('canopy_trim', front, -canopy_half, canopy_half, 1.95, 2.15, canopy_y - 0.34, canopy_y + 0.04, m['green']))
        door_half = min(front.len * 0.25, 3.2)
        parts.append(box_uv('door_frame', front, -door_half - 0.2, door_half + 0.2, -0.1, 0.16, 0, canopy_y - 0.32, m['green']))
        parts.append(box_uv('door', front, -door_half, door_half, -0.05, 0.18, 0, canopy_y - 0.5, m['door']))

    # 側面木質格柵牆面點綴
    side = edge_facing(ring, (front_bearing + 90.0) % 360.0, min_len=4)
    if side:
        slat_span = min(side.len * 0.35, 5.0)
        y_top = H - 1.15
        n_slats = max(3, int(slat_span * 2 / 0.55))
        for j in range(n_slats):
            u = -slat_span + (2 * slat_span) * j / max(1, n_slats - 1)
            parts.append(box_uv('slat', side, u - 0.08, u + 0.08, 0.0, 0.22, 0.55, y_top, m['slat']))

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
            render_previews(os.path.join(preview_dir, lid), target=(0, 0, H * 0.45), distance=42, size=(1200, 800), views={
                'front': (az, 8),
                'front34': (az - 35, 16),
            })
        print(f"MODEL_OK {lid} tris={tris}")
