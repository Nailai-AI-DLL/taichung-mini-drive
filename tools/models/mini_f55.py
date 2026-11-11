"""
MINI Cooper F55 五門 60 週年紀念版(黑車身、米白車頂)— Q 版低多邊形模型。

依據:docs/art/mini-f55-reference.md(Cooper 實車照片與回覆)
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/mini_f55.py -- <輸出資料夾 public/models> <預覽圖資料夾 docs/art/models>
輸出:
  mini_f55_body.glb   車身(不含輪子)
  mini_f55_wheel.glb  單一輪子(遊戲中複製 4 個,隨懸吊與轉向動)
  預覽圖 mini_f55-<視角>.png

座標:原點 = 物理車體中心(src/vehicle/params.ts),+X 車頭、+Y 左、+Z 上;地面約在 z = -0.76。
輪子位置必須與物理參數一致:前後 ±1.28、左右 ±0.76、輪心高度約 -0.40。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import (reset, mat, box, cylinder, torus, loft, superellipse_loop, surface_strip, side_strip,  # noqa: E402
                    surface_hit, orient_to, boolean, join, apply_rot, apply_scale,
                    triangle_count, export_glb, render_previews, set_material, activate)

# ---- 參數 ----
COOPER_S = False  # Cooper 實車照片為 Cooper 外觀(橫條水箱罩、無進氣口);True = Cooper S 外觀
WHEEL_BASE_HALF = 1.28
TRACK_HALF = 0.76
WHEEL_Z = -0.40
WHEEL_R = 0.36  # 實車約 0.31,Q 版放大
WHEEL_W = 0.25
HALF_W = 0.84  # 車身半寬(輪拱位置附近的實際側面)
BODY_N = 4.0  # 車身斷面的超橢圓指數:越大越方,2 是橢圓

C = {  # 方案丙配色,見 docs/art/mini-f55-reference.md §4、§5
    'body': '#2A2D33',
    'roof': '#E6DFCC',
    'stripe': '#1E2025',
    'pinline': '#B9BDC2',
    'trim': '#3A3C40',
    'chrome': '#C9CDD2',
    'glass': '#6F7F8E',  # 車窗反射天空,比車身亮,車廂才不會和車身糊成一團(對照實車照片)
    'lamp_ring': '#F4F1E8',
    'lens': '#6E7882',  # 燈罩內部偏暗,讓白色 LED 環跳出來(依實車照片)
    'fog': '#DCE3E8',
    'projector': '#9AA3AB',
    'grille': '#1A1B1F',
    'tail': '#C2554F',
    'tail_cross': '#E8B7A8',
    'plate': '#F2F1EC',
    'badge60': '#B98B6E',
    'seam': '#3A3D44',
    'tire': '#2F3034',
    'rim': '#3E4045',
    'spoke': '#8E9298',
}


def M(key, **kw):
    return mat(key, C[key], **kw)


def build_body():
    parts = []
    # 車身下半部:沿車長方向排 11 個圓潤斷面(超橢圓),串成籠子後細分 → 側面外鼓、肩線圓、
    # 前後在俯視時也是圓的;前段頂部在頭燈位置隆起(葉子板包住頭燈,MINI 的招牌)
    def fender(a):
        return lambda y: a * math.exp(-((abs(y) - 0.56) / 0.17) ** 2)

    body_sections = [
        # x,     半寬,  底,    頂,    葉子板隆起
        # 腰線壓低到 0.21(離地約 0.97 m),把高度讓給車窗:Q 版「大車廂」
        (-1.76, 0.55, -0.42, 0.08, 0.00),
        (-1.72, 0.74, -0.52, 0.17, 0.00),
        (-1.60, 0.82, -0.57, 0.21, 0.00),
        (-1.10, 0.86, -0.58, 0.21, 0.00),
        (-0.20, 0.87, -0.58, 0.21, 0.00),
        (0.55, 0.86, -0.58, 0.20, 0.00),
        (1.05, 0.85, -0.58, 0.16, 0.05),
        (1.45, 0.82, -0.57, 0.10, 0.09),
        (1.68, 0.74, -0.53, 0.02, 0.08),
        (1.80, 0.60, -0.47, -0.08, 0.03),
        (1.84, 0.42, -0.40, -0.15, 0.00),
    ]
    body = loft('body', [(x, superellipse_loop(hw, zb, zt, n=BODY_N, count=16, bump=fender(b) if b else None))
                         for x, hw, zb, zt, b in body_sections], M('body', roughness=0.4), levels=2)
    # 輪拱
    for x in (WHEEL_BASE_HALF, -WHEEL_BASE_HALF):
        cut = cylinder('arch_cut', 0.43, 2.2, (x, 0, WHEEL_Z), M('body'), axis='Y', verts=28)
        boolean(body, cut)
    set_material(body, M('body', roughness=0.4))
    parts.append(body)

    # 車窗帶:同樣用斷面串接 + 細分,越往上越窄(內傾);深色玻璃與黑色柱子連成一圈
    glass_sections = [
        (-1.66, 0.62, 0.10, 0.66),
        (-1.60, 0.72, 0.10, 0.77),
        (-1.00, 0.73, 0.10, 0.79),
        (0.00, 0.73, 0.10, 0.79),
        (0.18, 0.73, 0.10, 0.76),
        (0.40, 0.72, 0.10, 0.56),
        (0.58, 0.70, 0.10, 0.34),
        (0.68, 0.64, 0.10, 0.20),
    ]
    parts.append(loft('glass', [(x, superellipse_loop(hw, zb, zt, n=4.0, count=16, top_scale=0.88))
                                for x, hw, zb, zt in glass_sections], M('glass', roughness=0.2), levels=1))

    # 米白車頂:薄而平的頂蓋,略為外擴,後端延伸成尾翼(依實車照片)
    roof_sections = [
        (-1.74, 0.60, 0.74, 0.81),
        (-1.68, 0.71, 0.74, 0.86),
        (0.06, 0.72, 0.75, 0.87),
        (0.20, 0.69, 0.75, 0.85),
        (0.25, 0.58, 0.76, 0.82),
    ]
    parts.append(loft('roof', [(x, superellipse_loop(hw, zb, zt, n=6.0, count=12))
                               for x, hw, zb, zt in roof_sections], M('roof'), levels=2))

    # 輪拱黑色飾板(半圓環)與側裙
    for x in (WHEEL_BASE_HALF, -WHEEL_BASE_HALF):
        for side in (1, -1):
            ring = cylinder('arch_trim', 0.50, 0.12, (x, side * 0.80, WHEEL_Z), M('trim'), axis='Y', verts=28)
            hole = cylinder('arch_hole', 0.43, 0.3, (x, side * 0.80, WHEEL_Z), M('trim'), axis='Y', verts=28)
            boolean(ring, hole)
            lower = box('arch_lower', (1.2, 0.4, 0.6), (x, side * 0.80, WHEEL_Z - 0.37), M('trim'))
            boolean(ring, lower)
            set_material(ring, M('trim'))
            parts.append(ring)
    for side in (1, -1):
        parts.append(box('sill', (1.50, 0.05, 0.09), (0, side * 0.79, -0.47), M('trim'), bevel_w=0.02))

    # 頭燈:射線打到葉子板表面,沿表面法向量放置(大半埋在車身裡,只露出前面)
    for side in (1, -1):
        loc, nrm = surface_hit(body, (3.0, side * 0.57, 0.02), (-1, 0, 0))
        nrm = (nrm + __import__('mathutils').Vector((0.6, 0, 0))).normalized()  # 偏向正前方一點
        def at(d):
            return loc + nrm * d
        lens = cylinder('lamp_lens', 0.165, 0.10, (0, 0, 0), M('lens', roughness=0.2), axis='Z', verts=24)
        bezel = torus('lamp_bezel', 0.175, 0.03, (0, 0, 0), M('chrome', roughness=0.35), axis='Z', major_seg=24, minor_seg=6)
        ring = torus('lamp_ring', 0.13, 0.018, (0, 0, 0), M('lamp_ring'), axis='Z', major_seg=24, minor_seg=4)
        proj = cylinder('lamp_proj', 0.05, 0.04, (0, 0, 0), M('projector'), axis='Z', verts=16)
        for o, d in ((lens, 0.0), (bezel, 0.02), (ring, 0.05), (proj, 0.05)):
            orient_to(o, nrm)
            o.location = at(d)
        parts += [lens, bezel, ring, proj]

    # 六角形水箱罩:鍍鉻外框 + 深色內部
    frame = cylinder('grille_frame', 0.47, 0.06, (1.80, 0, -0.25), M('chrome', roughness=0.35), verts=6)
    frame.scale = (1, 1, 0.55)
    apply_scale(frame)
    inner = cylinder('grille_inner', 0.42, 0.08, (1.81, 0, -0.25), M('grille'), verts=6)
    inner.scale = (1, 1, 0.52)
    apply_scale(inner)
    parts += [frame, inner]
    if COOPER_S:
        parts.append(box('s_badge', (0.02, 0.06, 0.05), (1.85, -0.25, -0.33), mat('red_s', '#B8494A')))
        parts.append(box('hood_scoop', (0.30, 0.42, 0.06), (1.12, 0, 0.235), M('body', roughness=0.4), bevel_w=0.025,
                         rot=(0, math.radians(6.7), 0)))
    else:
        for z in (-0.18, -0.30):  # Cooper 的橫向鍍鉻飾條
            parts.append(box('grille_bar', (0.03, 0.70, 0.028), (1.845, 0, z), M('chrome', roughness=0.35), bevel_w=0.01))
    parts.append(cylinder('badge60', 0.042, 0.03, (1.86, -0.25, -0.18), M('badge60'), verts=16))  # 圓形 60 徽章

    # 前保險桿:車牌(不寫字)、下進氣口與鍍鉻飾條、霧燈
    parts.append(box('plate_f', (0.012, 0.40, 0.11), (1.875, 0, -0.44), M('plate'), bevel_w=0.004))  # 蓋在水箱罩下緣前面
    parts.append(box('intake', (0.05, 0.86, 0.07), (1.77, 0, -0.52), M('grille'), bevel_w=0.02))
    parts.append(box('intake_chrome', (0.02, 0.86, 0.016), (1.79, 0, -0.48), M('chrome', roughness=0.35)))
    for side in (1, -1):
        parts.append(cylinder('fog', 0.055, 0.04, (1.79, side * 0.60, -0.40), M('fog'), verts=16))
        parts.append(torus('fog_ring', 0.06, 0.012, (1.805, side * 0.60, -0.40), M('chrome'), major_seg=16, minor_seg=4))

    # 引擎蓋雙條紋(黑色,兩側銀色細線):投影貼在引擎蓋曲面上
    for side in (1, -1):
        yc = side * 0.30
        parts.append(surface_strip('stripe', 0.66, 1.60, yc, 0.15, body, M('stripe'), offset=0.004))
        for dy in (-0.082, 0.082):
            parts.append(surface_strip('pinline', 0.66, 1.60, yc + dy, 0.014, body, M('pinline'), offset=0.006))

    # 後視鏡:黑色支臂 + 米白外殼
    for side in (1, -1):
        parts.append(box('mirror_arm', (0.10, 0.14, 0.05), (0.60, side * 0.80, 0.23), M('trim')))
        parts.append(box('mirror_cap', (0.17, 0.20, 0.14), (0.57, side * 0.93, 0.27), M('roof'), bevel_w=0.055))

    # 腰線鍍鉻、門縫(兩條門把 → 看得出五門)
    for side in (1, -1):
        for x in (0.52, -0.24, -0.80):  # 門縫避開輪拱(前輪拱後緣約 0.85、後輪拱前緣約 -0.85)
            parts.append(side_strip('seam', x, -0.40, 0.06, 0.012, side, body, M('seam')))
        for x in (0.30, -0.48):
            hloc, _ = surface_hit(body, (x, side * 3.0, 0.03), (0, -side, 0))
            parts.append(box('handle', (0.14, 0.03, 0.03), (hloc.x, hloc.y, hloc.z), M('chrome', roughness=0.35),
                             bevel_w=0.008, segments=1))

    # 車尾:英國旗尾燈(簡化成紅底 + 淡色十字)、尾門把手、車牌、下擾流、排氣管
    for side in (1, -1):
        y = side * 0.60
        parts.append(box('tail_bezel', (0.05, 0.25, 0.35), (-1.765, y, -0.04), M('chrome', roughness=0.35), bevel_w=0.05))
        parts.append(box('tail', (0.06, 0.21, 0.31), (-1.775, y, -0.04), M('tail', roughness=0.3), bevel_w=0.05))
        parts.append(box('tail_v', (0.012, 0.03, 0.27), (-1.806, y, -0.04), M('tail_cross')))
        parts.append(box('tail_h', (0.012, 0.18, 0.03), (-1.806, y, -0.04), M('tail_cross')))
        for ang in (56, -56):  # 對角線:和十字一起讀起來像英國旗
            parts.append(box('tail_d', (0.010, 0.30, 0.016), (-1.804, y, -0.04), M('tail_cross'), rot=(math.radians(ang), 0, 0)))
    parts.append(box('gate_handle', (0.03, 0.56, 0.06), (-1.775, 0, 0.06), M('trim'), bevel_w=0.02))
    parts.append(box('plate_r', (0.012, 0.40, 0.11), (-1.79, 0, -0.10), M('plate'), bevel_w=0.004))
    parts.append(box('diffuser', (0.05, 1.20, 0.10), (-1.75, 0, -0.46), M('trim'), bevel_w=0.02))
    parts.append(cylinder('exhaust', 0.04, 0.10, (-1.78, 0.45, -0.48), M('chrome'), verts=16))  # 單出靠左(推論)

    # 面數分佈(由多到少前 8 名),方便控制預算
    by_name = {}
    for o in parts:
        key = o.name.split('.')[0]
        by_name[key] = by_name.get(key, 0) + triangle_count([o])
    print('TRIS_BY_PART', sorted(by_name.items(), key=lambda kv: -kv[1])[:8])
    body_obj = join(parts, 'mini_f55_body')
    return body_obj


def build_wheel():
    parts = []
    tire = cylinder('tire', WHEEL_R, WHEEL_W, (0, 0, 0), M('tire', roughness=0.9), axis='Y', verts=24, bevel_w=0.06, segments=2)
    rim = cylinder('rim', 0.25, WHEEL_W + 0.008, (0, 0, 0), M('rim', roughness=0.5), axis='Y', verts=24)
    parts += [tire, rim]
    # 5 組雙輻條,兩面都做(左右輪共用同一個模型)
    for face in (1, -1):
        y = face * (WHEEL_W / 2 + 0.008)
        for k in range(5):
            for off in (-6, 6):
                a = math.radians(k * 72 + off)
                r = 0.13
                parts.append(box('spoke', (0.035, 0.012, 0.21), (math.sin(a) * r, y, math.cos(a) * r), M('spoke', roughness=0.4),
                                 rot=(0, a, 0)))
        parts.append(cylinder('hub', 0.05, 0.02, (0, y, 0), M('spoke'), axis='Y', verts=16))
    return join(parts, 'mini_f55_wheel')


def main():
    out_dir, preview_dir = sys.argv[sys.argv.index('--') + 1:][:2]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    body = build_body()
    wheel = build_wheel()
    body_tris = triangle_count([body])
    wheel_tris = triangle_count([wheel])
    export_glb(os.path.join(out_dir, 'mini_f55_body.glb'), [body])
    export_glb(os.path.join(out_dir, 'mini_f55_wheel.glb'), [wheel])

    # 預覽:把輪子複製到四個位置(只為了算圖)
    activate(wheel)
    wheel.location = (WHEEL_BASE_HALF, TRACK_HALF, WHEEL_Z)
    for (x, y) in ((WHEEL_BASE_HALF, -TRACK_HALF), (-WHEEL_BASE_HALF, TRACK_HALF), (-WHEEL_BASE_HALF, -TRACK_HALF)):
        activate(wheel)
        bpy.ops.object.duplicate()
        bpy.context.active_object.location = (x, y, WHEEL_Z)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, WHEEL_Z - WHEEL_R))
    set_material(bpy.context.active_object, mat('ground', '#D9D3C3'))
    render_previews(os.path.join(preview_dir, 'mini_f55'), target=(0, 0, -0.05), distance=7.2)
    total = body_tris + wheel_tris * 4
    print(f"MODEL_OK body_tris={body_tris} wheel_tris={wheel_tris} total_with_4_wheels={total}")


main()
