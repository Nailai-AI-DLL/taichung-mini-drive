#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
臺中市道路寬度(data.gov.tw 83822)× OSM 可行駛道路 對應原型(研究用,不屬於建置管線)。

用法(請用 python3 -I;資料檔只當資料讀,不執行任何下載內容):
  python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/road_width_match.py \
      --gov  /Users/cooperfu/Projects/3D_Racing/data/gov/road-width/road_width_raw.csv \
      --osm  /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q01_roads_B.json \
      --out-sample /Users/cooperfu/Projects/3D_Racing/data/gov/road-width/match-sample.json \
      --out-stats  /Users/cooperfu/Projects/3D_Racing/data/gov/road-width/match-stats.json
  python3 -I .../road_width_match.py --selftest      # 正規化與幾何函式自我檢查,通過印 SELFTEST PASS
  python3 -I .../road_width_match.py --profile --gov <CSV>   # 全檔欄位概況(總筆數、各欄分布)

只用標準函式庫。stdout 印出 Markdown 統計表。

計算口徑:
  - 範圍 A = 24.130,120.630,24.175,120.695(南,西,北,東)。
  - OSM 可行駛 = 與 tools/map-build/lib/roads.ts isDrivable() 相同規則(本檔 is_drivable 逐條移植)。
  - 長度 = 每段先用 Liang-Barsky 在經緯度平面裁切到範圍 A,再用 haversine(R=6371008.8 m)計算
    (沿用 osm_area_stats.py 的函式)。
  - 政府資料每列 = 一條直線線段(起點 TM2度分帶97X/Y、終點 EndX/EndY,EPSG:3826),
    用 twd97_to_wgs84.tm_inverse 換成經緯度,再與 OSM 一起投影到以範圍 A 中心為原點的平面公尺座標。
  - 名稱正規化 norm_name():NFKC(全形→半形)、去空白、去括號內容、「台」→「臺」、異體字(VARIANTS)。
    政府完整名稱 = 路名 + 巷 + 弄(巷/弄欄位若是純數字補上「巷」「弄」)。
  - 三種方法:
      N 名稱法:OSM name 正規化後等於某個政府完整名稱(只看範圍 A 外擴 300 m 內的政府線段)。
               寬度 = 該名稱政府線段的長度加權中位數。
      S 空間法:OSM 每 10 m 取樣點,找最近的政府線段;接受條件 = 距離 ≤ 政府路寬/2 + 4 m 且夾角 ≤ 30°。
               取樣點有 ≥ 50% 被接受才算該 way 對到;寬度 = 被接受樣本的長度加權中位數。
      H 混合法:同 S,但 OSM 有 name 時只接受同名的政府線段;OSM 沒 name 時不限名稱。
      R(建議)= H;H 對不到時,只在該名稱的政府寬度一致(max-min ≤ 3 m)才退回 N。
      組合:H+N = H 對不到時退回 N;H+S = H 對不到時退回 S(不看名稱);H+S+N = 再退回 N。
  - 覆蓋率 = 對到的 OSM 可行駛道路長度 / 範圍 A 全部 OSM 可行駛道路長度。
