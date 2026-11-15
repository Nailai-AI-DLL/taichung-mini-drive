"""
臺中國家歌劇院(伊東豊雄)— Q 版低面數地標模型。

依據:docs/art/landmarks-reference.md §1(高度 37.7 m、平頂方盒 + 葫蘆形開口 + 白框 + 屋頂舞台塔)
外框:data/landmarks/footprints-range-a.json 的 opera(由 npm run map:build:range-a 產生)
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/landmark_opera.py -- <輸出資料夾 public/models/landmarks> <預覽圖資料夾> <外框檔>
輸出:opera.glb、預覽圖 opera-<視角>.png

座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心,地面 z = 0(docs/decisions/0013)。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import (reset, mat, boolean, join, triangle_count, export_glb, render_previews,  # noqa: E402
                    load_footprint, min_area_rect, offset_ring, ring_ccw, footprint_prism, oriented_box)

# ---- 參數 ----
# 總高讀外框檔的 h(= landmarks.json 的 height 37.7 m,出處見 landmarks-reference.md §1.1),不在腳本另存一份。
# 主牆高 not_stated,取總高約 85%(推論);舞台塔頂 = 總高
WALL_RATIO = 0.85
WALL_H = 32.0  # build() 依外框檔的 h 重設
FRONT_DIR = (math.sin(math.radians(122)), math.cos(math.radians(122)))  # 東南長立面的法線(方位 122°)
FRAME_W = 0.9  # 開口白框寬
FRAME_PROUD = 0.5  # 白框凸出牆面
GLASS_DEPTH = 2.5  # 玻璃帷幕內凹深度
CAVE_DEPTH = 9.0  # 洞窟內凹深度

C = {  # landmarks-reference.md §1.4(推論色)
    'wall': '#B3B8BC',
    'frame': '#F4F3EF',
    'glass': '#3E5A60',
    'cave': '#EDEBE6',
    'tower': '#5A6270',
    'green': '#B9CBA8',
}

# 葫蘆形開口的半寬曲線:(高度 / 主牆高, 半寬 m)。下寬、中段收腰、上緣外翻並穿出牆頂
GOURD = [(-0.05, 8.0), (0.0, 8.0), (0.18, 7.5), (0.38, 5.0), (0.55, 3.2), (0.72, 4.8), (0.88, 7.5), (1.0, 9.5), (1.25, 12.0)]


def gourd_half_width(f):
    """Catmull-Rom 內插:曲線通過每個控制點且斜率連續(smoothstep 會在控制點處變平,輪廓像階梯)"""
    p = GOURD
    for i in range(1, len(p)):
        if f <= p[i][0] or i == len(p) - 1:
            f0, f1 = p[i - 1][0], p[i][0]
            t = min(max((f - f0) / (f1 - f0), 0.0), 1.0)
            w0, w1 = p[max(i - 2, 0)][1], p[i - 1][1]
            w2, w3 = p[i][1], p[min(i + 1, len(p) - 1)][1]
            return 0.5 * (2 * w1 + (-w0 + w2) * t + (2 * w0 - 5 * w1 + 4 * w2 - w3) * t * t + (-w0 + 3 * w1 - 3 * w2 + w3) * t ** 3)
    return p[-1][1]


def gourd_profile(scale, n=32):
    """立面座標 (u 沿牆, z 向上) 的封閉輪廓,逆時針"""
    zs = [WALL_H * (GOURD[0][0] + (GOURD[-1][0] - GOURD[0][0]) * i / n) for i in range(n + 1)]
    right = [(gourd_half_width(z / WALL_H) * scale, z) for z in zs]
    left = [(-u, z) for u, z in reversed(right)]
    return ring_ccw(right + left)


def facade_mesh(name, loops, material):
    """loops:每個 loop 是同點數的 3D 點列;相鄰 loop 之間接成四邊形,首尾 loop 補面"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in loop] for loop in loops]
    n = len(loops[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    return bm, me, vs


def to_world(wall, u, z, d):
    """立面座標 → 世界座標:wall = (中心點, 沿牆單位向量, 外法線);d > 0 往牆外"""
    (cx, cy), (tx, ty), (nx, ny) = wall
    return (cx + tx * u + nx * d, cy + ty * u + ny * d, z)


def finish(bm, me, name, material):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def opening_cutter(name, wall, prof, depth, material):
    """沿牆法線擠出的葫蘆形切割體,從牆外 3 m 切到牆內 depth"""
    bm, me, vs = facade_mesh(name, [[to_world(wall, u, z, 3.0) for u, z in prof],
                                    [to_world(wall, u, z, -depth) for u, z in prof]], material)
    bm.faces.new(vs[0])
    bm.faces.new(list(reversed(vs[1])))
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return finish(bm, me, name, material)


def opening_frame(name, wall, prof, material):
    """開口外緣的白框:外輪廓(外擴 FRAME_W)與開口輪廓之間的環,凸出牆面;牆頂以上切掉"""
    outer = offset_ring(prof, FRAME_W)
    loops = []
    for d in (FRAME_PROUD, -0.3):
        loops.append([to_world(wall, u, z, d) for u, z in outer])
        loops.append([to_world(wall, u, z, d) for u, z in prof])
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    o_f, i_f, o_b, i_b = [[bm.verts.new(p) for p in loop] for loop in loops]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((o_f[i], o_f[j], i_f[j], i_f[i]))  # 正面
        bm.faces.new((o_b[j], o_b[i], i_b[i], i_b[j]))  # 背面
        bm.faces.new((o_b[i], o_b[j], o_f[j], o_f[i]))  # 外側
        bm.faces.new((i_f[i], i_f[j], i_b[j], i_b[i]))  # 內側
    # 牆頂倒角(2 m)以上、地面以下切掉:框只留在牆面上,開口底部貼地不留橫框
    for z, no in ((WALL_H - 2.0, (0, 0, 1)), (0.0, (0, 0, -1))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        cut = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=no, clear_outer=True)
        edges = [e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    return finish(bm, me, name, material)


def build(footprint_path):
    global WALL_H
    rings, total_h = load_footprint(footprint_path, 'opera')
    WALL_H = round(total_h * WALL_RATIO, 1)
    ring = rings[0]
    cx, cy, ang, length, width = min_area_rect(ring)
    ax, ay = math.cos(ang), math.sin(ang)  # 長軸
    nx, ny = -ay, ax  # 短軸(長軸左側)
    if nx * FRONT_DIR[0] + ny * FRONT_DIR[1] < 0:
        nx, ny = -nx, -ny  # 讓 (nx, ny) 指向東南正面

    m = {k: mat(f'opera_{k}', v, roughness=0.35 if k == 'glass' else 0.8) for k, v in C.items()}

    main = footprint_prism('opera_main', ring, 0.0, WALL_H, m['wall'], bevel_w=2.0, segments=3)
    roof = footprint_prism('opera_roof', offset_ring(ring, -4.0), WALL_H - 0.2, WALL_H + 0.4, m['green'])

    # 四面牆:(中心, 沿牆方向, 外法線, 半長)
    def wall(sign_n, along_long):
        if along_long:
            return ((cx + nx * width / 2 * sign_n, cy + ny * width / 2 * sign_n), (ax * sign_n, ay * sign_n), (nx * sign_n, ny * sign_n))
        return ((cx + ax * length / 2 * sign_n, cy + ay * length / 2 * sign_n), (-nx * sign_n, -ny * sign_n), (ax * sign_n, ay * sign_n))

    front, back = wall(1, True), wall(-1, True)
    end_a, end_b = wall(1, False), wall(-1, False)
    # (牆, 沿牆位置 u, 大小, 種類)。正面 3 個(中央最大的是洞窟),背面 2 個,兩端各 1 個。
    # 開口數量、位置、大小，以及下方舞台塔的尺寸與位置都是推論(參考資料 §1.2 只說長立面約 3–5 個大開口)
    openings = [
        (front, -38.0, 1.0, 'glass'), (front, 0.0, 1.2, 'cave'), (front, 38.0, 0.95, 'glass'),
        (back, -26.0, 1.05, 'cave'), (back, 26.0, 0.95, 'glass'),
        (end_a, 0.0, 1.0, 'glass'), (end_b, 0.0, 1.0, 'cave'),
    ]
    frames = []
    for i, (w, u0, s, kind) in enumerate(openings):
        prof = [(u + u0, z) for u, z in gourd_profile(s)]
        depth = CAVE_DEPTH if kind == 'cave' else GLASS_DEPTH
        cutter = opening_cutter(f'cut{i}', w, prof, depth, m[kind])
        boolean(roof, cutter, remove_cutter=False, solver='MANIFOLD')
        boolean(main, cutter, transfer_material=True, solver='MANIFOLD')
        frames.append(opening_frame(f'frame{i}', w, prof, m['frame']))

    tower = oriented_box('opera_tower', cx - nx * width * 0.1, cy - ny * width * 0.1, ang, length / 4, width * 0.45,
                         WALL_H - 1.0, total_h, m['tower'], bevel_w=0.8)
    mounds = []
    for k, (du, dv) in enumerate([(-34, 10), (30, 14), (36, -12)]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=5.0,
                                             location=(cx + ax * du + nx * dv, cy + ay * du + ny * dv, WALL_H + 0.4))
        o = bpy.context.active_object
        o.name = f'mound{k}'
        o.scale.z = 0.45
        o.data.materials.append(m['frame'])
        mounds.append(o)

    model = join([main, roof, tower, *frames, *mounds], 'opera')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, (nx, ny)


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, (fx, fy) = build(footprint_path)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, 'opera.glb'), [model])
    front_az = math.degrees(math.atan2(fy, fx))  # render_previews 的方位:從 +X(東)逆時針
    render_previews(os.path.join(preview_dir, 'opera'), target=(0, 0, 14), distance=230, size=(1200, 800), views={
        'front': (front_az, 12),
        'street': (front_az + 25, 1),
        'back': (front_az + 180, 15),
        'end': (front_az + 90, 12),
        'aerial': (front_az - 30, 50),
    })
    print(f"MODEL_OK opera tris={tris}")
