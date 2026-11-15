"""
文心森林公園 圓滿戶外劇場 頂蓋 — Q 版低面數地標模型(decisions/0035)。

依據:docs/art/places4-reference.md §四(Commons 照片 a1–a6 + 劇場官網 + OSM;色碼目視估計):
  - 白色多片曲面殼(官方意象「彩帶舞」,維基:分 5 層往上堆疊),根部在東北的後台,往西南觀眾席一層比一層高、外伸;
  - 片與片之間有細長的玻璃天窗帶;開口(舞台)朝西南;
  - 頂蓋下方是舞台與 2 層後台建物。
做法:以東北端為根,把 OSM 外框(頂蓋建物 way 1287596507)往根部縮放成 5 圈,每圈之間是一片殼;
  殼面高度從後面 ~8 m 往前(西南)升到 H,左右兩端往下垂(貝殼口);每片內緣比上一片外緣低 1 m,露出深色天窗帶。
高度:官網頂蓋 9.5–11.5 m 可能是淨高(推估);外形最高點 not_stated,照片比例推估 15–18 m,取 landmarks.json 的 16 m。
另外:頂蓋前方 OSM way 1287596508 的 9 × 9 m 小建物併進來做成 4 m 小屋(原本被一般建築推估成 4 層樓)。
沒做:扇形觀眾席(在頂蓋外框外,地標模型不能凸出外框 3 m 以上)、入口的銀色彩帶雕塑。
用法:
  Blender -b --factory-startup -P tools/models/landmark_fulfillment.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import reset, mat, join, triangle_count, export_glb, render_previews, load_footprint, footprint_prism, activate  # noqa: E402

LID = 'fulfillment'
OPEN_BEARING = 225.0  # 舞台開口朝西南
SCALES = (0.0, 0.3, 0.48, 0.65, 0.82, 1.0)  # 5 片殼的內外圈(相對根部的縮放)
BACK_Z = 0.4  # 後端殼高(佔 H 的比例)
DROOP = 0.7  # 左右兩端往下垂的比例
STEP = 1.5  # 片與片的高低差(露出天窗帶)
SHELL_T = 0.45

C = {
    'shell': '#ECEEEE',
    'under': '#C9CDD0',  # 殼底(陰影面)
    'sky': '#5F7480',  # 天窗玻璃
    'stage': '#3A3D40',
    'back': '#D9DBD8',  # 後台建物
    'booth': '#D0D2CF',  # 前方小屋
}


def build(footprint_path):
    rings, H = load_footprint(footprint_path, LID)
    ring = max(rings, key=lambda r: abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))))
    rings = [ring] + [r for r in rings if r is not ring]
    m = {k: mat(f'fa_{k}', v, roughness=0.3 if k == 'sky' else 0.6) for k, v in C.items()}
    m['sky'].use_backface_culling = False
    b = math.radians(OPEN_BEARING)
    d = (math.sin(b), math.cos(b))  # 往開口(西南)
    q = (d[1], -d[0])  # 橫向
    along = [x * d[0] + y * d[1] for x, y in ring]
    lo, hi = min(along), max(along)
    side = max(abs(x * q[0] + y * q[1]) for x, y in ring)
    # 根部:軸線上、外框最後端再往前 8%
    rt = lo + (hi - lo) * 0.08
    R = (d[0] * rt, d[1] * rt)

    def scaled(s):
        return [(R[0] + (x - R[0]) * s, R[1] + (y - R[1]) * s) for x, y in ring]

    def zf(p, lift):
        t = ((p[0] * d[0] + p[1] * d[1]) - lo) / (hi - lo)
        u = abs(p[0] * q[0] + p[1] * q[1]) / side
        base = H * (BACK_Z + (1 - BACK_Z) * max(0.0, min(1.0, t)))
        return base * (1 - DROOP * u * u) + lift

    # 先算出最高點,整體縮放讓頂點剛好 = H
    peak = max(zf(p, 0) for p in scaled(SCALES[-1]))
    k_scale = (H - 0.0) / peak

    parts = []
    n = len(ring)
    for k in range(len(SCALES) - 1):
        ri, ro = scaled(SCALES[k]), scaled(SCALES[k + 1])
        me = bpy.data.meshes.new(f'shell{k}')
        bm = bmesh.new()
        ti = [bm.verts.new((x, y, zf((x, y), -STEP) * k_scale)) for x, y in ri]
        to = [bm.verts.new((x, y, zf((x, y), 0) * k_scale)) for x, y in ro]
        bi = [bm.verts.new((x, y, zf((x, y), -STEP) * k_scale - SHELL_T)) for x, y in ri]
        bo = [bm.verts.new((x, y, zf((x, y), 0) * k_scale - SHELL_T)) for x, y in ro]
        tops, bottoms, edges = [], [], []
        for i in range(n):
            j = (i + 1) % n
            tops.append(bm.faces.new((ti[i], ti[j], to[j], to[i])))
            bottoms.append(bm.faces.new((bi[i], bo[i], bo[j], bi[j])))
            edges.append(bm.faces.new((to[i], to[j], bo[j], bo[i])))
        for f in tops:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        for f in bottoms:
            f.normal_update()
            if f.normal.z > 0:
                f.normal_flip()
        for f in edges:  # 外緣朝外
            f.normal_update()
            c = f.calc_center_median()
            if (c.x - R[0]) * f.normal.x + (c.y - R[1]) * f.normal.y < 0:
                f.normal_flip()
        for f in bottoms:
            f.material_index = 1
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f'shell{k}', me)
        bpy.context.scene.collection.objects.link(o)
        o.data.materials.append(m['shell'])
        o.data.materials.append(m['under'])
        parts.append(o)
        # 天窗帶:這片的內緣往下接到上一片外緣(深色玻璃立面,朝向根部的反方向 = 朝外)
        if k > 0:
            me2 = bpy.data.meshes.new(f'sky{k}')
            bm2 = bmesh.new()
            up = [bm2.verts.new((x, y, zf((x, y), -STEP) * k_scale)) for x, y in ri]
            dn = [bm2.verts.new((x, y, zf((x, y), -STEP) * k_scale - STEP * k_scale - 0.2)) for x, y in ri]
            for i in range(n):
                j = (i + 1) % n
                bm2.faces.new((up[i], up[j], dn[j], dn[i]))
            # 從前方、後方都可能看到:材質設成雙面(m['sky'] 關掉背面剔除)
            bm2.to_mesh(me2)
            bm2.free()
            o2 = bpy.data.objects.new(f'sky{k}', me2)
            bpy.context.scene.collection.objects.link(o2)
            o2.data.materials.append(m['sky'])
            parts.append(o2)

    # 舞台平台 + 後台建物(後台在根部那一圈內)
    parts.append(footprint_prism('stage', scaled(0.8), 0, 1.2, m['stage']))
    back = scaled(SCALES[1] * 0.9)
    back_top = min(zf(p, -STEP) * k_scale for p in back) - SHELL_T - 0.3
    parts.append(footprint_prism('backstage', back, 0, back_top, m['back']))
    # 頂蓋前方那棟 9 × 9 m 的小建物(OSM way 1287596508,用途 not_stated;推估是控制亭 / 票亭):做成 4 m 高的低矮小屋
    for r in rings[1:]:
        parts.append(footprint_prism('booth', r, 0, 4.0, m['booth']))

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
    az = 90 - OPEN_BEARING
    render_previews(os.path.join(preview_dir, LID), target=(0, 0, H * 0.5), distance=120, size=(1200, 800), views={
        'front': (az, 10),
        'front34': (az + 40, 20),
        'back': (az + 180, 20),
        'aerial': (az + 20, 55),
    })
    print(f"MODEL_OK {LID} tris={tris}")
