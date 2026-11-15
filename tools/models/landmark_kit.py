"""
百貨等「沿外框邊緣加特徵」的地標共用工具(decisions/0032)。
座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心(和 common.py 的地標慣例相同)。
外框一律是逆時針(common.load_footprint 已轉好),所以每條邊的「右手邊」是建築外側。
"""
import math
import bpy
import bmesh


class EdgeFrame:
    """以外框的一條邊為基準的座標:u 沿邊(原點在邊的中點,+u 往 b)、v 往建築外側、z 往上"""

    def __init__(self, a, b):
        self.a, self.b = a, b
        self.len = math.hypot(b[0] - a[0], b[1] - a[1])
        self.ux, self.uy = (b[0] - a[0]) / self.len, (b[1] - a[1]) / self.len
        self.vx, self.vy = self.uy, -self.ux  # 逆時針環:右手邊 = 外側
        self.ox, self.oy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2

    def p(self, u, v, z=0.0):
        return (self.ox + u * self.ux + v * self.vx, self.oy + u * self.uy + v * self.vy, z)

    def bearing(self):
        """外側法向量的方位(從北順時針,度)"""
        return (math.degrees(math.atan2(self.vx, self.vy)) + 360) % 360


class AxisFrame:
    """任意原點與方向的座標:u 沿 (ux, uy)、v 在 u 的左側"""

    def __init__(self, ox, oy, ux, uy):
        l = math.hypot(ux, uy)
        self.ox, self.oy, self.ux, self.uy = ox, oy, ux / l, uy / l
        self.vx, self.vy = -self.uy, self.ux

    def p(self, u, v, z=0.0):
        return (self.ox + u * self.ux + v * self.vx, self.oy + u * self.uy + v * self.vy, z)

    def uv(self, x, y):
        dx, dy = x - self.ox, y - self.oy
        return dx * self.ux + dy * self.uy, dx * self.vx + dy * self.vy


def box_uv(name, fr, u0, u1, v0, v1, z0, z1, material):
    """在 fr 座標裡的長方體(六個面,12 個三角形)"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(fr.p(u, v, z)) for z in (z0, z1) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def tube(name, cx, cy, radius, z0, z1, material, verts=24, caps=True):
    """直立圓柱(z0 到 z1);caps=False 只有側面(貼在別的圓柱外面的色帶用,省三角形)"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=z1 - z0, location=(cx, cy, (z0 + z1) / 2),
                                        end_fill_type='NGON' if caps else 'NOTHING')
    o = bpy.context.active_object
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(material)
    # 沒有上下蓋的圓柱:明確把每個面的法向量轉成朝外。遊戲只畫正面,朝內的面會整個看不到
    # (2026-11-14 新光三越圓筒的樓層橫線在遊戲裡消失,就是這個原因)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(f.normal.z) < 0.5 and (c.x * f.normal.x + c.y * f.normal.y) < 0:
            f.normal_flip()
    bm.to_mesh(o.data)
    bm.free()
    return o


def fit_circle(pts):
    """最小平方圓:回傳 (cx, cy, r)。pts 至少 3 點"""
    n = len(pts)
    sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
    sxx = sum(p[0] ** 2 for p in pts); syy = sum(p[1] ** 2 for p in pts); sxy = sum(p[0] * p[1] for p in pts)
    sz = sum(p[0] ** 2 + p[1] ** 2 for p in pts)
    sxz = sum(p[0] * (p[0] ** 2 + p[1] ** 2) for p in pts); syz = sum(p[1] * (p[0] ** 2 + p[1] ** 2) for p in pts)
    # 解 [sxx sxy sx; sxy syy sy; sx sy n] [A B C]^T = [sxz syz sz]
    m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]]
    for i in range(3):
        piv = m[i][i]
        m[i] = [v / piv for v in m[i]]
        for j in range(3):
            if j != i:
                f = m[j][i]
                m[j] = [a - f * b for a, b in zip(m[j], m[i])]
    A, B, C = m[0][3], m[1][3], m[2][3]
    cx, cy = A / 2, B / 2
    return cx, cy, math.sqrt(C + cx * cx + cy * cy)


def bearing_of(dx, dy):
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def edge_facing(ring, bearing_deg, min_len=10.0):
    """外框裡「外側朝向最接近指定方位」且夠長的那條邊:回傳 EdgeFrame"""
    best = None
    for i in range(len(ring)):
        fr = EdgeFrame(ring[i], ring[(i + 1) % len(ring)])
        if fr.len < min_len:
            continue
        d = abs((fr.bearing() - bearing_deg + 180) % 360 - 180)
        score = d - fr.len * 0.05
        if best is None or score < best[0]:
            best = (score, fr)
    return best[1]


# ---------------- 下沉地標(秋紅谷,decisions/0035) ----------------

def _inside(pt, ring):
    x, y = pt
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def ring_loft(name, profile, material, ref_ring, vertical='in'):
    """
    依剖面把「同點數」的環一圈圈接起來:profile = [(ring, z), ...](相鄰兩項之間接成一圈四邊形)。
    法向量:非直立的面一律朝上;直立的面 vertical='in' 朝 ref_ring 內側、'out' 朝外側(遊戲只畫正面)。
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    loops = [[bm.verts.new((x, y, z)) for x, y in ring] for ring, z in profile]
    n = len(profile[0][0])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.normal_update()
            if abs(f.normal.z) > 0.02:
                if f.normal.z < 0:
                    f.normal_flip()
            else:
                c = f.calc_center_median()
                probe = (c.x + f.normal.x * 0.05, c.y + f.normal.y * 0.05)
                if _inside(probe, ref_ring) != (vertical == 'in'):
                    f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def flat_poly(name, ring, z, material):
    """水平多邊形(可凹),法向量朝上"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z)) for x, y in ring])
    bmesh.ops.triangulate(bm, faces=[f])
    for t in bm.faces:
        t.normal_update()
        if t.normal.z < 0:
            t.normal_flip()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def segment_box(name, a, b, half_w, z0, z1, material):
    """沿線段 a→b 的長方體(寬 2·half_w)"""
    fr = AxisFrame((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, b[0] - a[0], b[1] - a[1])
    l = math.hypot(b[0] - a[0], b[1] - a[1]) / 2
    return box_uv(name, fr, -l, l, -half_w, half_w, z0, z1, material)


def ball_tree(name, x, y, z, crown_r, trunk_h, crown_mat, trunk_mat):
    """Q 版圓球樹:六角樹幹 + 一階細分的二十面體樹冠"""
    trunk = tube(name + '_trunk', x, y, crown_r * 0.18, z, z + trunk_h + crown_r * 0.5, trunk_mat, verts=6, caps=False)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=crown_r, location=(x, y, z + trunk_h + crown_r * 0.8))
    crown = bpy.context.active_object
    crown.name = name + '_crown'
    crown.scale = (1, 1, 0.85)
    crown.data.materials.append(crown_mat)
    return [trunk, crown]