"""
import argparse
import csv
import importlib.util
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


STATS = _load("osm_area_stats")   # haversine, clip_segment
TWD = _load("twd97_to_wgs84")     # tm_inverse

AREA_A = (24.130, 120.630, 24.175, 120.695)
R_EARTH = 6371008.8
LAT0 = (AREA_A[0] + AREA_A[2]) / 2
LON0 = (AREA_A[1] + AREA_A[3]) / 2
GOV_BUFFER_M = 300.0
SAMPLE_STEP_M = 10.0
DIST_TOL_M = 4.0
MAX_ANGLE_DEG = 30.0
MIN_SAMPLE_SHARE = 0.5
GRID_M = 50.0
# 異體字(OSM 常見寫法 → 政府資料寫法);新增時要在 selftest 補案例
VARIANTS = {"陜": "陝", "舘": "館"}
MAJOR = {"trunk", "primary", "secondary", "tertiary"}
EXAMPLE_NAMES = ["臺灣大道三段", "文心路三段", "中清路一段"]   # 報告引用的範例

# ---- 與 tools/map-build/lib/roads.ts 一致 ----
DRIVABLE = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "motorway_link", "trunk_link", "primary_link", "secondary_link",
    "tertiary_link",
}


def is_drivable(t):
    if t.get("highway") not in DRIVABLE:
        return False
    if t.get("area") == "yes":
        return False
    if t.get("access") in ("no", "private"):
        return False
    if t.get("highway") == "service" and t.get("service") in ("parking_aisle", "drive-through"):
        return False
    return True


def is_oneway(t):
    return t.get("oneway") in ("yes", "1", "-1") or t.get("junction") == "roundabout"


# ---- 名稱 ----
def norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"\s+", "", s)
    s = s.replace("台", "臺")
    for k, v in VARIANTS.items():
        s = s.replace(k, v)
    return s


def gov_full_name(road, lane, alley):
    lane = (lane or "").strip()
    alley = (alley or "").strip()
    if lane and re.fullmatch(r"[0-9之\-]+", lane):
        lane += "巷"
    if alley and re.fullmatch(r"[0-9之\-]+", alley):
        alley += "弄"
    return norm_name((road or "") + lane + alley)


# ---- 幾何 ----
def to_xy(lat, lon):
    x = math.radians(lon - LON0) * R_EARTH * math.cos(math.radians(LAT0))
    y = math.radians(lat - LAT0) * R_EARTH
    return x, y


def point_seg(px, py, ax, ay, bx, by):
    """點到線段距離。"""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def angle_diff_deg(ux, uy, vx, vy):
    """兩方向的無向夾角(0–90°)。"""
    lu, lv = math.hypot(ux, uy), math.hypot(vx, vy)
    if lu == 0 or lv == 0:
        return 0.0
    c = abs((ux * vx + uy * vy) / (lu * lv))
    return math.degrees(math.acos(min(1.0, c)))


def weighted_median(pairs):
    """pairs = [(value, weight)]"""
    pairs = sorted(p for p in pairs if p[1] > 0)
    if not pairs:
        return None
    tot = sum(w for _, w in pairs)
    acc = 0.0
    for v, w in pairs:
        acc += w
        if acc >= tot / 2:
            return v
    return pairs[-1][0]


# ---- 載入 ----
def load_gov(path, bbox):
    s, w, n, e = bbox
    bx0, by0 = to_xy(s, w)
    bx1, by1 = to_xy(n, e)
    bx0 -= GOV_BUFFER_M; by0 -= GOV_BUFFER_M; bx1 += GOV_BUFFER_M; by1 += GOV_BUFFER_M
    total = 0
    segs = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            total += 1
            try:
                x0, y0 = float(r["TM2度分帶97X坐標"]), float(r["TM2度分帶97Y坐標"])
                x1, y1 = float(r["EndX坐標"]), float(r["EndY坐標"])
                width = float(r["路寬"])
            except (ValueError, KeyError):
                continue
            la0, lo0 = TWD.tm_inverse(x0, y0)
            la1, lo1 = TWD.tm_inverse(x1, y1)
            ax, ay = to_xy(la0, lo0)
            bx, by = to_xy(la1, lo1)
            if max(ax, bx) < bx0 or min(ax, bx) > bx1 or max(ay, by) < by0 or min(ay, by) > by1:
                continue
            try:
                len_field = float(r["長度"])
            except ValueError:
                len_field = float("nan")
            segs.append({
                "id": r["編號"], "name": gov_full_name(r["路名"], r["巷"], r["弄"]),
                "raw_name": r["路名"], "lane": r["巷"], "alley": r["弄"], "district": r["地區"],
                "width": width, "speed": r["速限"], "year": r["民國年"], "kind": r["道路型態分類"],
                "len_field": len_field, "a": (ax, ay), "b": (bx, by),
                "chord": math.hypot(bx - ax, by - ay),
            })
    return total, segs


def build_grid(segs):
    grid = defaultdict(list)
    for i, sg in enumerate(segs):
        (ax, ay), (bx, by) = sg["a"], sg["b"]
        pad = sg["width"] / 2 + DIST_TOL_M
        gx0 = int(math.floor((min(ax, bx) - pad) / GRID_M))
        gx1 = int(math.floor((max(ax, bx) + pad) / GRID_M))
        gy0 = int(math.floor((min(ay, by) - pad) / GRID_M))
        gy1 = int(math.floor((max(ay, by) + pad) / GRID_M))
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                grid[(gx, gy)].append(i)
    return grid


def osm_pieces(el, bbox):
    """裁切到 bbox 後的連續片段(經緯度),與長度(m)。"""
    g = el.get("geometry") or []
    pieces, cur, total = [], [], 0.0
    for a, b in zip(g, g[1:]):
        c = STATS.clip_segment(a["lat"], a["lon"], b["lat"], b["lon"], bbox)
        if not c:
            if len(cur) >= 2:
                pieces.append(cur)
            cur = []
            continue
        p0, p1 = (c[0], c[1]), (c[2], c[3])
        if cur and cur[-1] == p0:
            cur.append(p1)
        else:
            if len(cur) >= 2:
                pieces.append(cur)
            cur = [p0, p1]
        total += STATS.haversine(*c)
    if len(cur) >= 2:
        pieces.append(cur)
    return pieces, total


def samples_of(pieces):
    """每段每 10 m 取樣:(x, y, 方向 dx, dy, 代表長度)。"""
    out = []
    for pc in pieces:
        xy = [to_xy(la, lo) for la, lo in pc]
        for (ax, ay), (bx, by) in zip(xy, xy[1:]):
            L = math.hypot(bx - ax, by - ay)
            if L == 0:
                continue
            k = max(1, int(math.ceil(L / SAMPLE_STEP_M)))
            for j in range(k):
                t = (j + 0.5) / k
                out.append((ax + t * (bx - ax), ay + t * (by - ay), bx - ax, by - ay, L / k))
    return out


def spatial_match(samples, segs, grid, name_filter=None):
    """回傳 (被接受樣本長度, 總樣本長度, [(寬度, 長度)], Counter(政府名稱))。"""
    acc_len, tot_len, widths, names = 0.0, 0.0, [], Counter()
    for x, y, dx, dy, w in samples:
        tot_len += w
        best, bestd = None, float("inf")
        for i in grid.get((int(math.floor(x / GRID_M)), int(math.floor(y / GRID_M))), ()):
            sg = segs[i]
            if name_filter is not None and sg["name"] != name_filter:
                continue
            (ax, ay), (bx, by) = sg["a"], sg["b"]
            d = point_seg(x, y, ax, ay, bx, by)
            if d > sg["width"] / 2 + DIST_TOL_M or d >= bestd:
                continue
            if sg["chord"] > 0 and angle_diff_deg(dx, dy, bx - ax, by - ay) > MAX_ANGLE_DEG:
                continue
            best, bestd = sg, d
        if best is not None:
            acc_len += w
            widths.append((best["width"], w))
            names[best["name"]] += w
    return acc_len, tot_len, widths, names


def pct(a, b):
    return round(100.0 * a / b, 1) if b else None


def run(gov_path, osm_path, out_sample, out_stats, out_widths=None, bbox=AREA_A):
    global LAT0, LON0
    LAT0 = (bbox[0] + bbox[2]) / 2
    LON0 = (bbox[1] + bbox[3]) / 2
    total_rows, segs = load_gov(gov_path, bbox)
    grid = build_grid(segs)
    by_name = defaultdict(list)
    for sg in segs:
        if sg["name"]:
            by_name[sg["name"]].append(sg)
    name_width = {}
    for nm, lst in by_name.items():
        ws = [(s["width"], s["len_field"] if s["len_field"] == s["len_field"] else s["chord"]) for s in lst]
        vals = [s["width"] for s in lst]
        name_width[nm] = {
            "median": weighted_median(ws), "min": min(vals), "max": max(vals),
            "distinct": len(set(vals)), "n": len(lst),
        }

    with open(osm_path, encoding="utf-8") as f:
        osm = json.load(f)

    tot = Counter()
    by_hw = defaultdict(Counter)
    unmatched_reason = Counter()
    final_w = defaultdict(list)       # H+S 寬度,依 highway
    hs_fallback_names = Counter()     # H 失敗、S 補上時 (OSM 名, 政府名)
    r_unmatched = Counter()
    unnamed_wide_len = 0.0           # R:無名 way 拿到 ≥ 20 m(疑似抓到旁邊幹道)
    link_wide_len = 0.0              # R:匝道拿到 ≥ 20 m(疑似抓到主線)
    divided_len = 0.0                 # 單行 + 主要道路 + 政府路寬 ≥ 20 m(疑似分隔幹道的單向 way)
    disagree = []          # N 與 H 都有寬度時的差
    osm_width_cmp = []     # OSM width 標籤 vs H
    spatial_name_agree = Counter()   # S 法:有名 OSM way 對到的樣本是否同名
    ambiguous_len = 0.0
    oneway_matched_len = 0.0
    curved_gov = 0
    results = []
    r_widths = {}          # 建置管線用:OSM way id → R 法寬度

    for el in osm["elements"]:
        if el.get("type") != "way":
            continue
        t = el.get("tags", {})
        if not is_drivable(t):
            continue
        pieces, L = osm_pieces(el, bbox)
        if L <= 0:
            continue
        hw = t["highway"]
        nm = norm_name(t.get("name", ""))
        smp = samples_of(pieces)
        tot["all"] += L
        by_hw[hw]["all"] += L
        if nm:
            tot["named"] += L

        # N
        n_width = name_width[nm]["median"] if nm in name_width else None
        if n_width is not None:
            tot["N"] += L
            by_hw[hw]["N"] += L
            if name_width[nm]["max"] - name_width[nm]["min"] > 3:
                ambiguous_len += L

        # S
        a, tl, ws, names = spatial_match(smp, segs, grid)
        s_width = weighted_median(ws) if tl and a / tl >= MIN_SAMPLE_SHARE else None
        if s_width is not None:
            tot["S"] += L
            by_hw[hw]["S"] += L
            if nm:
                same = names.get(nm, 0.0)
                spatial_name_agree["same"] += same
                spatial_name_agree["diff"] += sum(names.values()) - same

        # H
        if nm:
            a2, tl2, ws2, _ = spatial_match(smp, segs, grid, name_filter=nm)
        else:
            a2, tl2, ws2 = a, tl, ws
        h_width = weighted_median(ws2) if tl2 and a2 / tl2 >= MIN_SAMPLE_SHARE else None
        h_via = None
        if h_width is not None:
            h_via = "spatial+name" if nm else "spatial(unnamed)"
            tot["H"] += L
            by_hw[hw]["H"] += L
            if is_oneway(t):
                oneway_matched_len += L
        # 組合
        hn_width = h_width if h_width is not None else n_width
        if hn_width is not None:
            tot["H+N"] += L
            by_hw[hw]["H+N"] += L
        hs_width = h_width if h_width is not None else s_width
        if hs_width is not None:
            tot["H+S"] += L
            by_hw[hw]["H+S"] += L
            final_w[hw].append((hs_width, L))
            if h_width is None:
                hs_fallback_names[(nm, names.most_common(1)[0][0] if names else "")] += L
            if is_oneway(t) and hw in MAJOR and hs_width >= 20:
                divided_len += L
        # R(建議):H;H 對不到時,只有該名稱在政府資料中寬度一致(max-min ≤ 3 m)才退回 N
        r_width = h_width
        if r_width is None and n_width is not None and name_width[nm]["max"] - name_width[nm]["min"] <= 3:
            r_width = n_width
        if r_width is not None:
            r_widths[str(el["id"])] = {"w": r_width, "via": "H" if h_width is not None else "N"}
            tot["R"] += L
            by_hw[hw]["R"] += L
            if not nm and r_width >= 20:
                unnamed_wide_len += L
            if hw.endswith("_link") and r_width >= 20:
                link_wide_len += L
        else:
            if not nm:
                k = "無名稱、空間對不到" + ("(service)" if hw == "service" else "(非 service)")
            elif nm not in name_width:
                k = "有名稱、政府資料(範圍A±300m)無此名" + ("(含巷/弄)" if re.search("[巷弄]", nm) else "(不含巷/弄)")
            else:
                k = "有名稱且政府有此名,但空間對不到同名線段,且該名寬度不一致(>3 m)"
            r_unmatched[k] += L
        hsn_width = hs_width if hs_width is not None else n_width
        if hsn_width is not None:
            tot["H+S+N"] += L
            by_hw[hw]["H+S+N"] += L
        else:
            if not nm:
                unmatched_reason["無名稱且空間對不到(service)" if hw == "service" else "無名稱且空間對不到(非 service)"] += L
            elif nm not in name_width:
                unmatched_reason["有名稱但政府資料(範圍A±300m)無此名"] += L
            else:
                unmatched_reason["其他"] += L

        if n_width is not None and h_width is not None:
            disagree.append(abs(n_width - h_width))
        if h_width is not None and t.get("width"):
            try:
                osm_width_cmp.append((float(t["width"].replace("m", "").strip()), h_width, el["id"]))
            except ValueError:
                pass

        if len(results) < 50:
            results.append({
                "osm_id": el["id"], "highway": hw, "name": t.get("name", ""), "norm_name": nm,
                "oneway": is_oneway(t), "len_in_A_m": round(L, 1),
                "osm_lanes": t.get("lanes"), "osm_width": t.get("width"),
                "N_width": n_width,
                "N_name_widths": ({k: name_width[nm][k] for k in ("min", "max", "distinct", "n")}
                                  if nm in name_width else None),
                "S_width": s_width, "S_sample_share": round(a / tl, 2) if tl else None,
                "S_top_gov_names": [k for k, _ in names.most_common(2)],
                "H_width": h_width, "H_via": h_via,
                "H_sample_share": round(a2 / tl2, 2) if tl2 else None,
                "final_H_plus_S": hs_width,
                "final_H_plus_S_plus_N": hsn_width,
                "R_width(recommended)": r_width,
            })

    for sg in segs:
        if sg["len_field"] == sg["len_field"] and sg["len_field"] > 1.2 * sg["chord"] + 1:
            curved_gov += 1

    examples = {}
    for nm in EXAMPLE_NAMES:
        ways = Counter()
        for el in osm["elements"]:
            t = el.get("tags", {})
            if el.get("type") == "way" and norm_name(t.get("name", "")) == nm:
                ways[f"{t.get('highway')}|oneway={t.get('oneway', '')}"] += 1
        examples[nm] = {"gov_width_count_near_A": dict(sorted(Counter(s["width"] for s in by_name.get(nm, [])).items())),
                        "osm_ways_in_q01(highway|oneway)": dict(ways)}
    disagree.sort()
    stats = {
        "date": "2026-10-24",
        "params": {"area_A": AREA_A, "gov_buffer_m": GOV_BUFFER_M, "sample_step_m": SAMPLE_STEP_M,
                   "dist_tol_m": DIST_TOL_M, "max_angle_deg": MAX_ANGLE_DEG,
                   "min_sample_share": MIN_SAMPLE_SHARE},
        "gov_rows_total": total_rows,
        "gov_segments_near_A": len(segs),
        "gov_names_near_A": len(by_name),
        "gov_names_multi_width_near_A": sum(1 for v in name_width.values() if v["distinct"] > 1),
        "gov_names_width_range_gt3_near_A": sum(1 for v in name_width.values() if v["max"] - v["min"] > 3),
        "gov_segments_unnamed_near_A": sum(1 for s in segs if not s["name"]),
        "gov_segments_curved_near_A(len_field>1.2*chord+1)": curved_gov,
        "osm_drivable_len_A_m": round(tot["all"], 1),
        "osm_named_len_A_m": round(tot["named"], 1),
        "coverage_pct": {k: pct(tot[k], tot["all"]) for k in ("N", "S", "H", "H+N", "H+S", "H+S+N", "R")},
        "coverage_len_m": {k: round(tot[k], 1) for k in ("N", "S", "H", "H+N", "H+S", "H+S+N", "R")},
        "coverage_pct_excl_service": {
            k: pct(sum(v[k] for h, v in by_hw.items() if h != "service"),
                   sum(v["all"] for h, v in by_hw.items() if h != "service"))
            for k in ("N", "S", "H", "H+N", "H+S", "H+S+N", "R")},
        "by_highway": {h: {"len_m": round(v["all"], 1), **{k: pct(v[k], v["all"]) for k in ("N", "S", "H", "H+N", "H+S", "H+S+N", "R")}}
                       for h, v in sorted(by_hw.items(), key=lambda kv: -kv[1]["all"])},
        "N_ambiguous_len_pct_of_all(name width range>3m)": pct(ambiguous_len, tot["all"]),
        "H_oneway_matched_len_m": round(oneway_matched_len, 1),
        "R_unmatched_len_m": {k: round(v, 1) for k, v in r_unmatched.most_common()},
        "R_unmatched_pct_of_all": {k: pct(v, tot["all"]) for k, v in r_unmatched.most_common()},
        "R_unnamed_width_ge20_len_m": round(unnamed_wide_len, 1),
        "R_link_width_ge20_len_m": round(link_wide_len, 1),
        "HS_suspected_divided_oneway_major_len_m(width>=20)": round(divided_len, 1),
        "HS_width_wmedian_by_highway": {h: weighted_median(v) for h, v in sorted(final_w.items())},
        "HS_fallback_top(osm_name→gov_name, m)": [[a, b, round(L, 1)] for (a, b), L in hs_fallback_names.most_common(25)],
        "examples": examples,
        "S_named_sample_same_name_pct": pct(spatial_name_agree["same"],
                                            spatial_name_agree["same"] + spatial_name_agree["diff"]),
        "N_vs_H_abs_diff_m": {
            "n": len(disagree),
            "median": disagree[len(disagree) // 2] if disagree else None,
            "pct_le_1m": pct(sum(1 for d in disagree if d <= 1), len(disagree)),
            "pct_gt_3m": pct(sum(1 for d in disagree if d > 3), len(disagree)),
        },
        "osm_width_tag_vs_H": [{"osm_id": i, "osm_width": a, "gov_H": b} for a, b, i in osm_width_cmp],
        "H_S_N_unmatched_len_m": {k: round(v, 1) for k, v in unmatched_reason.most_common()},
        "H_S_N_unmatched_pct_of_all": {k: pct(v, tot["all"]) for k, v in unmatched_reason.most_common()},
    }
    if out_sample:
        with open(out_sample, "w", encoding="utf-8") as f:
            json.dump({"說明": "範圍 A 內 OSM 可行駛 way,依 q01_roads_B.json 檔案順序前 50 筆的比對結果;"
                              "欄位定義見 tools/research/road_width_match.py 開頭。",
                       "results": results}, f, ensure_ascii=False, indent=1)
    if out_stats:
        with open(out_stats, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=1)
    if out_widths:
        with open(out_widths, "w", encoding="utf-8") as f:
            json.dump({"說明": "政府路寬(計畫路寬,含人行道)依 R 法對應到 OSM way;w = 公尺,via = H(空間+同名)或 N(路名)。"
                              "由 tools/research/road_width_match.py --out-widths 產生;換算規則見 docs/decisions/0011。",
                       "gov_sha256_source": "data/gov/road-width/SOURCE.md",
                       "byOsmId": r_widths}, f, ensure_ascii=False)
    print_md(stats)
    return stats


def print_md(st):
    print(f"政府資料總列數:{st['gov_rows_total']};範圍 A ±{int(GOV_BUFFER_M)} m 內線段:{st['gov_segments_near_A']}"
          f"(不重複名稱 {st['gov_names_near_A']},無名稱線段 {st['gov_segments_unnamed_near_A']})")
    print(f"範圍 A OSM 可行駛道路總長:{st['osm_drivable_len_A_m'] / 1000:.2f} km(有 name {st['osm_named_len_A_m'] / 1000:.2f} km)\n")
    print("| 方法 | 覆蓋長度 km | 覆蓋率(全部) | 覆蓋率(不含 service) |")
    print("|---|---|---|---|")
    for k in ("N", "S", "H", "H+N", "H+S", "H+S+N", "R"):
        print(f"| {k} | {st['coverage_len_m'][k] / 1000:.2f} | {st['coverage_pct'][k]}% | {st['coverage_pct_excl_service'][k]}% |")
    print("\n| highway | 長度 km | N% | S% | H% | H+N% | H+S% | H+S+N% | R% |")
    print("|---|---|---|---|---|---|---|---|---|")
    for h, v in st["by_highway"].items():
        print(f"| {h} | {v['len_m'] / 1000:.2f} | {v['N']} | {v['S']} | {v['H']} | {v['H+N']} | {v['H+S']} | {v['H+S+N']} | {v['R']} |")
    print("\n其他:")
    for k in ("gov_names_multi_width_near_A", "gov_names_width_range_gt3_near_A",
              "gov_segments_curved_near_A(len_field>1.2*chord+1)",
              "N_ambiguous_len_pct_of_all(name width range>3m)", "H_oneway_matched_len_m",
              "R_unnamed_width_ge20_len_m", "R_link_width_ge20_len_m", "R_unmatched_len_m", "R_unmatched_pct_of_all",
              "HS_suspected_divided_oneway_major_len_m(width>=20)", "HS_width_wmedian_by_highway",
              "HS_fallback_top(osm_name→gov_name, m)",
              "S_named_sample_same_name_pct", "N_vs_H_abs_diff_m", "H_S_N_unmatched_len_m",
              "H_S_N_unmatched_pct_of_all"):
        print(f"- {k}: {st[k]}")
    print(f"- osm_width_tag_vs_H(共 {len(st['osm_width_tag_vs_H'])} 條): {st['osm_width_tag_vs_H'][:15]}")


def profile(path):
    """全檔欄位概況(不限範圍 A)。"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"總列數:{len(rows)}")
    print(f"欄位:{list(rows[0].keys())}")
    for k in ("圖名代碼", "地區", "速限", "路寬", "民國年", "道路型態分類"):
        c = Counter(r[k] for r in rows)
        print(f"- {k}:{len(c)} 種;前 12:{c.most_common(12)}")
    print(f"- 路名空白:{sum(1 for r in rows if not r['路名'].strip())} 列")
    print(f"- 巷非空:{sum(1 for r in rows if r['巷'])} 列;弄非空:{sum(1 for r in rows if r['弄'])} 列")
    print(f"- 速限非空:{sum(1 for r in rows if r['速限'])} 列")
    print(f"- 名稱含「?」(疑似罕用字轉碼遺失):{sum(1 for r in rows if '?' in r['路名'] + r['巷'] + r['弄'])} 列;"
          f"例:{Counter(r['路名'] for r in rows if '?' in r['路名']).most_common(5)}")
    ws = sorted(float(r["路寬"]) for r in rows)
    print(f"- 路寬 最小 {ws[0]}、中位數 {ws[len(ws) // 2]}、最大 {ws[-1]} m")
    ls = sorted(float(r["長度"]) for r in rows if r["長度"])
    print(f"- 長度(每列線段)中位數 {ls[len(ls) // 2]} m、最大 {ls[-1]} m、合計 {sum(ls) / 1000:.1f} km")
    return 0


