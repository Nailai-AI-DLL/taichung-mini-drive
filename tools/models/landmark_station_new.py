"""
臺中車站新站(第三代高架站房)— Q 版低面數地標模型。

依據:docs/art/landmarks-reference.md §2(高度 37 m;兩片沿鐵路的銀灰弧形殼屋頂 + 西北側白色樹枝狀柱)
外框:data/landmarks/footprints-range-a.json 的 station-new。外框是沿鐵路約 35 m 寬的長條(高架段),
     中段往西北多出一塊(大廳與站前廣場側)。
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/landmark_station_new.py -- <輸出資料夾 public/models/landmarks> <預覽圖資料夾> <外框檔>
輸出:station-new.glb、預覽圖 station-new-<視角>.png

座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心,地面 z = 0(docs/decisions/0013)。
沿鐵路的座標 u(往東北東為正)、垂直鐵路的座標 v(往北北西為正，約 336°,大廳與站前廣場側)。
參考資料 §2.6 建議兩片殼，這裡做三片，理由見 docs/decisions/0013 §5。
殼的分段位置、各段高度、基座高都是【推論】(文字資料只有總高 37 m);殼一律裁切在 OSM 外框內。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from common import (reset, mat, boolean, join, triangle_count, export_glb, render_previews,  # noqa: E402
                    load_footprint, min_area_rect, offset_ring, ring_ccw, footprint_prism, cylinder, activate)

# ---- 參數(全部是推論,只有總高 37 m 有出處)----
BASE_H = 12.0  # 高架橋 + 大廳的基座高
GLASS_FROM = 6.0  # 基座上半段是玻璃
EDGE_Z = 14.0  # 殼的邊緣高度
SHELL_T = 0.8  # 殼厚
RIB_H = 0.6  # 肋條凸出殼面
RIB_W = 1.6
UPTURN = 3.0  # 殼兩端上翹量(「蝴蝶展翅」)
SIMPLIFY = 1.2  # 外框簡化容差(去掉小鋸齒,內縮時才不會自交)
BASE_INSET = 1.5  # 基座內縮，讓殼在四周略為懸挑;內縮 + 簡化容差要 < 3 m(tests/unit/landmark-models.test.ts)
COLUMN_INSET = 0.8  # 樹枝狀柱中心離外框的距離
# 殼:(名稱, u 起點, u 終點, 頂高比例, 計算 v 範圍用的 u 區間)。
# 大殼 A 蓋大廳主體(跨高架長條 + 大廳);長殼 B 沿東段高架;西段 C 比 B 再低一階。
# 大廳西北角的凸出塊(u < -38、v 大)不加殼，只留基座平頂;C 的 v 範圍只取西段長條，否則拱會跨過外框外的廣場
SHELLS = [
    ('A', -38.0, 32.0, 1.0, (-38.0, 32.0)),
    ('B', 32.0, 165.0, 0.78, (40.0, 165.0)),
    ('C', -170.0, -38.0, 0.62, (-170.0, -85.0)),
]
N_RIBS = 9

C = {  # landmarks-reference.md §2.4(推論色)
    'roof': '#C9CDD0',
    'rib': '#A9AEB2',
    'column': '#EEF0F0',
    'glass': '#9FB3BC',
    'base': '#CFCBC3',
}


def simplify(ring, tol):
    """Douglas-Peucker(封閉環):去掉 OSM 外框上的小鋸齒"""
    def rdp(pts):
        if len(pts) < 3:
            return pts
        (ax, ay), (bx, by) = pts[0], pts[-1]
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy) or 1.0
        best, idx = 0.0, 0
        for i in range(1, len(pts) - 1):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / ln
            if d > best:
                best, idx = d, i
        if best <= tol:
            return [pts[0], pts[-1]]
        return rdp(pts[:idx + 1])[:-1] + rdp(pts[idx:])
    # 從離第 0 點最遠的點切成兩段
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    a = rdp(ring[:far + 1])
    b = rdp(ring[far:] + [ring[0]])
    return ring_ccw(a[:-1] + b[:-1])


class Frame:
    """沿鐵路的局部座標 (u, v) ↔ 世界 (x, y)"""

    def __init__(self, cx, cy, ang, ring):
        self.cx, self.cy = cx, cy
        self.ax, self.ay = math.cos(ang), math.sin(ang)
        if self.ax < 0:  # 讓 u 往東
            self.ax, self.ay = -self.ax, -self.ay
        uv = [self.uv(x, y) for x, y in ring]
        # v 正向指向外框面積較多的一側(大廳)
        if sum(v for _, v in uv) < 0:
            self.flip = -1
        else:
            self.flip = 1

    def uv(self, x, y):
        dx, dy = x - self.cx, y - self.cy
        return dx * self.ax + dy * self.ay, (-dx * self.ay + dy * self.ax) * getattr(self, 'flip', 1)

    def xy(self, u, v):
        v *= self.flip
        return self.cx + u * self.ax - v * self.ay, self.cy + u * self.ay + v * self.ax


def v_range(fr, ring, u0, u1):
    """外框在 u0..u1 之間的 v 範圍(用外框邊與等 u 線的交點加上落在範圍內的頂點)"""
    vs = []
    uv = [fr.uv(x, y) for x, y in ring]
    for i in range(len(uv)):
        (ua, va), (ub, vb) = uv[i - 1], uv[i]
        if u0 <= ub <= u1:
            vs.append(vb)
        for uc in (u0, u1):
            if (ua - uc) * (ub - uc) < 0:
                vs.append(va + (vb - va) * (uc - ua) / (ub - ua))
    return min(vs), max(vs)


def shell_z(u, t, u0, u1, apex):
    """殼面高度:橫向(t: 0..1 跨 v)是壓扁的拱,縱向兩端上翹"""
    s = (2 * (u - u0) / (u1 - u0) - 1)  # -1..1
    return EDGE_Z + (apex - EDGE_Z) * math.sin(math.pi * t) ** 0.7 + UPTURN * s ** 4


def grid_solid(name, fr, u0, u1, v0, v1, z_of, thick, material, nu=24, nv=16, t_lo=0.0, t_hi=1.0):
    """參數曲面往下加厚成封閉實體;z_of(u, t) 回傳上表面高度"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    top, bot = [], []
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * i / nu
        rt, rb = [], []
        for j in range(nv + 1):
            t = t_lo + (t_hi - t_lo) * j / nv
            x, y = fr.xy(u, v0 + (v1 - v0) * t)
            z = z_of(u, t)
            rt.append(bm.verts.new((x, y, z)))
            rb.append(bm.verts.new((x, y, z - thick)))
        top.append(rt)
        bot.append(rb)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
    for i in range(nu):  # 兩側
        bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]))
        bm.faces.new((top[i + 1][nv], bot[i + 1][nv], bot[i][nv], top[i][nv]))
    for j in range(nv):  # 兩端
        bm.faces.new((top[0][j + 1], bot[0][j + 1], bot[0][j], top[0][j]))
        bm.faces.new((top[nu][j], bot[nu][j], bot[nu][j + 1], top[nu][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def clip_to(obj, ring, z0=-1.0, z1=80.0):
    """裁切在外框內(MANIFOLD 交集,原因見 docs/decisions/0013 §4)"""
    cutter = footprint_prism(obj.name + '_clip', ring, z0, z1, obj.active_material)
    return boolean(obj, cutter, op='INTERSECT', solver='MANIFOLD')


def tree_column(name, x, y, z_top, along, inward, material):
    """白色樹枝狀柱:一根柱身往上分成 3 叉(沿外框兩側各一、往內一),叉尖頂到殼底;不往外伸，才不會超出外框"""
    parts = [cylinder(name + '_trunk', 0.8, z_top * 0.55, (x, y, z_top * 0.275), material, axis='Z', verts=10)]
    z0 = z_top * 0.55
    for k, (ex, ey) in enumerate([along, (-along[0], -along[1]), inward]):
        dx, dy, dz = ex * 4.0, ey * 4.0, z_top - z0
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        b = cylinder(f'{name}_br{k}', 0.45, ln, (x + dx / 2, y + dy / 2, z0 + dz / 2), material, axis='Z', verts=8)
        b.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz))).to_euler()
        parts.append(b)
    return parts


