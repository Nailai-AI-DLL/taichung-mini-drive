"""
臺中水湳／逢甲／北屯區 5 棟代表性地標批次建模腳本 — Q 版低面數地標模型。
涵蓋:
  1. intercontinental-stadium (臺中洲際棒球場):棒球縫線外殼 + 綠茵內外野草皮 + 紅土鑽石內野 + 看台大棚 + 四座照明燈塔
  2. hanshin-intercontinental (漢神洲際購物廣場):11 層香檳白曲線精品百貨 + 水平玻璃光帶 + 崇德路酒紅入口中庭
  3. green-museumbrary (臺中綠美圖):妹島和世 8 棟錯落純白透光擴張網方盒 + 挑空基座柱列 + 灰綠入口雨遮
  4. taichung-icce (臺中國際會展中心):波浪「魔毯大屋頂」+ 挑高藍玻璃展館立面 + 暖木屋簷肋條
  5. decathlon-beitun (迪卡儂北屯店):3 層運動量販旗艦店 + 招牌寶藍白立面 + 屋頂空中運動場草皮跑道

所有建築底座向下延伸 2.8 m 實心裙腳,確保在 3D DTM 地形斜坡上絕不懸空(符合 landmark-models.test.ts ≥ -3.2 m 規範)。
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import (  # noqa: E402
    activate,
    box,
    export_glb,
    footprint_prism,
    join,
    load_footprint,
    mat,
    offset_ring,
    render_previews,
    reset,
    set_material,
    smooth,
    triangle_count,
)
from landmark_kit import EdgeFrame, box_uv, edge_facing  # noqa: E402

SKIRT = 2.8


def safe_offset(ring, d):
    r = offset_ring(ring, d)
    return r if len(r) >= 3 else ring


def ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def rbox(name, loc, size, material, rot_z=0.0):
    return box(name, size, loc, material, rot=(0.0, 0.0, rot_z))


def zcone(name, base_loc, r_bot, height, verts, material, r_top=None):
    cx, cy, z0 = base_loc
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=r_bot,
        radius2=r_bot if r_top is None else r_top,
        depth=height,
        location=(cx, cy, z0 + height / 2.0),
    )
    o = bpy.context.active_object
    o.name = name
    set_material(o, material)
    smooth(o)
    return o


def add_mullions(parts, ring, z0, z1, step, half_w, m_mat, depth_in=-0.18, depth_out=0.14):
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        fr = EdgeFrame(a, b)
        if fr.len < 2.5:
            continue
        k = max(1, int(fr.len / step))
        for j in range(k + 1):
            u = -fr.len / 2 + fr.len * j / k
            parts.append(box_uv('mul', fr, u - half_w, u + half_w, depth_in, depth_out, z0, z1, m_mat))


def add_bands(parts, ring, zs, band_h, m_mat, outset=0.18):
    r = safe_offset(ring, outset)
    for z in zs:
        parts.append(footprint_prism('band', r, z, z + band_h, m_mat))


def finalize(parts, lid):
    model = join(parts, lid)
    activate(model)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return model


# 1. 臺中洲際棒球場(白色棒球縫線外牆 + 綠茵球場 + 紅土內野 + 藍色看台大棚 + 四座照明燈塔)
def build_stadium(fp):
    rings, H = load_footprint(fp, 'intercontinental-stadium')
    ring = rings[0]
    m_wall = mat('st_wall', '#EDEFF2', roughness=0.75)
    m_blue = mat('st_blue', '#1E4E8C', roughness=0.55)
    m_stitch = mat('st_stitch', '#C93B2B', roughness=0.6)
    m_grass = mat('st_grass', '#4E9A47', roughness=0.9)
    m_dirt = mat('st_dirt', '#C28B5B', roughness=0.9)
    m_roof = mat('st_roof', '#DCE3EA', roughness=0.65)
    m_tower = mat('st_tower', '#6B7785', roughness=0.5)
    m_light = mat('st_light', '#FFF6D6', roughness=0.3)
    m_entry = mat('st_entry', '#163A6B', roughness=0.55)

    parts = []
    # 外圈白色棒球場底座與外牆(貼合 OSM 球場外框)
    parts.append(footprint_prism('shell', ring, -SKIRT, 14.0, m_wall))
    add_bands(parts, ring, [6.0, 12.2], 1.4, m_blue, outset=0.35)
    # 內縮球場綠茵大草皮(模擬開放式碗狀球場)
    x0, y0, x1, y1 = ring_bbox(ring)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    rad = min(x1 - x0, y1 - y0) * 0.36
    parts.append(zcone('field', (cx, cy, 13.8), rad, 0.5, 24, m_grass))
    # 紅土內野鑽石 + 白色本壘/壘包
    parts.append(rbox('infield', (cx - rad * 0.18, cy - rad * 0.18, 14.2), (rad * 0.62, rad * 0.62, 0.4), m_dirt, rot_z=math.radians(45)))
    parts.append(rbox('infield_grass', (cx - rad * 0.18, cy - rad * 0.18, 14.32), (rad * 0.42, rad * 0.42, 0.35), m_grass, rot_z=math.radians(45)))
    # 繞場半圓弧看台頂棚(集中在西南~東南本壘與一三壘側,外加經典紅色棒球縫線肋條)
    canopy_r = rad * 1.12
    for k in range(11):
        ang = math.radians(170 + k * 20)  # 從西側繞南側到東側
        px = cx + math.cos(ang) * canopy_r
        py = cy + math.sin(ang) * canopy_r
        parts.append(rbox(f'canopy_{k}', (px, py, 20.5), (18.0, 22.0, 2.2), m_roof, rot_z=ang))
        # 屋頂紅色棒球縫線條
        parts.append(rbox(f'stitch_{k}', (px, py, 21.8), (18.5, 1.4, 0.7), m_stitch, rot_z=ang))
    # 四座高聳棒球場照明燈塔(頂高 H = 32 m)
    for k, deg in enumerate((40, 135, 225, 315)):
        ang = math.radians(deg)
        tx = cx + math.cos(ang) * (rad * 1.08)
        ty = cy + math.sin(ang) * (rad * 1.08)
        parts.append(rbox(f'tower_{k}', (tx, ty, 22.0), (2.2, 2.2, H - 14.0), m_tower))
        parts.append(rbox(f'lamp_{k}', (tx, ty, H - 1.5), (7.5, 2.4, 3.0), m_light, rot_z=ang + math.pi / 2))
    # 東側(崇德路三段正面)深藍迎賓廣場大門雨遮(作為朝向特徵)
    front = edge_facing(ring, 90.0, min_len=8)
    if front:
        hw = min(front.len * 0.45, 20.0)
        parts.append(box_uv('entry', front, -hw, hw, 0, 2.4, 5.0, 8.5, m_entry))
    else:
        parts.append(rbox('entry', (x1 - 2.0, cy, 6.8), (4.0, 28.0, 3.6), m_entry))
    return finalize(parts, 'intercontinental-stadium'), H, 90.0


# 2. 漢神洲際購物廣場(11 層香檳白曲線精品百貨 + 水平玻璃光帶 + 崇德路酒紅入口中庭)
def build_hanshin(fp):
    rings, H = load_footprint(fp, 'hanshin-intercontinental')
    ring = rings[0]
    m_champ = mat('hs_champ', '#EFE9DF', roughness=0.7)
    m_gold = mat('hs_gold', '#C9A875', roughness=0.45)
    m_glass = mat('hs_glass', '#7FA5B8', roughness=0.22)
    m_wine = mat('hs_wine', '#8E3A59', roughness=0.55)
    m_roof = mat('hs_roof', '#C8C5BE', roughness=0.85)

    parts = []
    parts.append(footprint_prism('podium', ring, -SKIRT, 9.0, m_champ))
    parts.append(footprint_prism('body', ring, 9.0, H - 3.5, m_champ))
    parts.append(footprint_prism('crown', safe_offset(ring, -2.5), H - 3.5, H, m_roof))
    # 水平玻璃光帶與香檳金線條
    add_bands(parts, ring, [13.0, 22.0, 31.0, 40.0], 3.4, m_glass, outset=0.14)
    add_bands(parts, ring, [9.0, 17.5, 26.5, 35.5, H - 4.0], 0.9, m_gold, outset=0.28)
    # 東側正面(崇德路三段)大型酒紅精品入口中庭與雨遮
    front = edge_facing(ring, 90.0, min_len=15)
    if front:
        hw = min(front.len * 0.3, 24.0)
        parts.append(box_uv('atrium', front, -hw, hw, 0, 1.4, 0, H - 6.0, m_glass))
        parts.append(box_uv('entry', front, -hw * 0.85, hw * 0.85, 0, 2.5, 6.2, 8.2, m_wine))
    return finalize(parts, 'hanshin-intercontinental'), H, 90.0


# 3. 臺中綠美圖(妹島和世 8 棟錯落純白透光擴張網方盒 + 挑空柱列 + 灰綠入口雨遮)
def build_museumbrary(fp):
    rings, H = load_footprint(fp, 'green-museumbrary')
    ring = rings[0]
    m_plaza = mat('gm_plaza', '#D5D8D4', roughness=0.85)
    m_white = mat('gm_white', '#F5F7F7', roughness=0.65)
    m_mesh = mat('gm_mesh', '#E2E9E8', roughness=0.4)
    m_glass = mat('gm_glass', '#9CC0C9', roughness=0.2)
    m_green = mat('gm_green', '#5E8C7F', roughness=0.65)

    parts = []
    # 基座與挑空一樓玻璃大廳(貼合 OSM 外框)
    parts.append(footprint_prism('plinth', ring, -SKIRT, 1.0, m_plaza))
    parts.append(footprint_prism('ground', safe_offset(ring, -0.5), 1.0, 5.5, m_glass))
    add_mullions(parts, safe_offset(ring, -0.3), 1.0, 5.5, 4.5, 0.22, m_white)
    # 主量體層 + 錯落純白漂浮方盒(妹島和世代表性建築語彙)
    parts.append(footprint_prism('mid', ring, 5.5, 16.0, m_mesh))
    x0, y0, x1, y1 = ring_bbox(ring)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    w, d = (x1 - x0), (y1 - y0)
    cubes = [
        (-w * 0.16, -d * 0.12, w * 0.26, d * 0.24, H),
        (w * 0.14, -d * 0.10, w * 0.24, d * 0.22, H - 3.0),
        (-w * 0.10, d * 0.14, w * 0.25, d * 0.22, H - 1.8),
        (w * 0.15, d * 0.12, w * 0.20, d * 0.20, H - 5.0),
    ]
    for idx, (ox, oy, cw, cd, ch) in enumerate(cubes):
        parts.append(rbox(f'cube{idx}', (cx + ox, cy + oy, (15.5 + ch) / 2.0), (cw, cd, ch - 15.5), m_white if idx % 2 == 0 else m_mesh))
        # 頂部細白邊框
        parts.append(rbox(f'cap{idx}', (cx + ox, cy + oy, ch - 0.3), (cw + 0.5, cd + 0.5, 0.6), m_white))
    # 東北側(中科路方向)灰綠入口大挑簷
    front = edge_facing(ring, 45.0, min_len=8)
    if front:
        hw = min(front.len * 0.4, 14.0)
        parts.append(box_uv('entry', front, -hw, hw, 0, 2.2, 4.8, 6.2, m_green))
    return finalize(parts, 'green-museumbrary'), H, 45.0


# 4. 臺中國際會展中心(波浪「魔毯大屋頂」+ 藍玻璃展館立面 + 暖木屋簷肋條)
def build_icce(fp):
    rings, H = load_footprint(fp, 'taichung-icce')
    ring = rings[0]
    m_base = mat('ic_base', '#D9DDE0', roughness=0.8)
    m_glass = mat('ic_glass', '#6F9DB5', roughness=0.22)
    m_roof = mat('ic_roof', '#F2F4F6', roughness=0.55)
    m_wood = mat('ic_wood', '#C79B6B', roughness=0.75)
    m_blue = mat('ic_blue', '#3A7CA5', roughness=0.55)

    parts = []
    parts.append(footprint_prism('plinth', ring, -SKIRT, 2.0, m_base))
    parts.append(footprint_prism('hall', safe_offset(ring, -1.5), 2.0, 20.5, m_glass))
    add_mullions(parts, safe_offset(ring, -1.3), 2.0, 20.5, 8.0, 0.35, m_roof)
    # 招牌波浪「魔毯大屋頂」:主挑簷 + 5 段起伏白色波浪頂棚 + 暖木底襯
    parts.append(footprint_prism('soffit', safe_offset(ring, 0.8), 20.0, 21.5, m_wood))
    parts.append(footprint_prism('carpet', safe_offset(ring, 1.4), 21.5, 24.0, m_roof))
    x0, y0, x1, y1 = ring_bbox(ring)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    span_x = (x1 - x0) * 0.65
    span_y = (y1 - y0) * 0.34
    # 依長軸方向(約 20°)放 5 道高低起伏波浪屋頂脊
    ang = math.radians(20.0)
    for k, (t, wh) in enumerate([(-0.36, 26.8), (-0.18, 29.2), (0.0, H), (0.18, 28.6), (0.36, 26.4)]):
        px = cx + math.cos(ang) * span_x * t
        py = cy + math.sin(ang) * span_x * t
        parts.append(rbox(f'wave{k}', (px, py, (23.5 + wh) / 2.0), (span_x * 0.22, span_y, wh - 23.5), m_roof, rot_z=ang))
    # 北側(黎明路／中央公園側)鋼藍主入口雨遮
    front = edge_facing(ring, 340.0, min_len=20)
    if front:
        hw = min(front.len * 0.28, 30.0)
        parts.append(box_uv('entry', front, -hw, hw, 0, 2.4, 6.0, 8.2, m_blue))
    return finalize(parts, 'taichung-icce'), H, 340.0


# 5. 迪卡儂北屯店(3 層寶藍白運動量販旗艦店 + 屋頂空中運動場草皮與橘色跑道)
def build_decathlon(fp):
    rings, H = load_footprint(fp, 'decathlon-beitun')
    ring = rings[0]
    m_white = mat('dc_white', '#F0F2F5', roughness=0.75)
    m_blue = mat('dc_blue', '#0082C3', roughness=0.55)
    m_glass = mat('dc_glass', '#7EA8BE', roughness=0.25)
    m_turf = mat('dc_turf', '#43A047', roughness=0.9)
    m_track = mat('dc_track', '#E66A2C', roughness=0.85)
    m_entry = mat('dc_entry', '#006299', roughness=0.5)

    parts = []
    parts.append(footprint_prism('base', ring, -SKIRT, 4.5, m_glass))
    parts.append(footprint_prism('body', ring, 4.5, H - 1.0, m_white))
    # 繞行整棟的招牌迪卡儂寶藍上緣飾帶
    add_bands(parts, ring, [H - 3.6], 2.4, m_blue, outset=0.2)
    add_mullions(parts, ring, 0.0, 4.5, 5.0, 0.16, m_blue)
    # 屋頂特色空中運動場(綠草皮球場 + 橘色跑道邊框)
    parts.append(footprint_prism('track', safe_offset(ring, -2.0), H - 1.0, H - 0.3, m_track))
    parts.append(footprint_prism('turf', safe_offset(ring, -6.0), H - 0.4, H, m_turf))
    # 東北正面(中清路二段)深藍運動門廊雨遮
    front = edge_facing(ring, 30.0, min_len=15)
    if front:
        hw = min(front.len * 0.3, 18.0)
        parts.append(box_uv('entry', front, -hw, hw, 0, 2.4, 4.2, 5.8, m_entry))
    return finalize(parts, 'decathlon-beitun'), H, 30.0


BUILDERS = [
    ('intercontinental-stadium', build_stadium, True, 290),
    ('hanshin-intercontinental', build_hanshin, True, 250),
    ('green-museumbrary', build_museumbrary, True, 110),
    ('taichung-icce', build_icce, True, 300),
    ('decathlon-beitun', build_decathlon, True, 150),
]


if __name__ == '__main__':
    out_dir, preview_dir, footprint_path = sys.argv[sys.argv.index('--') + 1:][:3]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)
    for lid, fn, do_preview, dist in BUILDERS:
        reset()
        model, H, front_bearing = fn(footprint_path)
        tris = triangle_count([model])
        export_glb(os.path.join(out_dir, f'{lid}.glb'), [model])
        if do_preview:
            az = 90 - front_bearing
            render_previews(os.path.join(preview_dir, lid), target=(0, 0, H * 0.45), distance=dist, size=(1200, 800), views={
                'front34': (az - 35, 22),
            })
        print(f"MODEL_OK {lid} tris={tris}")
