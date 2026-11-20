#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
臺中市千分之一道路圖(114 年版)的道路中心線 → OSM 道路:每向車道數、速限(decisions/0046)。
配對方法沿用 road_width_match.py 的 R 法(0011):
  H:OSM 每 10 m 取樣,找最近、同名(OSM 有名稱時)、夾角 ≤ 30°、距離 ≤ 政府路寬/2 + 4 m 的政府線段;
     ≥ 50% 樣本有對到才算;車道數、速限 = 對到樣本的長度加權中位數。
  P:同名線段只對到不到一半的樣本時,仍取對到的那些(長度加權中位數)。
  N:都對不到時,該名稱在政府資料裡的車道數全部一樣才用它(速限同理,各自判斷)。
  沒有名稱的 OSM way 不配(空間法會抓到旁邊主幹道)。
每向車道數 = max(左向, 右向)(資料裡兩欄幾乎都相同;單行道也是兩欄填同一個數)。

用法(python3 -I;只讀資料):
  python3 -I tools/research/road_lanes_match.py --gov data/gov/roads/centerline-114.csv \
      --osm data/osm/raw/range-a/range-a_area.json --out data/gov/roads/lanes-range-a.json
輸出:{"byOsmId": {id: {"n": 每向車道數, "spd": 速限 km/h, "via": "H"|"N"}}}(沒對到的欄位不寫)
"""
import argparse
import csv
import importlib.util
import json
import math
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("rwm", os.path.join(HERE, "road_width_match.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


def as_int(s):
    try:
        v = int(float(s))
        return v if v > 0 else None
    except ValueError:
        return None


def load(path, bbox):
    bx0, by0 = M.to_xy(bbox[0], bbox[1])
    bx1, by1 = M.to_xy(bbox[2], bbox[3])
    b = M.GOV_BUFFER_M
    segs = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                x0, y0, x1, y1 = (float(r[k]) for k in ("TM2度分帶97X坐標", "TM2度分帶97Y坐標", "EndX坐標", "EndY坐標"))
                width = float(r["路寬"])
            except (ValueError, KeyError):
                continue
            la0, lo0 = M.TWD.tm_inverse(x0, y0)
            la1, lo1 = M.TWD.tm_inverse(x1, y1)
            ax, ay = M.to_xy(la0, lo0)
            bx, by = M.to_xy(la1, lo1)
            if max(ax, bx) < bx0 - b or min(ax, bx) > bx1 + b or max(ay, by) < by0 - b or min(ay, by) > by1 + b:
                continue
            lanes = [v for v in (as_int(r["左向車道數"]), as_int(r["右向車道數"])) if v]
            segs.append({
                "name": M.gov_full_name(r["路名"], r["巷"], r["弄"]), "width": width,
                "n": max(lanes) if lanes else None, "spd": as_int(r["速限"]),
                "a": (ax, ay), "b": (bx, by), "chord": math.hypot(bx - ax, by - ay),
                "len": float(r["長度"]) if r["長度"] else math.hypot(bx - ax, by - ay),
            })
    return segs


def match(samples, segs, grid, name_filter):
    acc, tot, hits = 0.0, 0.0, []
    for x, y, dx, dy, w in samples:
        tot += w
        best, bestd = None, float("inf")
        for i in grid.get((int(math.floor(x / M.GRID_M)), int(math.floor(y / M.GRID_M))), ()):
            sg = segs[i]
            if name_filter and sg["name"] != name_filter:
                continue
            (ax, ay), (bx, by) = sg["a"], sg["b"]
            d = M.point_seg(x, y, ax, ay, bx, by)
            if d > sg["width"] / 2 + M.DIST_TOL_M or d >= bestd:
                continue
            if sg["chord"] > 0 and M.angle_diff_deg(dx, dy, bx - ax, by - ay) > M.MAX_ANGLE_DEG:
                continue
            best, bestd = sg, d
        if best is not None:
            acc += w
            hits.append((best, w))
    return hits, (acc / tot if tot else 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gov", required=True)
    ap.add_argument("--osm", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bbox", help="南,西,北,東 經緯度(預設為舊範圍 A)")
    a = ap.parse_args()
    bbox = tuple(map(float, a.bbox.split(","))) if a.bbox else M.AREA_A
    M.LAT0 = (bbox[0] + bbox[2]) / 2
    M.LON0 = (bbox[1] + bbox[3]) / 2
    segs = load(a.gov, bbox)
    grid = M.build_grid(segs)
    by_name = defaultdict(list)
    for s in segs:
        if s["name"]:
            by_name[s["name"]].append(s)
    osm = json.load(open(a.osm, encoding="utf-8"))
    out, stat, n_hist = {}, Counter(), Counter()
    for el in osm["elements"]:
        if el.get("type") != "way":
            continue
        t = el.get("tags", {})
        if not M.is_drivable(t):
            continue
        pieces, L = M.osm_pieces(el, bbox)
        if L <= 0:
            continue
        stat["all"] += L
        nm = M.norm_name(t.get("name", ""))
        # 沒有名稱的 way(匝道、服務道路)不配:空間法會抓到旁邊主幹道的車道數(0046 驗收:331 條)
        if not nm:
            stat["unnamed"] += L
            continue
        hits, share = match(M.samples_of(pieces), segs, grid, nm)
        rec = {}
        # H:≥ 50% 樣本對到同名線段;P:不到一半但有對到(例:臺灣大道四段在路口附近只對到幾個樣本)
        if hits:
            n = M.weighted_median([(s["n"], w) for s, w in hits if s["n"]])
            spd = M.weighted_median([(s["spd"], w) for s, w in hits if s["spd"]])
            if n:
                rec["n"] = n
            if spd:
                rec["spd"] = spd
            rec["via"] = "H" if share >= M.MIN_SAMPLE_SHARE else "P"
        # H 對不到、或對到的線段缺車道數 / 速限時:該名稱在政府資料裡的值全部一樣才用(0046 驗收:臺灣大道四段漏配)
        if nm in by_name and ("n" not in rec or "spd" not in rec):
            ns = {s["n"] for s in by_name[nm] if s["n"]}
            sps = {s["spd"] for s in by_name[nm] if s["spd"]}
            if "n" not in rec and len(ns) == 1:
                rec["n"] = ns.pop()
                rec.setdefault("via", "N")
            if "spd" not in rec and len(sps) == 1:
                rec["spd"] = sps.pop()
                rec.setdefault("via", "N")
        if "n" in rec:
            stat["n"] += L
            n_hist[rec["n"]] += L
        if "spd" in rec:
            stat["spd"] += L
        if rec:
            out[str(el["id"])] = rec
    json.dump({"說明": "臺中市千分之一道路圖(114 年版)道路中心線 → OSM way:n = 每向車道數、spd = 速限(km/h)、via = H(空間+同名)/ N(路名)。"
                       "由 tools/research/road_lanes_match.py 產生;見 docs/decisions/0046。", "byOsmId": out},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    pct = lambda k: round(100 * stat[k] / stat["all"], 1)
    print(f"可行駛道路 {stat['all'] / 1000:.1f} km;有車道數 {pct('n')}%、有速限 {pct('spd')}%(以長度計)")
    print("每向車道數(km):", {k: round(v / 1000, 1) for k, v in sorted(n_hist.items())})


if __name__ == "__main__":
    main()
