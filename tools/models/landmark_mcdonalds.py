"""
麥當勞 台中文心二店(文心路二段 57 號)— Q 版低面數地標模型(decisions/0035)。

依據:docs/art/places4-reference.md §一。**沒有任何一張外觀照片**(只有 1 張 2013 年從本店 2 樓往外拍的 Commons 照片 + Esri 航照),
以下多為推估,Cooper 可以補現場照再修:
  - 外框 17.3 × 13.5 m 的獨棟小店,正面朝東(文心路二段、捷運高架那側);至少 2 層(照片是從 2 樓座位區拍的),高度推估 9 m;
  - 2 樓整圈落地玻璃 + 白色細框、紅色樑側、木紋挑簷底(照片;挑簷位置推估放在 1 樓頂);屋頂深灰平頂(航照,低信心);
  - 得來速車道由 OSM 道路(遊戲的一般道路)畫,這裡不重複;取餐窗口位置 not_stated,推估在南牆,加一片紅色雨遮。
不放任何商標(金色拱門 M 等),店名由遊戲端的樓頂文字招牌顯示。
用法:
  Blender -b --factory-startup -P tools/models/landmark_mcdonalds.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import box_uv, edge_facing, ring_loft, EdgeFrame  # noqa: E402

LID = 'mcdonalds'
FRONT_BEARING = 90.0  # 正面朝東(文心路二段)
F1 = 4.2  # 1 樓高

C = {
    'body': '#3E3F42',  # 1 樓深灰外牆(推估)
    'glass': '#9DB3B8',  # 2 樓落地玻璃(照片)
    'frame': '#E8E8E4',  # 白色細框(照片)
    'red': '#D2402F',  # 紅色樑側 / 飾帶(照片)
    'wood': '#C9A27A',  # 木紋挑簷(顏色依照片;位置是推估,照片裡在 2 樓窗外上方)
    'awning': '#B8321F',  # 南牆取餐窗雨遮(推估;和紅色飾帶分開,朝向測試要單獨找得到)
    'roof': '#4A4A4A',
    'yellow': '#FFC72C',  # 女兒牆頂黃色細條(推估)
    'door': '#6E8C92',
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = rings[0]
    m = {k: mat(f'mcd_{k}', v, roughness=0.3 if k in ('glass', 'door') else 0.8) for k, v in C.items()}
    parts = []
    parts.append(footprint_prism('body', ring, 0, F1, m['body']))
    parts.append(footprint_prism('glass', offset_ring(ring, -0.15), F1, H - 1.4, m['glass']))
    parts.append(footprint_prism('beam', ring, H - 1.4, H - 0.6, m['red']))
    parts.append(footprint_prism('parapet', ring, H - 0.6, H - 0.15, m['roof']))
    # 女兒牆頂一圈黃色細條(只有外緣 0.5 m,屋頂本身深灰)
    out, inn = offset_ring(ring, 0.05), offset_ring(ring, -0.5)
    parts.append(ring_loft('cap', [(out, H - 0.15), (out, H), (inn, H), (inn, H - 0.15)], m['yellow'], ring, vertical='out'))
    # 2 樓玻璃的白色直框:每面每 3 m 一根
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        fr = EdgeFrame(a, b)
        k = max(2, int(fr.len / 3))
        for j in range(k + 1):
            u = -fr.len / 2 + fr.len * j / k
            parts.append(box_uv('mullion', fr, u - 0.12, u + 0.12, -0.2, 0.08, F1, H - 1.4, m['frame']))
    front = edge_facing(ring, FRONT_BEARING, min_len=8)
    # 正面:木紋挑簷(外挑 2 m)+ 1 樓玻璃門面
    parts.append(box_uv('soffit', front, -front.len / 2, front.len / 2, 0, 2.0, F1 - 0.4, F1, m['wood']))
    parts.append(box_uv('door', front, -front.len * 0.3, front.len * 0.3, -0.1, 0.12, 0, F1 - 0.6, m['door']))
    # 南牆(推估的取餐窗口):紅色小雨遮
    south = edge_facing(ring, 180.0, min_len=8)
    parts.append(box_uv('awning', south, -2.5, 2.5, 0, 1.4, 2.6, 3.0, m['awning']))
    parts.append(box_uv('window', south, -1.5, 1.5, -0.1, 0.1, 0.9, 2.4, m['door']))

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
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.45), distance=45, size=(1200, 800), views={
        'front': (az, 8),
        'front34': (az - 35, 16),
        'back': (az + 180, 12),
    })
    print(f"MODEL_OK {LID} tris={tris}")