def selftest():
    assert norm_name("台中路") == "臺中路"
    assert norm_name("臺灣大道 三段") == "臺灣大道三段"
    assert norm_name("中山路１２３巷") == "中山路123巷"          # 全形數字
    assert norm_name("東西向快速公路(台74)") == "東西向快速公路"
    assert norm_name("東西向快速公路(台74)") == "東西向快速公路"   # 全形括號
    assert norm_name("陜西東一街") == "陝西東一街"                    # 異體字
    assert norm_name("公舘路") == "公館路"
    assert gov_full_name("英才路", "170巷", "") == "英才路170巷"
    assert gov_full_name("西屯路二段", "297之8", "45") == "西屯路二段297之8巷45弄"
    assert gov_full_name("臺灣大道三段", "", "") == "臺灣大道三段"
    assert abs(point_seg(0, 5, -10, 0, 10, 0) - 5) < 1e-9
    assert abs(point_seg(13, 4, -10, 0, 10, 0) - 5) < 1e-9          # 落在端點外
    assert abs(angle_diff_deg(1, 0, -1, 0)) < 1e-9                    # 反向視為同向
    assert abs(angle_diff_deg(1, 0, 0, 1) - 90) < 1e-9
    assert weighted_median([(10, 1), (20, 3)]) == 20
    assert weighted_median([(10, 3), (20, 1)]) == 10
    # 投影:範圍 A 中心為原點,往北 0.01° ≈ 1112 m
    x, y = to_xy(LAT0 + 0.01, LON0)
    assert abs(x) < 1e-6 and abs(y - 1111.95) < 0.1, (x, y)
    # 空間比對:一條東西向 20 m 寬政府線段,OSM 平行偏 6 m 要對到、偏 15 m 對不到、垂直對不到
    segs = [{"name": "測試路", "width": 20.0, "a": (0.0, 0.0), "b": (100.0, 0.0), "chord": 100.0}]
    grid = build_grid(segs)
    a, tl, ws, _ = spatial_match([(50, 6, 1, 0, 10)], segs, grid)
    assert a == 10 and ws == [(20.0, 10)]
    a, *_ = spatial_match([(50, 15, 1, 0, 10)], segs, grid)
    assert a == 0
    a, *_ = spatial_match([(50, 2, 0, 1, 10)], segs, grid)
    assert a == 0
    a, *_ = spatial_match([(50, 2, 1, 0, 10)], segs, grid, name_filter="別的路")
    assert a == 0
    # is_drivable 與 roads.ts 一致的幾個關鍵案例
    assert is_drivable({"highway": "residential"})
    assert not is_drivable({"highway": "footway"})
    assert not is_drivable({"highway": "service", "service": "parking_aisle"})
    assert not is_drivable({"highway": "primary", "access": "private"})
    print("SELFTEST PASS")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gov")
    ap.add_argument("--osm")
    ap.add_argument("--out-sample")
    ap.add_argument("--out-stats")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--profile", action="store_true")
    ap.add_argument("--out-widths", help="建置管線用:輸出 {byOsmId: {id: {w, via}}}(R 法)")
    ap.add_argument("--bbox", help="南,西,北,東 經緯度(預設為舊範圍 A)")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.profile:
        return profile(a.gov)
    if not (a.gov and a.osm):
        ap.error("需要 --gov 與 --osm")
    bbox = tuple(map(float, a.bbox.split(","))) if a.bbox else AREA_A
    run(a.gov, a.osm, a.out_sample, a.out_stats, a.out_widths, bbox)
    return 0


if __name__ == "__main__":
    sys.exit(main())
