#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OSM 台中市區資料品質統計(區域 A 核心 / 區域 B 擴大)。

用法(在任何目錄執行皆可,資料檔用絕對路徑傳入;請用 python3 -I):
  python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/osm_area_stats.py \
      --roads     /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q01_roads_B.json \
      --buildings /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q02_buildings_B.json \
      --features  /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q03_features_B.json \
      --out-json  /Users/cooperfu/Projects/3D_Racing/data/osm/derived/area_stats.json

輸出:stdout 印出 Markdown 表格;--out-json 另存完整數字(可省略)。
只用標準函式庫;只把下載檔當資料讀(json.load),不執行任何下載內容。

計算口徑(報告引用的數字皆以此為準):
  - 區域 A = 24.130,120.630,24.175,120.695;區域 B = 24.130,120.590,24.200,120.700(south,west,north,east)。
  - 道路:q01 抓的是「與 B 相交的 way 完整幾何」。每條線段先用 Liang-Barsky 在經緯度平面裁切到
    該區 bbox,再用 haversine(R=6371008.8 m)算裁切後長度。way 數 = 裁切後長度 > 0 的 way 數。
  - 「有 name 比例」等 = 有該標籤的道路長度 / 該類型總長度(依長度計)。
  - oneway 數量 = 有 oneway 標籤的 way 數;另列 oneway ∈ {yes,1,true,-1,reversible} 的 way 數。
  - 建物:building=* 且值不為 "no" 的 way/relation;以 Overpass 回傳的 center 是否落在 bbox 內歸屬區域。
  - 水系/鐵路長度同道路裁切法;公園以 center 歸屬。
