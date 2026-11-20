"""
臺中市中心核心區(西區、北區、中區、南屯)11 棟代表性地標批次建模腳本 — Q 版低面數地標模型。
涵蓋:
  1. taichung-park-pavilion (臺中公園湖心亭):雙併尖頂涼亭、朱紅飛簷、白牆與銅綠屋脊
  2. nmns-greenhouse (科博館熱帶雨林溫室):懸吊式藍色大型玻璃圓頂 + 銀白外露鋼拱骨架
  3. ntmofa (國立臺灣美術館):米白石材長條展館 + 挑高玻璃大廳 + 水平深遮陽挑簷
  4. parklane-cmp (勤美誠品綠園道):亞洲最大立體植生綠牆 + 玻璃帷幕與白色細框
  5. kuangsan-sogo (廣三SOGO百貨):21 層暖米灰高塔 + 藍綠反光玻璃帷幕帶 + 退縮冠部
  6. chungyo-dept (中友百貨 A/B/C 棟):三棟 15 層藍白百貨量體 + 跨棟高空連通空橋
  7. second-market (第二市場):紅磚街屋圍廓 + 三翼放射屋頂 + 中央紅瓦白牆六角主樓
  8. miyahara (宮原眼科):1927 紅磚拱門騎樓立面 + 頂部現代玻璃採光屋頂與深色鋼構
  9. taroko-mall (大魯閣新時代):11 層大型商場量體 + 暖灰/橘紅活力飾帶 + 玻璃中庭
 10. costco-taichung (好市多台中店):美式大型倉儲量販建築 + 紅藍水平飾帶 + 紅色入口雨遮
 11. showtime-wenxin (文心秀泰):現代影城商場幾何立面 + 酒紅飾帶與大片落地櫥窗

所有建築底座向下延伸 2.8 m 實心裙腳,確保在 3D DTM 地形斜坡上絕不懸空(並符合 landmark-models.test.ts ≥ -3.2 m 規範)。

用法:
  Blender -b --factory-startup -P tools/models/landmark_downtown_batch.py -- <public/models/landmarks> <預覽圖資料夾> <外框檔>
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
from landmark_kit import EdgeFrame, box_uv, edge_facing, ring_loft  # noqa: E402

SKIRT = 2.8


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


def safe_offset(ring, d):
    r = offset_ring(ring, d)
    return r if len(r) >= 3 else ring


def ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def add_mullions(parts, ring, z0, z1, step, half_w, m_mat, depth_in=-0.18, depth_out=0.12):
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        fr = EdgeFrame(a, b)
        if fr.len < 2.0:
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


# 1. 臺中公園湖心亭(雙併尖頂涼亭,白牆、朱紅飛簷、銅綠屋頂)
def build_pavilion(fp):
    rings, H = load_footprint(fp, 'taichung-park-pavilion')
    ring = rings[0]
    m_base = mat('pav_base', '#D8D2C5', roughness=0.85)
    m_wall = mat('pav_wall', '#F4F1EA', roughness=0.8)
    m_red = mat('pav_red', '#C84B31', roughness=0.7)
    m_roof = mat('pav_roof', '#4D7B6E', roughness=0.6)
    m_gold = mat('pav_gold', '#D9A74A', roughness=0.4)

    parts = []
    # 基座平台(貼合外框)
    parts.append(footprint_prism('plinth', ring, -SKIRT, 1.2, m_base))
    # 沿長軸放兩座尖頂涼亭(偏東北與西南) + 中央連廊
    x0, y0, x1, y1 = ring_bbox(ring)
    rx, ry = (x1 - x0) * 0.24, (y1 - y0) * 0.24
    r_pav = max(3.2, min(rx, ry) * 1.05)
    dx = (x1 - x0) * 0.23
    dy = (y1 - y0) * 0.23
    centers = [(-dx, -dy), (dx, dy)]
    # 中央通廊
    parts.append(rbox('corridor', (0, 0, 2.7), (max(2.6, dx * 2.2), 2.4, 3.0), m_wall, rot_z=math.atan2(dy, dx)))
    parts.append(rbox('corridor_roof', (0, 0, 4.4), (max(3.0, dx * 2.4), 3.0, 0.55), m_red, rot_z=math.atan2(dy, dx)))
    for idx, (cx, cy) in enumerate(centers):
        # 白色亭身與朱紅柱廊
        parts.append(zcone(f'body{idx}', (cx, cy, 1.2), r_pav * 0.72, 3.2, 8, m_wall))
        # 下層朱紅屋簷
        parts.append(zcone(f'eave{idx}', (cx, cy, 4.4), r_pav * 1.15, 0.6, 8, m_red, r_top=r_pav * 0.85))
        # 上層銅綠弧形尖頂(兩段收束)
        parts.append(zcone(f'roof1_{idx}', (cx, cy, 5.0), r_pav * 0.92, 2.2, 8, m_roof, r_top=r_pav * 0.35))
        parts.append(zcone(f'roof2_{idx}', (cx, cy, 7.2), r_pav * 0.35, H - 7.6, 8, m_roof, r_top=0.18))
        # 頂端金色寶頂
        parts.append(zcone(f'finial{idx}', (cx, cy, H - 0.4), 0.22, 0.4, 8, m_gold, r_top=0.04))
    # 北側入口木碼頭意象(放在最北緣 y1 處,貼合北亭外緣)
    m_dock = mat('pav_dock', '#B8895A', roughness=0.8)
    parts.append(rbox('dock', (dx, y1 - 0.2, 0.9), (4.6, 1.8, 0.7), m_dock))
    return finalize(parts, 'taichung-park-pavilion'), H, 0.0


# 2. 科博館熱帶雨林溫室(著名懸吊式藍色大玻璃圓頂 + 銀白外露大鋼拱)
def build_greenhouse(fp):
    rings, H = load_footprint(fp, 'nmns-greenhouse')
    ring = rings[0]
    m_base = mat('gh_base', '#D9DBD7', roughness=0.85)
    m_glass = mat('gh_glass', '#7EB5C9', roughness=0.2)
    m_steel = mat('gh_steel', '#EDF0F2', roughness=0.45)
    m_arch = mat('gh_arch', '#C6CCD2', roughness=0.4)
    m_entry = mat('gh_entry', '#2B7A78', roughness=0.6)

    parts = []
    parts.append(footprint_prism('base', ring, -SKIRT, 3.6, m_base))
    # 以多段圓錐平滑堆疊出經典藍色玻璃穹頂(避免不規則外框內縮折疊)
    x0, y0, x1, y1 = ring_bbox(ring)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    rad = min(x1 - x0, y1 - y0) * 0.44
    tiers = [
        (3.6, 10.0, rad * 1.00, rad * 0.94),
        (10.0, 17.5, rad * 0.94, rad * 0.78),
        (17.5, 24.0, rad * 0.78, rad * 0.52),
        (24.0, H - 2.0, rad * 0.52, rad * 0.24),
    ]
    for i, (za, zb, ra, rb) in enumerate(tiers):
        parts.append(zcone(f'dome{i}', (cx, cy, za), ra, zb - za, 16, m_glass, r_top=rb))
        if i < 3:
            parts.append(zcone(f'rib{i}', (cx, cy, zb - 0.35), rb + 0.55, 0.7, 16, m_steel, r_top=rb + 0.55))
    parts.append(zcone('cap', (cx, cy, H - 2.0), rad * 0.28, 0.8, 16, m_steel, r_top=rad * 0.22))
    # 兩道交叉斜鋼拱(頂高 H)
    span = rad * 1.25
    for ang in (0.35, -0.35):
        parts.append(rbox('arch', (cx, cy, H - 1.2), (span, 1.4, 2.4), m_arch, rot_z=ang))
    # 南側主入口雨遮(青綠色特徵)
    front = edge_facing(ring, 180.0, min_len=6)
    if front:
        parts.append(box_uv('entry', front, -min(front.len * 0.3, 8), min(front.len * 0.3, 8), 0, 2.2, 3.6, 5.2, m_entry))
    return finalize(parts, 'nmns-greenhouse'), H, 180.0


# 3. 國立臺灣美術館(溫潤米白花崗岩長條展館 + 玻璃主入口大廳 + 寬大水平遮陽挑簷)
def build_ntmofa(fp):
    rings, H = load_footprint(fp, 'ntmofa')
    ring = rings[0]
    m_stone = mat('art_stone', '#E8E3D8', roughness=0.8)
    m_dark = mat('art_dark', '#4C555E', roughness=0.7)
    m_glass = mat('art_glass', '#8CB2BF', roughness=0.25)
    m_canopy = mat('art_canopy', '#5B6C7D', roughness=0.6)
    m_roof = mat('art_roof', '#CFCBC0', roughness=0.85)

    parts = []
    parts.append(footprint_prism('plinth', ring, -SKIRT, 2.5, m_dark))
    parts.append(footprint_prism('body', ring, 2.5, H - 2.0, m_stone))
    # 寬大水平屋頂挑簷
    eave = safe_offset(ring, 1.2)
    parts.append(footprint_prism('eave', eave, H - 2.0, H - 0.8, m_roof))
    parts.append(footprint_prism('parapet', safe_offset(ring, -1.5), H - 0.8, H, m_stone))
    # 水平長條採光窗帶
    add_bands(parts, ring, [5.5, 10.5], 1.8, m_glass, outset=0.08)
    # 南側(五權西路正面)大型挑高玻璃主入口大廳與深藍灰雨遮
    front = edge_facing(ring, 180.0, min_len=15)
    if front:
        hw = min(front.len * 0.25, 22.0)
        parts.append(box_uv('lobby', front, -hw, hw, -0.3, 1.8, 0, H - 2.0, m_glass))
        parts.append(box_uv('canopy', front, -hw - 2, hw + 2, 0, 2.6, 6.2, 7.6, m_canopy))
    return finalize(parts, 'ntmofa'), H, 180.0


# 4. 勤美誠品綠園道(兩側立體植生綠牆 + 玻璃帷幕 + 白色格框)
def build_parklane(fp):
    rings, H = load_footprint(fp, 'parklane-cmp')
    ring = rings[0]
    m_wall = mat('cmp_wall', '#EAEAE5', roughness=0.75)
    m_glass = mat('cmp_glass', '#8FAFB8', roughness=0.25)
    m_green1 = mat('cmp_green1', '#3D8B40', roughness=0.85)
    m_green2 = mat('cmp_green2', '#5BB352', roughness=0.85)
    m_roof = mat('cmp_roof', '#C8CBC6', roughness=0.85)

    parts = []
    parts.append(footprint_prism('podium', ring, -SKIRT, 6.0, m_glass))
    parts.append(footprint_prism('tower', ring, 6.0, H - 1.5, m_wall))
    parts.append(footprint_prism('roof', safe_offset(ring, -0.8), H - 1.5, H, m_roof))
    # 水平玻璃帶
    add_bands(parts, ring, [10, 18, 26, 34, 42], 3.2, m_glass, outset=0.08)
    add_mullions(parts, ring, 0, H - 1.5, 6.0, 0.22, m_wall)
    # 公益路(南)與經國園道(東)兩側標誌性大面積立體「植生綠牆」
    for bearing, g_mat in [(180.0, m_green1), (90.0, m_green2)]:
        ef = edge_facing(ring, bearing, min_len=15)
        if ef:
            hw = ef.len * 0.42
            parts.append(box_uv('greenwall', ef, -hw, hw, 0, 0.85, 6.0, H - 4.0, g_mat))
            # 橫向植栽層條紋
            for z in range(10, int(H - 6), 6):
                parts.append(box_uv('gstrip', ef, -hw, hw, 0.7, 1.15, z, z + 1.4, m_green2 if g_mat == m_green1 else m_green1))
    return finalize(parts, 'parklane-cmp'), H, 180.0


# 5. 廣三 SOGO 百貨(21 層高聳暖米灰塔樓 + 藍綠反光玻璃帷幕 + 退縮頂冠)
def build_sogo(fp):
    rings, H = load_footprint(fp, 'kuangsan-sogo')
    ring = rings[0]
    m_wall = mat('sogo_wall', '#DFDDD6', roughness=0.75)
    m_glass = mat('sogo_glass', '#5D8AA8', roughness=0.2)
    m_accent = mat('sogo_accent', '#1D4E89', roughness=0.55)
    m_roof = mat('sogo_roof', '#B8BCC0', roughness=0.8)

    parts = []
    parts.append(footprint_prism('base', ring, -SKIRT, 8.0, m_wall))
    parts.append(footprint_prism('tower', ring, 8.0, H - 8.0, m_wall))
    # 頂部 8 m 退縮冠部
    crown = safe_offset(ring, -4.0)
    parts.append(footprint_prism('crown', crown, H - 8.0, H, m_roof))
    # 連續水平玻璃帶
    add_bands(parts, ring, list(range(12, int(H - 10), 6)), 3.0, m_glass, outset=0.12)
    # 東北正面(臺灣大道):經典大型深藍玻璃帷幕立面
    front = edge_facing(ring, 35.0, min_len=15)
    if front:
        hw = min(front.len * 0.36, 20.0)
        parts.append(box_uv('curtain', front, -hw, hw, 0, 0.9, 6.0, H - 8.0, m_accent))
        parts.append(box_uv('canopy', front, -hw * 0.7, hw * 0.7, 0, 2.4, 5.2, 6.4, m_accent))
    return finalize(parts, 'kuangsan-sogo'), H, 35.0


# 6. 中友百貨 A/B/C 棟(三棟 15 層藍白量體 + 高空連通空橋)
def build_chungyo(fp):
    rings, H = load_footprint(fp, 'chungyo-dept')
    m_blue = mat('cy_blue', '#3E7CB1', roughness=0.55)
    m_white = mat('cy_white', '#EEF0F2', roughness=0.75)
    m_glass = mat('cy_glass', '#9CC5D9', roughness=0.22)
    m_bridge = mat('cy_bridge', '#2A6F97', roughness=0.4)

    parts = []
    centers = []
    for idx, r in enumerate(rings):
        parts.append(footprint_prism(f'base{idx}', r, -SKIRT, 7.0, m_white))
        parts.append(footprint_prism(f'body{idx}', r, 7.0, H - 2.0, m_blue))
        parts.append(footprint_prism(f'top{idx}', safe_offset(r, -1.0), H - 2.0, H, m_white))
        add_bands(parts, r, list(range(11, int(H - 4), 7)), 3.2, m_glass, outset=0.14)
        x0, y0, x1, y1 = ring_bbox(r)
        centers.append(((x0 + x1) / 2, (y0 + y1) / 2))
    # 依南北(y)排序三棟,在相鄰兩棟之間加上招牌高空連通空橋(3 層與 8 層)
    centers.sort(key=lambda c: c[1])
    for i in range(len(centers) - 1):
        (ax, ay), (bx, by) = centers[i], centers[i + 1]
        L = math.hypot(bx - ax, by - ay)
        ang = math.atan2(by - ay, bx - ax)
        mx, my = (ax + bx) / 2, (ay + by) / 2
        for bz in (16.0, 32.0):
            parts.append(rbox(f'skybridge_{i}_{int(bz)}', (mx, my, bz), (L * 0.65, 5.5, 4.2), m_bridge, rot_z=ang))
    # 西側面(三民路正面)白色入口大挑簷
    m_canopy = mat('cy_canopy', '#DCE6EE', roughness=0.7)
    if rings:
        front = edge_facing(rings[0], 285.0, min_len=10)
        if front:
            parts.append(box_uv('canopy', front, -min(front.len * 0.4, 14), min(front.len * 0.4, 14), 0, 2.2, 5.0, 6.2, m_canopy))
    return finalize(parts, 'chungyo-dept'), H, 285.0


# 7. 第二市場(百年紅磚圍廓 + 經典三翼放射屋頂 + 中央六角主樓)
def build_second_market(fp):
    rings, H = load_footprint(fp, 'second-market')
    ring = rings[0]
    m_brick = mat('m2_brick', '#A8523A', roughness=0.85)
    m_wall = mat('m2_wall', '#EDE5D5', roughness=0.8)
    m_tile = mat('m2_tile', '#8C3B2B', roughness=0.75)
    m_roof = mat('m2_roof', '#6E665E', roughness=0.8)

    parts = []
    # 外圈歷史市場街屋基座
    parts.append(footprint_prism('base', ring, -SKIRT, 6.2, m_brick))
    parts.append(footprint_prism('trim', safe_offset(ring, 0.25), 5.8, 6.6, m_wall))
    parts.append(footprint_prism('roof', safe_offset(ring, -1.5), 6.6, 8.2, m_roof))
    # 中央經典「六角樓」主樓 + 紅瓦六角尖頂
    parts.append(zcone('hex_body', (0, 0, 6.5), 11.0, 4.2, 6, m_wall))
    parts.append(zcone('hex_roof', (0, 0, 10.7), 12.2, H - 10.7, 6, m_tile, r_top=1.2))
    # 三翼放射狀紅瓦屋脊(120° 間隔)
    for k in range(3):
        ang = math.radians(30 + k * 120)
        cx, cy = math.cos(ang) * 20.0, math.sin(ang) * 20.0
        parts.append(rbox(f'wing{k}', (cx, cy, 8.6), (34.0, 9.0, 2.8), m_tile, rot_z=ang))
    # 東北正面(臺灣大道一段)入口牌樓雨遮
    m_gate = mat('m2_gate', '#A03E2E', roughness=0.7)
    front = edge_facing(ring, 40.0, min_len=10)
    if front:
        parts.append(box_uv('gate', front, -8.0, 8.0, 0, 2.0, 5.2, 7.6, m_gate))
    return finalize(parts, 'second-market'), H, 40.0


# 8. 宮原眼科(1927 紅磚連續拱門騎樓 + 現代玻璃採光屋頂與深色鋼構)
def build_miyahara(fp):
    rings, H = load_footprint(fp, 'miyahara')
    ring = rings[0]
    m_brick = mat('miy_brick', '#9A3D2E', roughness=0.85)
    m_arch = mat('miy_arch', '#C7B8A5', roughness=0.8)
    m_steel = mat('miy_steel', '#2F3236', roughness=0.5)
    m_glass = mat('miy_glass', '#9CC4D4', roughness=0.2)

    parts = []
    # 下半 2 層紅磚歷史立面
    parts.append(footprint_prism('brick', ring, -SKIRT, 8.2, m_brick))
    # 紅磚與玻璃之間的女兒牆石材飾帶
    parts.append(footprint_prism('cornice', safe_offset(ring, 0.2), 7.8, 8.5, m_arch))
    # 上半現代玻璃採光大廳與深色鋼構斜頂(退縮 1.2 m)
    top_r = safe_offset(ring, -1.2)
    parts.append(footprint_prism('glass_box', top_r, 8.5, H - 2.2, m_glass))
    parts.append(footprint_prism('glass_frame', top_r, H - 2.2, H - 1.2, m_steel))
    parts.append(footprint_prism('glass_roof', safe_offset(top_r, -1.4), H - 1.2, H, m_steel))
    add_mullions(parts, top_r, 8.5, H - 2.2, 3.2, 0.14, m_steel)
    # 沿中山路(西北正面)連續 7 座紅磚拱廊柱列
    m_canopy = mat('miy_canopy', '#4A3728', roughness=0.6)
    front = edge_facing(ring, 315.0, min_len=8)
    if front:
        n_col = 7
        for j in range(n_col + 1):
            u = -front.len * 0.45 + front.len * 0.9 * j / n_col
            parts.append(box_uv(f'col{j}', front, u - 0.35, u + 0.35, 0, 0.6, 0, 7.8, m_arch))
        parts.append(box_uv('canopy', front, -front.len * 0.48, front.len * 0.48, 0, 1.5, 4.0, 4.5, m_canopy))
    return finalize(parts, 'miyahara'), H, 315.0


# 9. 大魯閣新時代(11 層大型購物中心 + 暖灰/橘紅活力飾帶 + 玻璃中庭)
def build_taroko(fp):
    rings, H = load_footprint(fp, 'taroko-mall')
    ring = rings[0]
    m_wall = mat('trk_wall', '#DDDAD3', roughness=0.8)
    m_orange = mat('trk_orange', '#D94E34', roughness=0.6)
    m_glass = mat('trk_glass', '#86A9B8', roughness=0.25)
    m_roof = mat('trk_roof', '#B8B8B4', roughness=0.85)

    parts = []
    parts.append(footprint_prism('base', ring, -SKIRT, 8.0, m_wall))
    parts.append(footprint_prism('body', ring, 8.0, H - 2.5, m_wall))
    parts.append(footprint_prism('crown', safe_offset(ring, -2.0), H - 2.5, H, m_roof))
    add_bands(parts, ring, [8.0, 22.0, H - 5.0], 2.2, m_orange, outset=0.22)
    add_bands(parts, ring, [13.0, 28.0, 35.0], 3.0, m_glass, outset=0.1)
    # 西北正面(復興路四段)大型玻璃中庭入口
    m_entry = mat('trk_entry', '#E85D3F', roughness=0.55)
    front = edge_facing(ring, 315.0, min_len=15)
    if front:
        hw = min(front.len * 0.3, 18.0)
        parts.append(box_uv('atrium', front, -hw, hw, 0, 1.0, 0, H - 6.0, m_glass))
        parts.append(box_uv('canopy', front, -hw, hw, 0, 2.4, 5.5, 6.8, m_entry))
    return finalize(parts, 'taroko-mall'), H, 315.0


# 10. 好市多台中店(大型美式倉儲量販 + 紅藍水平飾帶 + 紅色入口雨遮)
def build_costco(fp):
    rings, H = load_footprint(fp, 'costco-taichung')
    ring = rings[0]
    m_wall = mat('cst_wall', '#D4D6D8', roughness=0.85)
    m_red = mat('cst_red', '#C81E2B', roughness=0.6)
    m_blue = mat('cst_blue', '#005DAA', roughness=0.6)
    m_roof = mat('cst_roof', '#AEB2B6', roughness=0.9)

    parts = []
    parts.append(footprint_prism('body', ring, -SKIRT, H - 1.2, m_wall))
    parts.append(footprint_prism('roof', safe_offset(ring, -1.0), H - 1.2, H, m_roof))
    # 繞行整棟的經典紅藍雙色水平飾帶
    add_bands(parts, ring, [H - 3.6], 1.1, m_red, outset=0.18)
    add_bands(parts, ring, [H - 2.3], 0.9, m_blue, outset=0.18)
    # 入口側(北側文心南三路)大型紅色入口雨遮
    m_entry = mat('cst_entry', '#D62828', roughness=0.55)
    front = edge_facing(ring, 0.0, min_len=15)
    if front:
        hw = min(front.len * 0.25, 18.0)
        parts.append(box_uv('entry_roof', front, -hw, hw, 0, 2.5, 5.2, 6.6, m_entry))
        parts.append(box_uv('entry_trim', front, -hw, hw, 2.2, 2.6, 6.2, 6.9, m_blue))
    return finalize(parts, 'costco-taichung'), H, 0.0


# 11. 文心秀泰(現代影城商場幾何立面 + 酒紅影城飾帶 + 大片落地櫥窗)
def build_showtime(fp):
    rings, H = load_footprint(fp, 'showtime-wenxin')
    ring = rings[0]
    m_dark = mat('shw_dark', '#3E4147', roughness=0.75)
    m_warm = mat('shw_warm', '#E6DFD3', roughness=0.8)
    m_wine = mat('shw_wine', '#9C3D54', roughness=0.55)
    m_glass = mat('shw_glass', '#89ADB8', roughness=0.25)

    parts = []
    parts.append(footprint_prism('base', ring, -SKIRT, 6.5, m_glass))
    parts.append(footprint_prism('body', ring, 6.5, H - 3.5, m_warm))
    parts.append(footprint_prism('top', ring, H - 3.5, H, m_dark))
    add_bands(parts, ring, [6.5, H - 5.2], 1.6, m_wine, outset=0.2)
    add_bands(parts, ring, [13.0, 20.0], 2.8, m_glass, outset=0.1)
    add_mullions(parts, ring, 0, 6.5, 4.5, 0.16, m_dark)
    # 西側正面(文心南路)大型酒紅影城入口挑簷與玻璃幕牆
    m_entry = mat('shw_entry', '#B03A5B', roughness=0.5)
    front = edge_facing(ring, 270.0, min_len=15)
    if front:
        hw = min(front.len * 0.35, 18.0)
        parts.append(box_uv('facade', front, -hw, hw, 0, 0.8, 6.5, H - 3.5, m_entry))
        parts.append(box_uv('canopy', front, -hw, hw, 0, 2.3, 5.5, 6.8, m_dark))
    return finalize(parts, 'showtime-wenxin'), H, 270.0


BUILDERS = [
    ('taichung-park-pavilion', build_pavilion, True, 45),
    ('nmns-greenhouse', build_greenhouse, True, 95),
    ('ntmofa', build_ntmofa, False, 180),
    ('parklane-cmp', build_parklane, True, 120),
    ('kuangsan-sogo', build_sogo, False, 150),
    ('chungyo-dept', build_chungyo, True, 160),
    ('second-market', build_second_market, True, 150),
    ('miyahara', build_miyahara, True, 65),
    ('taroko-mall', build_taroko, False, 160),
    ('costco-taichung', build_costco, False, 150),
    ('showtime-wenxin', build_showtime, False, 140),
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
                'front34': (az - 35, 18),
            })
        print(f"MODEL_OK {lid} tris={tris}")
