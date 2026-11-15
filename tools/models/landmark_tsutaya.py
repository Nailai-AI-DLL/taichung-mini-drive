"""
T&R 廣場(TSUTAYA BOOKSTORE 台中市政店所在建築)— Q 版低面數地標模型(decisions/0036)。

依據:docs/art/places5-reference.md §二(Commons 照片 t2 + 部落格照片 + 建築師資料 + OSM way 1547615202):
  - L 形低矮量體夾在高樓之間;地上 4 層(建築師資料),高度推估 17 m;
  - 柚木色木板牆 + 黑框玻璃 + 層層退縮的綠化平台(植物垂下);
  - 書店在 2、3 樓:街角(西角,市政北二路 × 惠中五街)2 樓有深咖啡木格柵盒子;
  - 戶外大階梯從 L 內凹的廣場直接爬到 2 樓書店入口。
做法:1–2 樓整個 L(9 m);3 樓往內縮 2 m(黑框玻璃);4 樓只留西南支(沿市政北二路)的一半;
  大階梯貼著西南支(市政北二路那支)的內側面,從西北的廣場往內角爬升(方向依研究報告,位置與尺寸 not_stated;而且地標模型不能凸出外框 3 m 以上,寬度只做 2.6 m)。
只放書店店名(遊戲端文字招牌);不做吳寶春、WOO 等其他招牌,也不放任何商標。
用法:
  Blender -b --factory-startup -P tools/models/landmark_tsutaya.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv, ring_loft, segment_box  # noqa: E402

LID = 'tsutaya'
F2, F3 = 9.0, 13.2  # 2 樓頂、3 樓頂(推估)

C = {
    'wood': '#7A4A2E',  # 柚木板
    'woodlit': '#9A6440',
    'box': '#4A3426',  # 街角 2 樓深咖啡格柵盒子
    'metal': '#2B2B2B',  # 黑框、欄杆、花台
    'glass': '#6F7F80',
    'green': '#5E8A3A',
    'stair': '#6B5340',  # 深木紋階面(照片 #4A3A30,調亮一點才看得出階梯)
    'steplight': '#E8D3A0',  # 每階的燈條
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = rings[0]
    m = {k: mat(f'ts_{k}', v, roughness=0.3 if k == 'glass' else 0.8) for k, v in C.items()}
    n = len(ring)
    parts = []
    # 1–2 樓:整個 L,木板牆;2 樓整圈黑框玻璃帶
    parts.append(footprint_prism('base', ring, 0, 4.5, m['wood']))
    parts.append(footprint_prism('f2glass', offset_ring(ring, -0.2), 4.5, F2 - 0.6, m['glass']))
    parts.append(footprint_prism('f2top', ring, F2 - 0.6, F2, m['metal']))
    # 3 樓:內縮 2 m,黑框玻璃 + 木板端牆;退縮處一圈黑色花台 + 綠色垂植
    r3 = offset_ring(ring, -2.0)
    parts.append(footprint_prism('f3', r3, F2, F3, m['glass']))
    parts.append(ring_loft('planter', [(offset_ring(ring, -0.1), F2), (offset_ring(ring, -0.1), F2 + 0.7), (offset_ring(ring, -0.6), F2 + 0.7), (offset_ring(ring, -0.6), F2)], m['metal'], ring, vertical='out'))
    parts.append(ring_loft('greens', [(offset_ring(ring, 0.15), F2 - 1.4), (offset_ring(ring, 0.15), F2 + 0.4), (offset_ring(ring, -0.1), F2 + 0.4)], m['green'], ring, vertical='out'))
    parts.append(footprint_prism('f3top', r3, F3 - 0.5, F3, m['wood']))
    # 3 樓玻璃的黑色直框:每 1.5 m
    for i in range(n):
        fr = EdgeFrame(r3[i], r3[(i + 1) % n])
        k = int(fr.len / 1.5)
        for j in range(1, k):
            u = -fr.len / 2 + fr.len * j / k
            parts.append(box_uv('mullion', fr, u - 0.08, u + 0.08, -0.1, 0.1, F2, F3 - 0.5, m['metal']))
    # 4 樓:西南支(市政北二路那條長邊)靠街角的一半;木板盒 + 屋頂平台欄杆
    sw = max((EdgeFrame(ring[i], ring[(i + 1) % n]) for i in range(n)), key=lambda f: f.len * (1 if 180 < f.bearing() < 250 else 0))
    west = min(range(n), key=lambda i: ring[i][0])  # 街角 = 最西的頂點
    corner_u = (ring[west][0] - sw.ox) * sw.ux + (ring[west][1] - sw.oy) * sw.uy
    u_far = corner_u + (sw.len * 0.55 if corner_u < 0 else -sw.len * 0.55)
    u0, u1 = sorted((corner_u + (2.5 if corner_u < 0 else -2.5), u_far))
    parts.append(box_uv('f4', sw, u0, u1, -12.5, -2.5, F3, H, m['woodlit']))
    # 街角 2 樓的深咖啡木格柵盒子(外凸 0.6 m,兩個面)
    for i in (west - 1, west):
        fr = EdgeFrame(ring[i % n], ring[(i + 1) % n])
        cu = fr.len / 2 if i == west - 1 else -fr.len / 2  # 靠街角那端
        a, b = sorted((cu, cu - math.copysign(9.0, cu)))
        parts.append(box_uv('box', fr, a, b, -0.3, 0.6, 4.6, F2 - 0.7, m['box']))
    # 大階梯:研究報告 §二-D:起點在靠惠中五街(西北)的廣場,往東南爬進 L 的內凹處到 2 樓(4.5 m)。
    # 貼著西南支(市政北二路那支)的內側面:邊 = 內角 → 西支外端,階梯從外端(西北)往內角升高。
    # (第一版貼錯成東支內側、往西南西爬,方向差約 90°,驗收抓到)
    inner = None
    for i in range(n):  # 內角 = 唯一的凹頂點
        a, b, c = ring[i - 1], ring[i], ring[(i + 1) % n]
        if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < 0:
            inner = i
    fr = EdgeFrame(ring[inner], ring[(inner + 1) % n])  # u:-len/2 = 內角、+len/2 = 西支外端
    steps = 12
    run = min(fr.len - 1.0, 13.0)
    for k in range(steps):
        u_hi = -fr.len / 2 + run * (steps - k) / steps  # 第 k 階(由低到高)離內角的遠端
        u_lo = u_hi - run / steps
        zt = 4.5 * (k + 1) / steps
        parts.append(box_uv('stair', fr, u_lo, u_hi, 0.0, 2.6, 0, zt, m['stair']))
        parts.append(box_uv('steplight', fr, u_hi - 0.02, u_hi + 0.04, 0.1, 2.5, zt - 0.12, zt - 0.02, m['steplight']))
    # 外側扶手:每 3 階一根黑色細柱(連續的斜扶手第一版做成整片 4.6 m 高的黑牆,拿掉)
    for k in range(0, steps, 3):
        u = -fr.len / 2 + run * (steps - k - 0.5) / steps
        x, y, _ = fr.p(u, 2.5)
        parts.append(segment_box('post', (x - 0.05, y), (x + 0.05, y), 0.05, 4.5 * (k + 1) / steps, 4.5 * (k + 1) / steps + 1.0, m['metal']))

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
    az = 90 - 330  # 鏡頭在西北北的廣場,看大階梯
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.4), distance=60, size=(1200, 800), views={
        'plaza': (az, 18), 'corner': (90 - 255, 10), 'aerial': (az, 55)})
    print(f"MODEL_OK {LID} tris={tris}")