"""
import argparse
import json
import math
import re
import sys
from collections import defaultdict, Counter

AREAS = {
    "A": (24.130, 120.630, 24.175, 120.695),
    "B": (24.130, 120.590, 24.200, 120.700),
}
ROAD_TYPES = [
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service",
]
ONEWAY_TRUE = {"yes", "1", "true", "-1", "reversible"}
R_EARTH = 6371008.8
WATER_TARGETS = ["柳川", "綠川", "梅川", "麻園頭溪", "筏子溪"]


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def clip_segment(lat1, lon1, lat2, lon2, bbox):
    """Liang-Barsky:回傳裁切後線段 (lat1,lon1,lat2,lon2) 或 None。x=lon, y=lat。"""
    s, w, n, e = bbox
    x0, y0, x1, y1 = lon1, lat1, lon2, lat2
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - w), (dx, e - x0), (-dy, y0 - s), (dy, n - y0)):
        if p == 0:
            if q < 0:
                return None
        else:
            t = q / p
            if p < 0:
                if t > t1:
                    return None
                if t > t0:
                    t0 = t
            else:
                if t < t0:
                    return None
                if t < t1:
                    t1 = t
    return (y0 + t0 * dy, x0 + t0 * dx, y0 + t1 * dy, x0 + t1 * dx)


def clipped_length(geom, bbox):
    total = 0.0
    for a, b in zip(geom, geom[1:]):
        c = clip_segment(a["lat"], a["lon"], b["lat"], b["lon"], bbox)
        if c:
            total += haversine(*c)
    return total


def in_bbox(lat, lon, bbox):
    s, w, n, e = bbox
    return s <= lat <= n and w <= lon <= e


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def pct(a, b):
    return (100.0 * a / b) if b else float("nan")


def road_stats(roads):
    out = {}
    for area, bbox in AREAS.items():
        per = {t: defaultdict(float) for t in ROAD_TYPES}
        names_len = defaultdict(float)          # 全部可行駛道路的 name → 長度
        names_ways = Counter()
        name_types = defaultdict(Counter)
        name_en = {}
        for el in roads["elements"]:
            if el["type"] != "way":
                continue
            tags = el.get("tags", {})
            hw = tags.get("highway")
            if hw not in per:
                continue
            L = clipped_length(el.get("geometry", []), bbox)
            if L <= 0:
                continue
            p = per[hw]
            p["ways"] += 1
            p["len"] += L
            if "name" in tags:
                p["len_name"] += L
                p["ways_name"] += 1
                names_len[tags["name"]] += L
                names_ways[tags["name"]] += 1
                name_types[tags["name"]][hw] += 1
                if "name:en" in tags:
                    name_en.setdefault(tags["name"], Counter())[tags["name:en"]] += 1
            if "name:en" in tags:
                p["len_name_en"] += L
            if "lanes" in tags:
                p["len_lanes"] += L
            if "oneway" in tags:
                p["oneway_tagged"] += 1
            if tags.get("oneway", "").lower() in ONEWAY_TRUE:
                p["oneway_true"] += 1
            if "maxspeed" in tags:
                p["len_maxspeed"] += L
            if "width" in tags:
                p["len_width"] += L
        out[area] = {
            "per_type": {t: dict(v) for t, v in per.items()},
            "names_len": dict(names_len),
            "names_ways": dict(names_ways),
            "name_types": {k: dict(v) for k, v in name_types.items()},
            "name_en": {k: v.most_common(1)[0][0] for k, v in name_en.items()},
        }
    return out


def naming_stats(roads, bbox):
    """路名用字慣例:臺/台、段。以可行駛道路、裁切後長度 > 0 的 way 計。"""
    c = Counter()
    names_tai = Counter()   # 含「台」的不重複路名
    names_tai2 = Counter()  # 含「臺」的不重複路名
    tw_variants = Counter()
    tw_len = defaultdict(float)
    duan = Counter()
    en_samples = {}
    for el in roads["elements"]:
        tags = el.get("tags", {})
        if tags.get("highway") not in ROAD_TYPES or "name" not in tags:
            continue
        L = clipped_length(el.get("geometry", []), bbox)
        if L <= 0:
            continue
        nm = tags["name"]
        c["named_ways"] += 1
        if "臺" in nm:
            c["has_臺"] += 1
            names_tai2[nm] += 1
        if "台" in nm:
            c["has_台"] += 1
            names_tai[nm] += 1
        m = re.match(r"^(臺灣大道|台灣大道)", nm)
        if m:
            tw_variants[nm] += 1
            tw_len[m.group(1)] += L
            if "name:en" in tags:
                en_samples.setdefault(nm, tags["name:en"])
        if re.search(r"[一二三四五六七八九十]+段", nm):
            c["has_段"] += 1
            if re.search(r"段$", nm):
                c["ends_段"] += 1
        if re.search(r"巷|弄", nm):
            c["has_巷弄"] += 1
        for k in ("name:zh", "name:zh-Hant", "name:zh-Hans", "alt_name", "old_name"):
            if k in tags:
                c["tag_" + k] += 1
    return {
        "counts": dict(c),
        "unique_names_with_台": dict(names_tai),
        "unique_names_with_臺_count": len(names_tai2),
        "unique_names_with_臺_sample": [k for k, _ in names_tai2.most_common(25)],
        "taiwan_blvd_variants": dict(tw_variants),
        "taiwan_blvd_len_m": dict(tw_len),
        "taiwan_blvd_name_en": en_samples,
    }


def building_stats(bld):
    out = {}
    seen = set()
    rows = []
    for el in bld["elements"]:
        key = (el["type"], el["id"])
        tags = el.get("tags", {})
        c = el.get("center")
        if not c:
            continue
        rows.append((key, tags, c))
    for area, bbox in AREAS.items():
        s = Counter()
        bseen = set()
        pseen = set()
        btype = Counter()
        for key, tags, c in rows:
            if not in_bbox(c["lat"], c["lon"], bbox):
                continue
            if "building" in tags and tags["building"] != "no" and key not in bseen:
                bseen.add(key)
                s["buildings"] += 1
                s["b_" + key[0]] += 1
                btype[tags["building"]] += 1
                h = "height" in tags
                lv = "building:levels" in tags
                if h or lv:
                    s["height_or_levels"] += 1
                if h:
                    s["height"] += 1
                if lv:
                    s["levels"] += 1
                if "name" in tags:
                    s["named"] += 1
                if "roof:shape" in tags:
                    s["roof_shape"] += 1
                if "building:colour" in tags:
                    s["building_colour"] += 1
                if "building:material" in tags:
                    s["building_material"] += 1
            if "building:part" in tags and key not in pseen:
                pseen.add(key)
                s["parts"] += 1
                if "height" in tags:
                    s["parts_height"] += 1
        out[area] = {"counts": dict(s), "building_values_top": btype.most_common(12)}
    out["raw_elements"] = len(bld["elements"])
    return out


def num(v):
    m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)", v or "")
    return float(m.group(1)) if m else None


def tallest(bld, bbox, n=12):
    rows = []
    for el in bld["elements"]:
        tags = el.get("tags", {})
        c = el.get("center")
        if not c or not in_bbox(c["lat"], c["lon"], bbox):
            continue
        rows.append({
            "type": el["type"], "id": el["id"], "name": tags.get("name"),
            "building": tags.get("building"), "building:part": tags.get("building:part"),
            "height": num(tags.get("height")), "levels": num(tags.get("building:levels")),
            "lat": round(c["lat"], 5), "lon": round(c["lon"], 5),
        })
    by_h = sorted([r for r in rows if r["height"] is not None], key=lambda r: -r["height"])[:n]
    by_l = sorted([r for r in rows if r["levels"] is not None and r["building"]], key=lambda r: -r["levels"])[:n]
    return {"by_height": by_h, "by_levels": by_l}


def feature_stats(feat):
    out = {}
    for area, bbox in AREAS.items():
        water = defaultdict(float)
        water_kind = defaultdict(set)
        rail = defaultdict(float)
        rail_ways = Counter()
        parks = []
        nat_water = 0
        for el in feat["elements"]:
            tags = el.get("tags", {})
            if el["type"] == "way" and "waterway" in tags and "geometry" in el:
                L = clipped_length(el["geometry"], bbox)
                if L > 0:
                    nm = tags.get("name", "(無名)")
                    water[nm] += L
                    water_kind[nm].add(tags["waterway"])
            if el["type"] == "way" and "railway" in tags and "geometry" in el:
                L = clipped_length(el["geometry"], bbox)
                if L > 0:
                    k = "%s|%s|%s" % (tags["railway"], tags.get("name", "(無名)"), tags.get("operator", ""))
                    rail[k] += L
                    rail_ways[k] += 1
            if tags.get("leisure") == "park" and "center" in el:
                if in_bbox(el["center"]["lat"], el["center"]["lon"], bbox):
                    parks.append(tags.get("name"))
            if tags.get("natural") == "water" and "center" in el:
                if in_bbox(el["center"]["lat"], el["center"]["lon"], bbox):
                    nat_water += 1
        out[area] = {
            "waterway_len_m": dict(water),
            "waterway_kind": {k: sorted(v) for k, v in water_kind.items()},
            "water_targets_present": {t: round(water.get(t, 0.0)) for t in WATER_TARGETS},
            "railway_len_m": dict(rail),
            "railway_ways": dict(rail_ways),
            "parks_count": len(parks),
            "parks_named": sum(1 for p in parks if p),
            "natural_water_count": nat_water,
        }
    routes = []
    for el in feat["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "relation" and "route" in tags:
            routes.append((tags.get("route"), tags.get("name"), tags.get("operator")))
    rc = Counter((r[0], r[2]) for r in routes)
    out["route_relations_by_type_operator"] = [[k[0], k[1], v] for k, v in rc.most_common()]
    out["route_relations_non_hsr"] = [r for r in routes if not (r[1] or "").startswith("台灣高鐵")]
    return out


def md_roads(rs):
    lines = []
    for area in ("A", "B"):
        per = rs[area]["per_type"]
        lines.append(f"\n### 區域 {area} 可行駛道路\n")
        lines.append("| highway | way 數 | 長度 km | name% (長度) | name:en% | lanes% | oneway 標籤 way 數 | oneway=yes/-1 way 數 |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        tot = defaultdict(float)
        for t in ROAD_TYPES:
            p = per[t]
            if not p.get("ways"):
                lines.append(f"| {t} | 0 | 0 | – | – | – | 0 | 0 |")
                continue
            for k, v in p.items():
                tot[k] += v
            lines.append("| %s | %d | %.2f | %.1f | %.1f | %.1f | %d | %d |" % (
                t, p["ways"], p["len"] / 1000, pct(p.get("len_name", 0), p["len"]),
                pct(p.get("len_name_en", 0), p["len"]), pct(p.get("len_lanes", 0), p["len"]),
                p.get("oneway_tagged", 0), p.get("oneway_true", 0)))
        lines.append("| **合計** | %d | %.2f | %.1f | %.1f | %.1f | %d | %d |" % (
            tot["ways"], tot["len"] / 1000, pct(tot["len_name"], tot["len"]),
            pct(tot["len_name_en"], tot["len"]), pct(tot["len_lanes"], tot["len"]),
            tot["oneway_tagged"], tot["oneway_true"]))
        ns = {k: tot[k] for k in tot if k != "len"}
        # 不含 service 的口徑(service 多為停車場/巷內通道,常無名)
        t2 = defaultdict(float)
        for t in ROAD_TYPES:
            if t == "service":
                continue
            for k, v in per[t].items():
                t2[k] += v
        lines.append("| 合計(不含 service) | %d | %.2f | %.1f | %.1f | %.1f | %d | %d |" % (
            t2["ways"], t2["len"] / 1000, pct(t2["len_name"], t2["len"]),
            pct(t2["len_name_en"], t2["len"]), pct(t2["len_lanes"], t2["len"]),
            t2["oneway_tagged"], t2["oneway_true"]))
        lines.append("")
        lines.append("maxspeed%% (長度,全類型) = %.1f;width%% = %.1f" % (
            pct(tot["len_maxspeed"], tot["len"]), pct(tot["len_width"], tot["len"])))
    return "\n".join(lines)


def top_names(rs, area="A", types=("trunk", "primary", "secondary"), n=30, roads=None):
    bbox = AREAS[area]
    acc = defaultdict(float)
    kinds = defaultdict(Counter)
    en = {}
    for el in roads["elements"]:
        tags = el.get("tags", {})
        if tags.get("highway") not in types or "name" not in tags:
            continue
        L = clipped_length(el.get("geometry", []), bbox)
        if L <= 0:
            continue
        acc[tags["name"]] += L
        kinds[tags["name"]][tags["highway"]] += 1
        if "name:en" in tags:
            en.setdefault(tags["name"], tags["name:en"])
    ranked = sorted(acc.items(), key=lambda kv: -kv[1])
    unnamed = 0.0
    for el in roads["elements"]:
        tags = el.get("tags", {})
        if tags.get("highway") in types and "name" not in tags:
            unnamed += clipped_length(el.get("geometry", []), bbox)
    return ranked, kinds, en, unnamed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roads", required=True)
    ap.add_argument("--buildings", required=True)
    ap.add_argument("--features", required=True)
    ap.add_argument("--out-json")
    a = ap.parse_args()

    roads = load(a.roads)
    bld = load(a.buildings)
    feat = load(a.features)
    res = {"osm_base": {
        "roads": roads.get("osm3s", {}).get("timestamp_osm_base"),
        "buildings": bld.get("osm3s", {}).get("timestamp_osm_base"),
        "features": feat.get("osm3s", {}).get("timestamp_osm_base"),
    }}
    rs = road_stats(roads)
    res["roads"] = {k: {"per_type": v["per_type"]} for k, v in rs.items()}
    print("# OSM 台中區域統計(由 osm_area_stats.py 產生)\n")
    print("OSM 資料時間戳:", json.dumps(res["osm_base"], ensure_ascii=False))
    print(md_roads(rs))

    print("\n### 區域 A trunk/primary/secondary 路名(依裁切後總長度,去重 = 完全相同 name)\n")
    ranked, kinds, en, unnamed = top_names(rs, roads=roads)
    print("| # | name | 長度 km | highway 類型(way 數) | name:en(第一個) |")
    print("|---:|---|---:|---|---|")
    for i, (nm, L) in enumerate(ranked[:30], 1):
        k = ", ".join(f"{t}×{c}" for t, c in kinds[nm].most_common())
        print(f"| {i} | {nm} | {L/1000:.2f} | {k} | {en.get(nm, 'not_stated')} |")
    print(f"\n不同路名總數 = {len(ranked)};無 name 的 trunk/primary/secondary 長度 = {unnamed/1000:.2f} km")
    res["top_names_A"] = [[nm, round(L, 1), dict(kinds[nm]), en.get(nm)] for nm, L in ranked]
    res["top_names_A_unnamed_m"] = round(unnamed, 1)

    print("\n### 路名用字慣例\n")
    res["naming"] = {}
    for area, bbox in AREAS.items():
        ns = naming_stats(roads, bbox)
        res["naming"][area] = ns
        print(f"- 區域 {area}:", json.dumps(ns, ensure_ascii=False))

    bs = building_stats(bld)
    res["buildings"] = bs
    print("\n### 建物\n")
    print("| 區域 | building 數 | (way / relation) | 有 height 或 levels | 有 height | 有 levels | 有 name | roof:shape | building:colour | building:part 數(有 height) |")
    print("|---|---:|---|---:|---:|---:|---:|---:|---:|---|")
    for area in ("A", "B"):
        c = bs[area]["counts"]
        n = c.get("buildings", 0)
        print("| %s | %d | %d / %d | %d (%.1f%%) | %d (%.1f%%) | %d (%.1f%%) | %d (%.1f%%) | %d | %d | %d (%d) |" % (
            area, n, c.get("b_way", 0), c.get("b_relation", 0),
            c.get("height_or_levels", 0), pct(c.get("height_or_levels", 0), n),
            c.get("height", 0), pct(c.get("height", 0), n),
            c.get("levels", 0), pct(c.get("levels", 0), n),
            c.get("named", 0), pct(c.get("named", 0), n),
            c.get("roof_shape", 0), c.get("building_colour", 0),
            c.get("parts", 0), c.get("parts_height", 0)))
    for area in ("A", "B"):
        print(f"- 區域 {area} building 值前 12:", bs[area]["building_values_top"])

    tb = tallest(bld, AREAS["B"])
    res["tallest_B"] = tb
    print("\n### 區域 B 依 OSM height 前 12(含 building:part)\n")
    for r in tb["by_height"]:
        print("-", json.dumps(r, ensure_ascii=False))
    print("\n### 區域 B 依 building:levels 前 12(僅 building=*)\n")
    for r in tb["by_levels"]:
        print("-", json.dumps(r, ensure_ascii=False))

    fs = feature_stats(feat)
    res["features"] = fs
    print("\n### 水系 / 鐵路 / 公園\n")
    for area in ("A", "B"):
        f = fs[area]
        print(f"- 區域 {area} 指定水系長度(m,裁切後;0 = 不存在):", json.dumps(f["water_targets_present"], ensure_ascii=False))
        top_w = sorted(f["waterway_len_m"].items(), key=lambda kv: -kv[1])[:15]
        print(f"- 區域 {area} 水道長度前 15:", ", ".join(f"{k}({'/'.join(f['waterway_kind'][k])}) {v/1000:.2f}km" for k, v in top_w))
        print(f"- 區域 {area} 鐵路(railway|name|operator → km, way 數):")
        for k, v in sorted(f["railway_len_m"].items(), key=lambda kv: -kv[1]):
            print(f"    - {k}: {v/1000:.2f} km, {f['railway_ways'][k]} ways")
        print(f"- 區域 {area} leisure=park:{f['parks_count']}(有名 {f['parks_named']});natural=water:{f['natural_water_count']}")
    print("- 鐵路 route relation(route, operator, 數量):", fs["route_relations_by_type_operator"])
    print("- 非高鐵 route relation:", fs["route_relations_non_hsr"])

    if a.out_json:
        import os
        os.makedirs(os.path.dirname(a.out_json), exist_ok=True)
        with open(a.out_json, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
        print("\n(已寫出", a.out_json, ")")


if __name__ == "__main__":
    sys.exit(main())