def top_z(obj):
    return max(v.co.z for v in obj.data.vertices)


def build(footprint_path, apex_adjust=0.0):
    rings, total_h = load_footprint(footprint_path, 'station-new')
    ring = simplify(rings[0], SIMPLIFY)
    cx, cy, ang, _, _ = min_area_rect(ring)
    fr = Frame(cx, cy, ang, ring)
    m = {k: mat(f'station_{k}', v, roughness=0.35 if k == 'glass' else 0.7, metallic=0.3 if k in ('roof', 'rib') else 0.0)
         for k, v in C.items()}

    # 最高點(大殼兩端的肋條頂)= 總高
    apex_a = total_h - UPTURN - RIB_H + apex_adjust
    parts = []

    # 基座:下段混凝土、上段玻璃;往內縮,讓殼在四周懸挑出去
    parts.append(footprint_prism('base', offset_ring(ring, -BASE_INSET), 0.0, GLASS_FROM, m['base']))
    parts.append(footprint_prism('glass', offset_ring(ring, -BASE_INSET - 0.5), GLASS_FROM, BASE_H, m['glass']))

    for name, u0, u1, k, (vu0, vu1) in SHELLS:
        v0, v1 = v_range(fr, ring, vu0, vu1)
        v0, v1 = v0 - 2.0, v1 + 2.0  # 多留一點,裁切後邊緣剛好落在外框上
        apex = EDGE_Z + (apex_a - EDGE_Z) * k

        def z_of(u, t, u0=u0, u1=u1, apex=apex):
            return shell_z(u, t, u0, u1, apex)
        shell = grid_solid(f'shell{name}', fr, u0, u1, v0, v1, z_of, SHELL_T, m['roof'])
        parts.append(clip_to(shell, ring))
        for r in range(N_RIBS):
            tc = (r + 1) / (N_RIBS + 1)
            dt = RIB_W / (v1 - v0) / 2

            def rz(u, t, z_of=z_of):
                return z_of(u, t) + RIB_H
            rib = grid_solid(f'rib{name}{r}', fr, u0 + 1.0, u1 - 1.0, v0, v1, rz, RIB_H + 0.2, m['rib'], nu=24, nv=1,
                             t_lo=tc - dt, t_hi=tc + dt)
            parts.append(clip_to(rib, ring))

    # 樹枝狀柱:大廳側(v 最大處)貼著外框，沿大殼排 5 根
    va0, va1 = v_range(fr, ring, SHELLS[0][1], SHELLS[0][2])
    for i in range(5):
        u = SHELLS[0][1] + (SHELLS[0][2] - SHELLS[0][1]) * (i + 1) / 6
        _, vmax = v_range(fr, ring, u - 0.5, u + 0.5)
        x, y = fr.xy(u, vmax - COLUMN_INSET)
        t = (vmax - COLUMN_INSET - (va0 - 2.0)) / ((va1 + 2.0) - (va0 - 2.0))
        z_top = shell_z(u, t, SHELLS[0][1], SHELLS[0][2], EDGE_Z + (apex_a - EDGE_Z)) - SHELL_T
        ux, uy = fr.xy(1, 0)
        ix, iy = fr.xy(0, -1)
        ox, oy = fr.xy(0, 0)
        parts += tree_column(f'col{i}', x, y, z_top, (ux - ox, uy - oy), (ix - ox, iy - oy), m['column'])

    model = join(parts, 'station-new')
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, fr, total_h


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, fr, total_h = build(footprint_path)
    # 殼兩端會被外框裁掉，最高點不一定落在預設的位置：量實際最高點，修正一次頂高後重建
    adjust = total_h - top_z(model)
    reset()
    model, fr, total_h = build(footprint_path, adjust)
    assert abs(top_z(model) - total_h) < 0.1, (top_z(model), total_h)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, 'station-new.glb'), [model])
    # 大廳側(+v)的方位,render_previews 的方位從 +X 逆時針
    hx, hy = fr.xy(0, 1)
    ox, oy = fr.xy(0, 0)
    hall_az = math.degrees(math.atan2(hy - oy, hx - ox))
    render_previews(os.path.join(preview_dir, 'station-new'), target=(0, 0, 12), distance=420, size=(1200, 800), views={
        'plaza': (hall_az + 20, 10),
        'street': (hall_az - 15, 2),
        'rail': (hall_az + 95, 12),
        'back': (hall_az + 180, 15),
        'aerial': (hall_az - 30, 50),
    })
    print(f"MODEL_OK station-new tris={tris}")
