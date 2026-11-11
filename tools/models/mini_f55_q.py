"""
Q 版 MINI F55(decisions/0016 §13):照 Cooper 給的三視圖(mini60/three-view-cooper.webp)建模。
輪廓數據來自 tools/models/three_view_profile.py 的 docs/art/mini-3view/profile.json(側視以車長 L 為單位,車頭 u = 0)。
Cooper 的決定(§13.1–13.2):黑車身、米白車頂與引擎蓋條紋、S 外觀(網狀水箱罩、雙出排氣)、標誌字樣全部省略、車牌留白;
照三視圖比例,車寬 1.8 m → 車長約 3.26 m、軸距約 2.0 m(物理軸距跟著改,src/vehicle/params.ts)。

執行:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \\
    -P tools/models/mini_f55_q.py -- "$PWD/public/models" "$PWD/docs/art/models" "$PWD/docs/art/mini-3view/profile.json"
輸出 mini_q_body.glb、mini_q_wheel.glb 與預覽圖 mini_q-*.png。
座標(Blender):+X 車頭、+Y 左、+Z 上;原點 = 物理車體中心(兩輪軸中點、離地 GROUND 以上),和遊戲車體座標一致。
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from common import (reset, mat, box, cylinder, torus, loft, superellipse_loop, surface_strip, side_strip,  # noqa: E402
                    surface_hit, boolean, join, mirror_y, triangle_count, export_glb, render_previews, set_material, activate)

# ---------------- 尺寸(公尺) ----------------
BODY_HALF_W = 0.9          # 車身半寬(不含後視鏡);Cooper 選 A:車寬 1.8 m
GROUND = -0.80             # 地面高度(物理:輪心 -0.47、輪半徑 0.33)
WHEEL_R = 0.34             # 視覺輪半徑(三視圖約 0.11 L;物理 0.33,只差 1 cm)
WHEEL_W = 0.26
TRACK_HALF = 0.76          # 輪距的一半(物理 trackHalf)

COLORS = {
    'body': '#1c1f25', 'roof': '#f1ead8', 'glass': '#3b5070', 'trim': '#18191c', 'chrome': '#d7dbe0',
    'lens': '#fffbe9', 'drl': '#ffffff', 'tail': '#d8302a', 'tailCross': '#f6e7d8', 'tire': '#1b1c1f',
    'rim': '#3d4047', 'spoke': '#b9bec5', 'plate': '#f5f5f2', 'mesh': '#0e0f11',
}


def args():
    a = sys.argv[sys.argv.index('--') + 1:]
    return a[0], a[1], a[2]


def median(v, k=9):
    out = []
    for i in range(len(v)):
        w = sorted(x for x in v[max(0, i - k):i + k + 1] if x is not None)
        out.append(w[len(w) // 2] if w else None)
    return out


class Profile:
    """側視輪廓(以車長為單位):top(u)、bottom(u)、belt(u)、玻璃頂 glass(u)"""

    def __init__(self, path):
        d = json.load(open(path))
        side = d['side']['profile']
        det = d['sideDetail']
        self.u = [r[0] for r in side]
        self.top = median([r[1] for r in side], 9)
        self.bot = median([r[2] for r in side], 9)
        self.du = [r[0] for r in det]
        self.belt_raw = median([r[3] for r in det], 15)
        self.wheels = [w['center'] for w in d['wheels']]
        mid = [b for u, b in zip(self.u, self.bot) if 0.4 < u < 0.62]
        self.sill = sorted(mid)[len(mid) // 2]
        roof_band = [t for u, t in zip(self.u, self.top) if 0.45 < u < 0.75]
        self.roof_top = sorted(roof_band)[len(roof_band) // 2]
        belts = [b for u, b in zip(self.du, self.belt_raw) if b is not None and 0.42 < u < 0.82]
        self.belt = sorted(belts)[len(belts) // 2]
        rb = [r[2] for r in det if r[2] is not None and 0.45 < r[0] < 0.75]
        self.glass_top = sorted(rb)[len(rb) // 2]
        # 擋風玻璃:頂面從腰線開始往上的位置、到玻璃頂的位置;後窗:車頂後端
        self.ws0 = next(u for u, t in zip(self.u, self.top) if u > 0.2 and t > self.belt + 0.025)
        self.ws1 = next(u for u, t in zip(self.u, self.top) if u > self.ws0 and t > self.glass_top)
        self.r1 = max(u for u, t in zip(self.u, self.top) if u < 0.95 and t > self.glass_top)

    def at(self, arr, u):
        i = min(range(len(self.u)), key=lambda k: abs(self.u[k] - u))
        return arr[i]


def main():
    out_dir, preview_dir, profile_path = args()
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    P = Profile(profile_path)
    # 縮放:車身寬 = 側視車長的 0.552(正視車身寬 312 px / 側視車長 565 px)
    L = 2 * BODY_HALF_W / 0.552
    wf, wr = P.wheels
    # u → X:車頭在 +X,兩輪軸中點放在原點(物理的前後輪對稱)
    xoff = (wf + wr) / 2
    X = lambda u: (xoff - u) * L
    Z = lambda h: GROUND + h * L
    wheelbase_half = (wr - wf) / 2 * L
    print('SCALE L=%.3f wheelBaseHalf=%.3f roofTop=%.3f belt=%.3f glass=%.3f ws=%.3f..%.3f r1=%.3f' % (
        L, wheelbase_half, Z(P.roof_top), Z(P.belt), Z(P.glass_top), P.ws0, P.ws1, P.r1))

    M = {k: mat(k, v, roughness=0.3) for k, v in COLORS.items()}
    M['body'] = mat('body', COLORS['body'], roughness=0.22, metallic=0.35)
    M['glass'] = mat('glass', COLORS['glass'], roughness=0.05, metallic=0.55)
    M['chrome'] = mat('chrome', COLORS['chrome'], roughness=0.12, metallic=1.0)
    M['tire'] = mat('tire', COLORS['tire'], roughness=0.85)
    M['trim'] = mat('trim', COLORS['trim'], roughness=0.6)

    # ---------------- 車身(腰線以下,含引擎蓋)----------------
    def plan(u):
        # 平面圖的前後圓角:頭尾 7% 往內收
        e = min(u, 1 - u) / 0.07
        return 1.0 if e >= 1 else 0.62 + 0.38 * math.sqrt(max(0.0, 1 - (1 - e) ** 2))

    def body_top(u):
        t = P.at(P.top, u)
        return min(t, P.belt) if P.ws0 - 0.01 < u < P.r1 + 0.03 else t

    def body_bot(u):
        b = P.at(P.bot, u)
        # 輪子那段的下緣是輪胎,車身底改用側裙高度
        return P.sill if (abs(u - wf) < 0.12 or abs(u - wr) < 0.12 or 0.3 < u < 0.75) else max(b, P.sill * 0.6)

    us = [0.004, 0.012, 0.025, 0.045, 0.07] + [0.07 + k * 0.86 / 34 for k in range(1, 35)] + [0.955, 0.975, 0.988, 0.996]
    sections = []
    for u in reversed(us):  # loft 需要 x 由小到大
        hw = BODY_HALF_W * plan(u)
        zb, zt = Z(body_bot(u)), Z(body_top(u))
        sections.append((X(u), superellipse_loop(hw, zb, zt, n=3.6, count=28, top_scale=0.93)))
    body = loft('body', sections, M['body'], levels=2)

    # ---------------- 車窗帶(深色玻璃;A/B/C 柱也是黑的)----------------
    gu0, gu1 = P.ws0 - 0.005, min(P.r1 + 0.035, 0.97)
    gs = []
    for k in range(21):
        u = gu1 - (gu1 - gu0) * k / 20
        if u < P.ws1:
            top = P.belt + (P.glass_top - P.belt) * max(0.0, (u - P.ws0) / (P.ws1 - P.ws0)) ** 0.85
        elif u > P.r1:
            top = P.glass_top - (P.glass_top - P.belt - 0.04) * (u - P.r1) / (gu1 - P.r1)
        else:
            top = P.glass_top
        top = max(top, P.belt + 0.012)
        gs.append((X(u), superellipse_loop(BODY_HALF_W * 0.93, Z(P.belt - 0.02), Z(top + 0.004), n=5, count=28, top_scale=0.74)))
    glass = loft('glass', gs, M['glass'], levels=2)

    # ---------------- 米白車頂(浮在車窗帶上;前後圓角)+ 尾翼 ----------------
    ru0, ru1 = P.ws1 - 0.025, P.r1 + 0.03
    rs = []
    for k in range(17):
        u = ru1 - (ru1 - ru0) * k / 16
        e = min(u - ru0, ru1 - u) / (ru1 - ru0) * 2
        end = math.sqrt(max(0.02, 1 - (1 - min(1, e * 2.2)) ** 2))
        rs.append((X(u), superellipse_loop(BODY_HALF_W * 0.73 * (0.8 + 0.2 * end), Z(P.glass_top - 0.012), Z(P.glass_top + (P.roof_top - P.glass_top) * (0.55 + 0.45 * end)), n=4.5, count=28)))
    loft('roof', rs, M['roof'], levels=2)
    box('spoiler', (0.12, BODY_HALF_W * 1.28, 0.045), (X(ru1) + 0.04, 0, Z(P.roof_top) - 0.03), M['roof'], bevel_w=0.02, rot=(0, math.radians(-12), 0))
    cylinder('antenna', 0.012, 0.22, (X(P.r1) + 0.15, 0, Z(P.roof_top) + 0.1), M['trim'], axis='Z', verts=8)

    # ---------------- 引擎蓋米白雙條紋 ----------------
    xs0, xs1 = X(0.02), X(P.ws0 + 0.01)
    for sgn in (-1, 1):
        surface_strip('stripe', xs1, xs0, sgn * 0.22, 0.15, body, M['roof'], offset=0.006)

    # ---------------- 黑色輪拱、側裙、上下保險桿 ----------------
    wheel_z = GROUND + WHEEL_R
    for u in (wf, wr):
        for sgn in (-1, 1):
            arch = torus('arch', WHEEL_R + 0.09, 0.075, (X(u), sgn * (BODY_HALF_W - 0.03), wheel_z), M['trim'], axis='Y', major_seg=32, minor_seg=10)
            arch.scale = (1, 1.9, 1)
            cut = box('cut', (1.2, 0.6, 0.6), (X(u), sgn * (BODY_HALF_W - 0.03), wheel_z - 0.36), M['trim'])
            boolean(arch, cut, solver='MANIFOLD')
    for sgn in (-1, 1):
        box('skirt', (X(wf) - X(wr) - 2 * (WHEEL_R + 0.12), 0.07, 0.12), ((X(wf) + X(wr)) / 2, sgn * (BODY_HALF_W - 0.02), Z(P.sill) + 0.04), M['trim'], bevel_w=0.02)
    box('front_lower', (0.22, BODY_HALF_W * 1.7, 0.16), (X(0.03), 0, Z(P.sill) + 0.03), M['trim'], bevel_w=0.04)
    box('rear_lower', (0.22, BODY_HALF_W * 1.75, 0.2), (X(0.975), 0, Z(P.sill) + 0.05), M['trim'], bevel_w=0.04)

    # ---------------- 車頭:大圓頭燈、六角網狀水箱罩、霧燈、車牌 ----------------
    def front_hit(y, z):
        loc, n = surface_hit(body, (X(0) + 2, y, z), (-1, 0, 0))
        return loc

    head_z = Z(0.2)
    for sgn in (-1, 1):
        p = front_hit(sgn * 0.52, head_z)
        cylinder('head_pod', 0.24, 0.16, (p.x - 0.02, p.y, p.z), M['body'], axis='X', verts=40, bevel_w=0.03)
        torus('head_ring', 0.225, 0.035, (p.x + 0.065, p.y, p.z), M['chrome'], axis='X', major_seg=40)
        torus('head_drl', 0.165, 0.022, (p.x + 0.07, p.y, p.z), M['drl'], axis='X', major_seg=40)
        cylinder('head_lens', 0.15, 0.02, (p.x + 0.06, p.y, p.z), M['lens'], axis='X', verts=40)
        q = front_hit(sgn * 0.62, Z(0.085))
        cylinder('fog', 0.055, 0.03, (q.x + 0.01, q.y, q.z), M['lens'], axis='X', verts=20)
    g = front_hit(0, Z(0.13))
    # 六角水箱罩:鍍鉻外框 + 黑色網狀內部(S 外觀;紅色 S 字樣省略)
    hexagon = [(0.0, -0.42, 0.075), (0.0, 0.42, 0.075), (0.0, 0.47, -0.02), (0.0, 0.38, -0.12), (0.0, -0.38, -0.12), (0.0, -0.47, -0.02)]
    def hex_plate(name, s, dx, material, depth):
        import bmesh
        mesh = bpy.data.meshes.new(name)
        bm = bmesh.new()
        front = [bm.verts.new((g.x + dx, y * s, g.z + z * s)) for _, y, z in hexagon]
        back = [bm.verts.new((g.x + dx - depth, y * s, g.z + z * s)) for _, y, z in hexagon]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((front[i], back[i], back[j], front[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(o)
        set_material(o, material)
        return o
    hex_plate('grille_frame', 1.0, 0.03, M['chrome'], 0.12)
    hex_plate('grille_mesh', 0.84, 0.045, M['mesh'], 0.12)
    box('plate', (0.02, 0.42, 0.13), (g.x + 0.07, 0, Z(0.075)), M['plate'], bevel_w=0.01)

    # ---------------- 車尾:英國旗尾燈、雙出排氣、車牌 ----------------
    def rear_hit(y, z):
        loc, n = surface_hit(body, (X(1) - 2, y, z), (1, 0, 0))
        return loc
    for sgn in (-1, 1):
        t = rear_hit(sgn * 0.62, Z(0.205))
        box('tail_frame', (0.06, 0.24, 0.32), (t.x - 0.0, t.y, t.z), M['chrome'], bevel_w=0.04)
        box('tail', (0.07, 0.2, 0.28), (t.x - 0.01, t.y, t.z), M['tail'], bevel_w=0.035)
        box('tail_v', (0.075, 0.04, 0.28), (t.x - 0.012, t.y, t.z), M['tailCross'], bevel_w=0.01)
        box('tail_h', (0.075, 0.2, 0.04), (t.x - 0.012, t.y, t.z), M['tailCross'], bevel_w=0.01)
    r = rear_hit(0, Z(0.17))
    box('plate_r', (0.02, 0.42, 0.13), (r.x - 0.01, 0, Z(0.17)), M['plate'], bevel_w=0.01)
    for sgn in (-1, 1):
        cylinder('exhaust', 0.055, 0.14, (X(0.99) - 0.05, sgn * 0.09, Z(P.sill) + 0.02), M['chrome'], axis='X', verts=20)

    # ---------------- 米白後視鏡、門把、車門分割線 ----------------
    for sgn in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=(X(P.ws0 + 0.06), sgn * (BODY_HALF_W + 0.1), Z(P.belt) + 0.13))
        m = bpy.context.active_object
        m.name = 'mirror'
        m.scale = (0.1, 0.13, 0.085)
        from common import apply_scale
        apply_scale(m)
        set_material(m, M['roof'])
        activate(m)
        bpy.ops.object.shade_smooth()
        box('mirror_arm', (0.08, 0.14, 0.04), (X(P.ws0 + 0.06), sgn * (BODY_HALF_W + 0.0), Z(P.belt) + 0.08), M['trim'])
        # 黑色 B 柱(貼在車窗帶上,窗戶才分得出一格一格)。C 柱不貼:那裡車窗帶開始收窄,投影會打空、拉出一根長刺(實測)
        for u in (0.555,):
            side_strip('pillar', X(u), Z(P.belt) - 0.01, Z(P.glass_top) - 0.01, 0.07, sgn, glass, M['trim'], offset=0.004)
        for u in (0.42, 0.66):
            side_strip('door_gap', X(u), Z(P.sill) + 0.1, Z(P.belt) - 0.02, 0.012, sgn, body, M['trim'])
        for u in (0.47, 0.71):
            side_strip('handle', X(u), Z(P.belt) - 0.09, Z(P.belt) - 0.06, 0.12, sgn, body, M['chrome'], offset=0.012)

    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    car = join(parts, 'mini_q_body')

    # ---------------- 輪子(另一個檔;遊戲裡每個輪子一份,繞 Y 轉)----------------
    tire = cylinder('tire', WHEEL_R, WHEEL_W, (0, 0, 0), M['tire'], axis='Y', verts=40, bevel_w=0.04)
    rim = cylinder('rim', WHEEL_R * 0.66, WHEEL_W + 0.012, (0, 0, 0), M['rim'], axis='Y', verts=32)
    wheel_parts = [tire, rim]
    for k in range(5):
        a = k / 5 * 2 * math.pi
        for d in (-0.035, 0.035):
            sp = box('spoke', (0.035, WHEEL_W + 0.03, WHEEL_R * 0.55), (0, 0, 0), M['spoke'], rot=(0, a + d * 3, 0))
            sp.location = (math.sin(a + d * 3) * WHEEL_R * 0.33, 0, math.cos(a + d * 3) * WHEEL_R * 0.33)
            wheel_parts.append(sp)
    wheel_parts.append(cylinder('hub', 0.06, WHEEL_W + 0.04, (0, 0, 0), M['chrome'], axis='Y', verts=16))
    wheel = join(wheel_parts, 'mini_q_wheel')

    print('TRIS body=%d wheel=%d' % (triangle_count([car]), triangle_count([wheel])))
    export_glb(os.path.join(out_dir, 'mini_q_body.glb'), [car])
    # 輪子單獨輸出:先把車身藏起來
    car.hide_set(True)
    export_glb(os.path.join(out_dir, 'mini_q_wheel.glb'), [wheel])
    car.hide_set(False)
    # 預覽:輪子放到四個位置一起拍
    for x in (wheelbase_half, -wheelbase_half):
        for y in (TRACK_HALF, -TRACK_HALF):
            activate(wheel)
            bpy.ops.object.duplicate()
            d = bpy.context.active_object
            d.location = (x, y, GROUND + WHEEL_R)
    wheel.hide_render = True
    render_previews(os.path.join(preview_dir, 'mini_q'), target=(0, 0, GROUND + 0.7), distance=6.4)
    json.dump({'L': L, 'wheelBaseHalf': wheelbase_half, 'wheelR': WHEEL_R, 'roofTopY': Z(P.roof_top)},
              open(os.path.join(preview_dir, 'mini_q-dims.json'), 'w'))
    print('MODEL_OK')


main()
