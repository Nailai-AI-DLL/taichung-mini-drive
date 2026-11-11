#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大肚山台地(東海一帶)與臺中車站的海拔高差。兩個獨立來源互相對照:
  (1) OSM 內含 ele 標籤的測量點(內政部水準點/導線點/三角點等,來自 q03);
  (2) OpenTopoData SRTM 30m DEM(公開 API,一次請求)。用 (1) 的已知點檢查 (2) 的誤差。

用法:
  # 步驟 1:印出要查的 OpenTopoData URL(只印,不下載)
  python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/elevation_check.py \
      --features  /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q03_features_B.json \
      --landmarks /Users/cooperfu/Projects/3D_Racing/data/osm/derived/landmarks.json --print-url
  # 步驟 2:用 curl 把該 URL 存成 /Users/cooperfu/Projects/3D_Racing/data/osm/raw/elev_opentopodata_srtm30m.json
  # 步驟 3:產生報告
  python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/elevation_check.py \
      --features  /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q03_features_B.json \
      --landmarks /Users/cooperfu/Projects/3D_Racing/data/osm/derived/landmarks.json \
      --dem       /Users/cooperfu/Projects/3D_Racing/data/osm/raw/elev_opentopodata_srtm30m.json
"""
import argparse
import json
import math
import sys

R_EARTH = 6371008.8
TARGETS = ["臺中車站(新站)", "東海大學路思義教堂"]


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def survey_points(feat):
    out = []
    for el in feat["elements"]:
        if el["type"] != "node":
            continue
        t = el.get("tags", {})
        try:
            ele = float(t.get("ele", ""))
        except ValueError:
            continue
        if ele <= 0:  # 排除 ele=-1 之類明顯非海拔的值
            continue
        out.append({"id": el["id"], "lat": el["lat"], "lon": el["lon"], "ele": ele,
                    "name": t.get("name"), "kind": t.get("man_made") or t.get("natural") or t.get("tourism")})
    return out


def target_points(lms):
    pts = []
    for r in lms:
        if r["landmark"] in TARGETS and r["center"]:
            pts.append({"name": r["landmark"], "lat": r["center"][0], "lon": r["center"][1]})
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", required=True)
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--dem")
    ap.add_argument("--print-url", action="store_true")
    a = ap.parse_args()
    sp = survey_points(load(a.features))
    tp = target_points(load(a.landmarks))
    allpts = tp + sp
    if a.print_url:
        locs = "|".join(f"{p['lat']:.6f},{p['lon']:.6f}" for p in allpts)
        print("https://api.opentopodata.org/v1/srtm30m?locations=" + locs)
        return 0

    print("### OSM 測量點(ele>0)\n")
    print("| node | name | lat,lon | ele (m) |")
    print("|---|---|---|---:|")
    for p in sorted(sp, key=lambda p: -p["ele"]):
        print(f"| {p['id']} | {p['name']} | {p['lat']:.5f},{p['lon']:.5f} | {p['ele']} |")
    print("\n### 目標點最近的 OSM 測量點\n")
    for t in tp:
        near = sorted(sp, key=lambda p: haversine(t["lat"], t["lon"], p["lat"], p["lon"]))[:3]
        print(f"- {t['name']} ({t['lat']:.5f},{t['lon']:.5f}):", "; ".join(
            f"{p['name']} ele={p['ele']} 距 {haversine(t['lat'], t['lon'], p['lat'], p['lon']):.0f} m" for p in near))
    if a.dem:
        dem = load(a.dem)
        res = dem.get("results", [])
        print("\n### SRTM30m(OpenTopoData)\n")
        if len(res) != len(allpts):
            print("DEM 結果筆數與查詢點不符:", len(res), len(allpts))
            return 1
        errs = []
        for p, r in zip(allpts, res):
            p["dem"] = r.get("elevation")
        for p in tp:
            print(f"- {p['name']}: SRTM = {p['dem']} m")
        print("\n| 測量點 | OSM ele | SRTM | 差 (SRTM−OSM) |")
        print("|---|---:|---:|---:|")
        for p in sp:
            if p.get("dem") is None:
                continue
            d = p["dem"] - p["ele"]
            errs.append(d)
            print(f"| {p['name']} | {p['ele']} | {p['dem']} | {d:+.1f} |")
        if errs:
            mae = sum(abs(e) for e in errs) / len(errs)
            bias = sum(errs) / len(errs)
            print(f"\nSRTM 對 OSM 測量點:n={len(errs)},平均誤差(bias)={bias:+.1f} m,平均絕對誤差={mae:.1f} m")
        if len(tp) == 2 and all(p.get("dem") is not None for p in tp):
            st = next(p for p in tp if p["name"].startswith("臺中車站"))
            ch = next(p for p in tp if p["name"].startswith("東海"))
            print(f"\n高差(SRTM,路思義教堂 − 臺中車站)= {ch['dem'] - st['dem']:.1f} m")
        print(f"\nDEM 來源 dataset:{res[0].get('dataset') if res else 'not_stated'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
