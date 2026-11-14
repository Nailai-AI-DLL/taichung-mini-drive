"""
老虎城購物中心 Tiger City — Q 版低面數地標模型(decisions/0032)。

依據:docs/art/dept-stores-reference.md §3(Wikimedia Commons 照片 R1–R5 + OSM 外框;色碼與比例都是目視估計):
  - L 形,兩臂夾出朝東 / 東北(河南路)開口的戶外廣場;整體淺灰白水平長條板,底部 1–2 層是玻璃店面;
  - 南臂是影城棟(較高、上半是實牆):面向廣場那面中段有一個 2–3 層高的深凹口,用圓柱撐著上方實牆;
    凹口上方靠廣場的轉角,兩個面各一組藍色招牌(這裡只做藍色色塊,不放字與標誌);
  - 西臂略低,屋頂有一片薄而外挑的深色屋簷;外端有一座透明玻璃樓梯塔。
沒做:廣場上爬滿藤蔓的圓形玻璃筒與下沉廣場(不在 OSM 外框內,精確位置 not_stated;而且地標的碰撞只照外框,做了會變成穿得過去的東西)。
高度 38 m 是樓層推估(7 層,上半影廳層高較大),實際高度與兩臂高度差 not_stated(西臂先取 0.85 倍)。
外框:data/landmarks/footprints-range-a.json 的 tiger-city(6 個頂點的 L 形)。
用法:
  Blender -b --factory-startup -P tools/models/landmark_tiger_city.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, offset_ring, activate  # noqa: E402
from landmark_kit import EdgeFrame, box_uv, tube  # noqa: E402

PLAZA_BEARING = 75.0  # 廣場開口大致朝東北東(預覽鏡頭用)
WEST_H = 0.85  # 西臂高度(總高比例;推估)
BASE = 0.2  # 底部玻璃店面高(總高比例)
RECESS_W, RECESS_Z = 0.6, (0.2, 0.5)  # 影城棟凹口:寬(該面比例)、高度範圍(總高比例)
EAVE_OUT, EAVE_H = 1.4, 0.6

C = {  # §3-D(目視估計)
    'wall': '#D5D6D3',  # 淺灰白長條板
    'line': '#BFC1BE',  # 水平接縫
    'shop': '#8FA8A3',  # 底層玻璃店面
    'recess': '#4B5357',  # 凹口暗面
    'column': '#ECECE8',  # 圓柱
    'eave': '#5A5D60',  # 西臂屋簷
    'sign': '#2D7FC4',  # 藍色招牌色塊
    'stair': '#9DB7AE',  # 玻璃樓梯塔
}


def split_l(ring):
    """L 形(6 點逆時針)拆成兩臂:回傳 (內角索引, 西臂, 南臂)。內角 = 唯一的凹頂點"""
    n = len(ring)
    inner = None
    for i in range(n):
        a, b, c = ring[i - 1], ring[i], ring[(i + 1) % n]
        if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < 0:
            inner = i
    # 內角往「內角前一條邊」的延長方向投影到對面的邊,把 L 切成兩個四邊形 / 五邊形
    p = ring[inner]
    prev, nxt = ring[inner - 1], ring[(inner + 1) % n]
    d = (p[0] - prev[0], p[1] - prev[1])
    best = None
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if i in (inner, (inner - 1) % n):
            continue
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = d[0] * ey - d[1] * ex
        if abs(den) < 1e-6:
            continue
        t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den
        s = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den
        if t > 1e-3 and 0 <= s <= 1 and (best is None or t < best[0]):
            best = (t, i, (p[0] + d[0] * t, p[1] + d[1] * t))
    _, ei, q = best
    # 從內角出發沿環走到切點所在的邊 → 一臂;其餘 → 另一臂
    arm_a = [p]
    i = (inner + 1) % n
    while True:
        arm_a.append(ring[i])
        if i == ei:
            break
        i = (i + 1) % n
    arm_a.append(q)
    arm_b = [q]
    i = (ei + 1) % n
    while i != inner:
        arm_b.append(ring[i])
        i = (i + 1) % n
    arm_b.append(p)
    return inner, arm_a, arm_b


def build(footprint_path):
    rings, H = load_footprint(footprint_path, 'tiger-city')
    ring = rings[0]
    m = {k: mat(f'tiger_{k}', v, roughness=0.3 if k in ('shop', 'stair') else 0.8) for k, v in C.items()}
    inner, arm_a, arm_b = split_l(ring)
    n = len(ring)
    # 南臂(影城棟)= 重心比較偏南的那一臂
    cy = lambda r: sum(p[1] for p in r) / len(r)  # noqa: E731
    south, west = (arm_a, arm_b) if cy(arm_a) < cy(arm_b) else (arm_b, arm_a)
    hw = H * WEST_H
    parts = []
    parts.append(footprint_prism('south', south, 0, H, m['wall']))
    parts.append(footprint_prism('west', west, 0, hw - EAVE_H, m['wall']))
    # 西臂的深色外挑屋簷
    parts.append(footprint_prism('eave', offset_ring(west, EAVE_OUT), hw - EAVE_H, hw, m['eave']))
    # 水平長條板的接縫:每 6 m 一圈細線(整個外框)
    z = H * BASE + 6
    while z < hw - 3:
        parts.append(footprint_prism('line', offset_ring(ring, 0.12), z - 0.2, z, m['line']))
        z += 6

    # 面向廣場的兩個面:內角前後的兩條邊
    face_s = EdgeFrame(ring[inner - 1], ring[inner])  # 內角前一條邊
    face_w = EdgeFrame(ring[inner], ring[(inner + 1) % n])  # 內角後一條邊
    # 哪一條屬於南臂:邊的中點離南臂重心近的那條
    sc = (sum(p[0] for p in south) / len(south), sum(p[1] for p in south) / len(south))
    if math.hypot(face_w.ox - sc[0], face_w.oy - sc[1]) < math.hypot(face_s.ox - sc[0], face_s.oy - sc[1]):
        face_s, face_w = face_w, face_s
    zb = H * BASE
    for f in (face_s, face_w):
        parts.append(box_uv('shop', f, -f.len / 2 + 1, f.len / 2 - 1, -0.3, 0.35, 0, zb, m['shop']))
    # 影城棟凹口 + 圓柱
    rw = face_s.len * RECESS_W / 2
    z0, z1 = H * RECESS_Z[0], H * RECESS_Z[1]
    parts.append(box_uv('recess', face_s, -rw, rw, -0.3, 0.3, z0, z1, m['recess']))
    for k in range(4):
        u = -rw + 2 * rw * (k + 0.5) / 4
        cx, cyy, _ = face_s.p(u, 1.1)
        parts.append(tube('column', cx, cyy, 0.9, z0, z1, m['column'], verts=10))
    # 凹口上方、靠廣場外側轉角的藍色招牌色塊:廣場面一塊、端面一塊
    # 外側轉角 = face_s 離內角遠的那一端
    far = 1 if math.hypot(face_s.b[0] - ring[inner][0], face_s.b[1] - ring[inner][1]) > 1 else -1
    su = far * (face_s.len / 2 - face_s.len * 0.16)
    sw = face_s.len * 0.12
    parts.append(box_uv('sign', face_s, su - sw, su + sw, 0.2, 0.6, H * 0.66, H * 0.86, m['sign']))
    # 端面:和 face_s 共用外側轉角的那條邊
    corner = face_s.b if far > 0 else face_s.a
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if (a == corner or b == corner) and not ({a, b} == {face_s.a, face_s.b}):
            end = EdgeFrame(a, b)
            eu = (-1 if b == corner else 1) * -(end.len / 2 - end.len * 0.2)
            ew = end.len * 0.14
            parts.append(box_uv('sign', end, eu - ew, eu + ew, 0.2, 0.6, H * 0.66, H * 0.86, m['sign']))
    # 西臂外端的玻璃樓梯塔:face_w 離內角遠的那一端
    farw = 1 if math.hypot(face_w.b[0] - ring[inner][0], face_w.b[1] - ring[inner][1]) > 1 else -1
    tu = farw * (face_w.len / 2 - 4)
    parts.append(box_uv('stair', face_w, tu - 3, tu + 3, -0.3, 2.6, 0, hw * 0.8, m['stair']))

    model = join(parts, 'tiger-city')
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
    export_glb(os.path.join(out_dir, 'tiger-city.glb'), [model])
    az = 90 - PLAZA_BEARING
    render_previews(os.path.join(preview_dir, 'tiger-city'), target=(0, 0, H * 0.45), distance=330, size=(1200, 800), views={
        'front': (az, 8),
        'front34': (az + 35, 16),
        'street': (az - 20, 2),
        'back': (az + 180, 12),
        'aerial': (az + 10, 45),
    })
    print(f"MODEL_OK tiger-city tris={tris}")
