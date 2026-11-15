"""
臺中市政府臺灣大道市政大樓(Weber + Hofer)— Q 版低面數地標模型。

依據:docs/art/landmarks-reference.md §4、§10(屋頂高 43.2 m;長 253 m 的低矮玻璃長條;
     正面(北北東、府前廣場)中央深色大方框;中段 1–3 樓挖空成川堂，上面像橋一樣跨過兩翼)
外框:data/landmarks/footprints-range-a.json 的 city-hall(矩形 253 × 52.4 m)
用法:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P tools/models/landmark_city_hall.py -- <輸出資料夾 public/models/landmarks> <預覽圖資料夾> <外框檔>
輸出:city-hall.glb、預覽圖 city-hall-<視角>.png

座標:X = 東、Y = 北、Z = 上,原點 = OSM 外框形心,地面 z = 0(docs/decisions/0013)。
沿長軸的座標 u、垂直的座標 v(+v = 正面，朝北北東)。
碰撞仍用外框擠出的量體(0013):川堂只是視覺上穿透，車子不能從底下開過去。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import (reset, mat, boolean, join, triangle_count, export_glb, render_previews,  # noqa: E402
                    load_footprint, min_area_rect, activate)

# ---- 參數(除總高外都是目視比例推論,landmarks-reference.md §4.2)----
FRONT_BEARING = 31.3  # 正面方位(府前廣場側)
BRIDGE_LEN = 75.0  # 中央橋樓長(川堂寬)
VOID_H = 14.0  # 川堂高(1–3 樓)
FLOOR_H = 4.3  # 樓層線間距(10 層)
FRAME_W, FRAME_H, FRAME_Z0 = 74.0, 30.0, 12.0  # 正面深色方框:寬、高、底邊高度
FRAME_BAR = 3.0  # 方框邊寬
FRAME_PROUD = 2.0  # 方框凸出立面
FRAME_RECESS = 3.0  # 框內玻璃內凹
LOUVER_W = 7.0  # 西段米色百葉帶寬

C = {  # landmarks-reference.md §4.4(推論色)
    'glass': '#556C8A',
    'line': '#B5C0CB',
    'frame': '#2C2C32',
    'inner': '#334A5E',
    'louver': '#D9D2C3',
    'soffit': '#A9B1B8',  # 川堂天花板(推論)
}


class Frame:
    """長軸座標 u、正面座標 v(+v 指向 FRONT_BEARING)↔ 世界 (x, y)"""

    def __init__(self, cx, cy, ang):
        self.cx, self.cy = cx, cy
        fx, fy = math.sin(math.radians(FRONT_BEARING)), math.cos(math.radians(FRONT_BEARING))
        ax, ay = math.cos(ang), math.sin(ang)
        # +v = u 的左側;若左側不是正面就把 u 反向
        if -ay * fx + ax * fy < 0:
            ax, ay = -ax, -ay
        self.ax, self.ay = ax, ay

    def p(self, u, v, z):
        return (self.cx + u * self.ax - v * self.ay, self.cy + u * self.ay + v * self.ax, z)

    def west_sign(self):
        """u 往哪個方向是西:回傳 +1 或 -1"""
        return 1 if self.ax < 0 else -1


def box_uv(name, fr, u0, u1, v0, v1, z0, z1, material):
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


def build(footprint_path):
    rings, total_h = load_footprint(footprint_path, 'city-hall')
    cx, cy, ang, length, width = min_area_rect(rings[0])
    fr = Frame(cx, cy, ang)
    m = {k: mat(f'cityhall_{k}', v, roughness=0.35 if k in ('glass', 'inner') else 0.75) for k, v in C.items()}
    hl, hw = length / 2, width / 2
    bl = BRIDGE_LEN / 2
    parts = []

    # 兩翼(惠中樓、文心樓)與中央橋樓;橋樓底下是川堂
    parts.append(box_uv('wing_a', fr, -hl, -bl, -hw, hw, 0, total_h, m['glass']))
    parts.append(box_uv('wing_b', fr, bl, hl, -hw, hw, 0, total_h, m['glass']))
    bridge = box_uv('bridge', fr, -bl, bl, -hw, hw, VOID_H, total_h, m['glass'])
    # 正面方框內的玻璃內凹(切割體材質轉移成框內玻璃色)
    fw, fz1 = FRAME_W / 2 - FRAME_BAR, FRAME_Z0 + FRAME_H - FRAME_BAR
    boolean(bridge, box_uv('recess', fr, -fw, fw, hw - FRAME_RECESS, hw + 1, max(FRAME_Z0 + FRAME_BAR, VOID_H), fz1, m['inner']),
            transfer_material=True, solver='MANIFOLD')
    parts.append(bridge)
    # 川堂天花板(淺色薄板，從底下看得出是橋樓)
    parts.append(box_uv('soffit', fr, -bl, bl, -hw, hw, VOID_H - 0.3, VOID_H, m['soffit']))

    # 樓層線:每層一圈淺色細帶(凸出 0.15 m);橋樓段只在川堂以上
    for k in range(1, int(total_h / FLOOR_H) + 1):
        z = k * FLOOR_H
        if z > total_h - 0.5:
            z = total_h - 0.35
        for u0, u1 in ((-hl, -bl), (bl, hl)) + (((-bl, bl),) if z > VOID_H else ()):
            parts.append(box_uv('line', fr, u0 - 0.15, u1 + 0.15, -hw - 0.15, hw + 0.15, z - 0.35, z, m['line']))

    # 正面深色大方框(凸出 2 m):外框減內框
    frame = box_uv('frame', fr, -FRAME_W / 2, FRAME_W / 2, hw - 0.5, hw + FRAME_PROUD, FRAME_Z0, FRAME_Z0 + FRAME_H, m['frame'])
    boolean(frame, box_uv('frame_hole', fr, -fw, fw, hw - 1, hw + FRAME_PROUD + 1, FRAME_Z0 + FRAME_BAR, fz1, m['frame']),
            solver='MANIFOLD')
    parts.append(frame)

    # 西段米色垂直百葉帶(正面，西翼中段)
    s = fr.west_sign()
    uw = s * (bl + (hl - bl) * 0.55)
    parts.append(box_uv('louver', fr, uw - LOUVER_W / 2, uw + LOUVER_W / 2, hw, hw + 0.4, 0, total_h - 0.6, m['louver']))

    model = join(parts, 'city-hall')
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model, fr


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    reset()
    model, fr = build(footprint_path)
    tris = triangle_count([model])
    export_glb(os.path.join(out_dir, 'city-hall.glb'), [model])
    ox, oy, _ = fr.p(0, 0, 0)
    fx, fy, _ = fr.p(0, 1, 0)
    front_az = math.degrees(math.atan2(fy - oy, fx - ox))
    render_previews(os.path.join(preview_dir, 'city-hall'), target=(0, 0, 18), distance=330, size=(1200, 800), views={
        'front': (front_az, 5),
        'front34': (front_az - 30, 12),
        'street': (front_az + 25, 1),
        'back': (front_az + 180, 5),
        'aerial': (front_az - 25, 45),
    })
    print(f"MODEL_OK city-hall tris={tris}")
