#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
範圍 A(南西北東 = 24.130,120.630,24.175,120.695)內鐵道的高架/地面/地下結構統計。

資料:
  --rail   data/osm/raw/q06_rail_A.json(查詢檔 tools/research/queries/q06_rail_A.overpassql)。
           q06 抓不到時可改傳 data/osm/raw/q03_features_B.json(2026-10-11 快照,只有鐵道 way,沒有車站)。
  --roads  data/osm/raw/q01_roads_B.json(算高架鐵路跨越哪些道路,可省略)

用法:
  P=/Users/cooperfu/Projects/3D_Racing
  python3 -I $P/tools/research/range_a_rail.py --rail $P/data/osm/raw/q06_rail_A.json \
      --roads $P/data/osm/raw/q01_roads_B.json --json-out $P/data/osm/derived/range_a_rail.json \
      > $P/data/osm/derived/range_a_rail.md
  python3 -I $P/tools/research/range_a_rail.py --selftest

口徑:
  - 長度:每條線段以 Liang-Barsky 在經緯度平面裁切到範圍 A,再用 haversine 計長(與 osm_area_stats.py 相同)。
  - 結構分類(依 OSM 標籤,不推論):
      viaduct  = bridge=viaduct
      bridge   = bridge 為其他非 no 的值(yes 等)
      tunnel   = tunnel 為非 no 的值
      layer>0  = 沒有 bridge/tunnel 但 layer>0
      ground   = 以上皆非(OSM 未標示高架,不代表實際一定在地面)
  - 「軌道長度」是每條 way 長度相加;雙軌分畫成兩條 way 時,路廊長度約為軌道長度的一半(推論,另以最長單一軌道估計)。
  - 跨越道路:高架主線 way 與 q01 道路 way 的線段在平面上相交的點。道路本身若有 bridge/layer 也一併列出。
"""
import argparse
import json
import math
import os
import sys
from collections import defaultdict

BBOX_A = (24.130, 120.630, 24.175, 120.695)
R_EARTH = 6371008.8
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary",
         "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def clip_segment(lat1, lon1, lat2, lon2, bbox=BBOX_A):
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
                t0 = max(t0, t)
            else:
                if t < t0:
                    return None
                t1 = min(t1, t)
    return (y0 + t0 * dy, x0 + t0 * dx, y0 + t1 * dy, x0 + t1 * dx)


def clipped_segments(geom, bbox=BBOX_A):
    out = []
    for a, b in zip(geom, geom[1:]):
        if a is None or b is None:
            continue
        c = clip_segment(a["lat"], a["lon"], b["lat"], b["lon"], bbox)
        if c and (c[0] != c[2] or c[1] != c[3]):
            out.append(c)
    return out


def structure(t):
    if t.get("bridge") == "viaduct":
        return "viaduct"
    if t.get("bridge") not in (None, "no"):
        return "bridge"
    if t.get("tunnel") not in (None, "no"):
        return "tunnel"
    try:
        if float(t.get("layer", "0")) > 0:
            return "layer>0"
    except ValueError:
        pass
    return "ground"


def seg_intersect(a, b):
    """兩線段 (lat1,lon1,lat2,lon2) 在經緯度平面是否相交;回傳交點或 None。"""
    y1, x1, y2, x2 = a
    y3, x3, y4, x4 = b
    d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if d == 0:
        return None
    t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d
    u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (y1 + t * (y2 - y1), x1 + t * (x2 - x1))
    return None


def line_key(t):
    """主線歸類:有 name 用 name;無 name 的岔線/渡線依 railway+service 歸類。"""
    if t.get("service"):
        return f"{t.get('railway')}:{t.get('service')}(無主線名)" if not t.get("name") else f"{t['name']}:{t['service']}"
    return t.get("name") or f"{t.get('railway')}(無 name)"


def selftest():
    assert abs(haversine(24.0, 120.0, 25.0, 120.0) - math.pi * R_EARTH / 180) < 0.01
    c = clip_segment(24.15, 120.60, 24.15, 120.70)
    assert c and abs(c[1] - 120.630) < 1e-12 and abs(c[3] - 120.695) < 1e-12
    assert clip_segment(24.20, 120.60, 24.20, 120.70) is None
    assert structure({"bridge": "viaduct"}) == "viaduct"
    assert structure({"bridge": "yes", "layer": "1"}) == "bridge"
    assert structure({"layer": "1"}) == "layer>0"
    assert structure({"layer": "-1", "tunnel": "yes"}) == "tunnel"
    assert structure({"bridge": "no"}) == "ground"
    p = seg_intersect((0, 0, 1, 1), (0, 1, 1, 0))
    assert p and abs(p[0] - 0.5) < 1e-12 and abs(p[1] - 0.5) < 1e-12
    assert seg_intersect((0, 0, 1, 1), (0, 2, 1, 3)) is None
    print("SELFTEST PASS")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rail")
    ap.add_argument("--roads")
    ap.add_argument("--json-out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    rj = json.load(open(a.rail, encoding="utf-8"))
    print("# 範圍 A 鐵道結構統計\n")
    print(f"- 資料檔:{os.path.basename(a.rail)};OSM 快照 timestamp_osm_base = "
          f"{rj.get('osm3s', {}).get('timestamp_osm_base', 'not_stated')}")
    print(f"- 範圍 A bbox(南,西,北,東):{BBOX_A}\n")

    ways = []
    for el in rj["elements"]:
        if el.get("type") != "way":
            continue
        t = el.get("tags", {})
        if "railway" not in t or t["railway"] in ("station", "halt", "platform"):
            continue
        segs = clipped_segments(el.get("geometry", []))
        if not segs:
            continue
        L = sum(haversine(*s) for s in segs)
        ways.append({"id": el["id"], "tags": t, "segs": segs, "len": L, "struct": structure(t),
                     "key": line_key(t)})

    # 1. railway 類型 × 結構
    agg = defaultdict(lambda: defaultdict(float))
    for w in ways:
        agg[(w["tags"]["railway"], w["key"])][w["struct"]] += w["len"]
    structs = ["viaduct", "bridge", "layer>0", "tunnel", "ground"]
    print("## 1. 依 railway 類型 / 線名 / 結構的軌道長度(m,裁切到範圍 A)\n")
    print("| railway | 線名(或 service 類別) | " + " | ".join(structs) + " | 合計 | way 數 |")
    print("|---|---|" + "---:|" * (len(structs) + 2))
    nways = defaultdict(int)
    for w in ways:
        nways[(w["tags"]["railway"], w["key"])] += 1
    for k in sorted(agg, key=lambda k: (k[0], -sum(agg[k].values()))):
        row = agg[k]
        print(f"| {k[0]} | {k[1]} | " + " | ".join(f"{row.get(s, 0):.0f}" for s in structs)
              + f" | {sum(row.values()):.0f} | {nways[k]} |")

    # 2. 每條 way 的明細(主線 + 有高架標記者)
    print("\n## 2. way 明細(bridge / layer / tunnel 標籤原值)\n")
    print("| way | railway | name | service | bridge | layer | tunnel | 範圍 A 內長度 m | A 內南北界(lat) | A 內東西界(lon) |")
    print("|---|---|---|---|---|---|---|---:|---|---|")
    for w in sorted(ways, key=lambda w: (w["tags"]["railway"], -w["len"])):
        t = w["tags"]
        lats = [s[0] for s in w["segs"]] + [s[2] for s in w["segs"]]
        lons = [s[1] for s in w["segs"]] + [s[3] for s in w["segs"]]
        print(f"| {w['id']} | {t['railway']} | {t.get('name', 'not_stated')} | {t.get('service', '-')} | "
              f"{t.get('bridge', '-')} | {t.get('layer', '-')} | {t.get('tunnel', '-')} | {w['len']:.0f} | "
              f"{min(lats):.5f}–{max(lats):.5f} | {min(lons):.5f}–{max(lons):.5f} |")

    # 3. 主線(無 service 標籤、營運中)摘要
    print("\n## 3. 營運主線摘要(railway ∈ rail/subway/light_rail,無 service 標籤)\n")
    mains = defaultdict(list)
    for w in ways:
        t = w["tags"]
        if t["railway"] in ("rail", "subway", "light_rail") and not t.get("service"):
            mains[t.get("name", "not_stated")].append(w)
    main_summary = {}
    for name, ws in mains.items():
        tot = sum(w["len"] for w in ws)
        elev = sum(w["len"] for w in ws if w["struct"] in ("viaduct", "bridge", "layer>0"))
        longest = max(w["len"] for w in ws)
        lats = [p for w in ws for s in w["segs"] for p in (s[0], s[2])]
        lons = [p for w in ws for s in w["segs"] for p in (s[1], s[3])]
        # 端點:範圍 A 內最南與最北的點
        pts = [(s[0], s[1]) for w in ws for s in w["segs"]] + [(s[2], s[3]) for w in ws for s in w["segs"]]
        south = min(pts)
        north = max(pts)
        main_summary[name] = {"track_len_m": tot, "elevated_track_len_m": elev, "ways": len(ws),
                              "longest_single_way_m": longest, "lat_range": [min(lats), max(lats)],
                              "lon_range": [min(lons), max(lons)], "south_end": south, "north_end": north,
                              "structs": sorted({w["struct"] for w in ws}),
                              "layers": sorted({w["tags"].get("layer", "-") for w in ws})}
        print(f"- **{name}**:{len(ws)} 條 way,軌道長度合計 {tot:.0f} m,其中標為高架(viaduct/bridge/layer>0){elev:.0f} m"
              f"({elev / tot * 100:.1f}%);最長單一 way {longest:.0f} m;結構標籤 {main_summary[name]['structs']},"
              f"layer {main_summary[name]['layers']}")
        eps = 1e-9
        edge = sorted({(round(la, 5), round(lo, 5)) for la, lo in pts
                       if abs(la - BBOX_A[0]) < eps or abs(la - BBOX_A[2]) < eps
                       or abs(lo - BBOX_A[1]) < eps or abs(lo - BBOX_A[3]) < eps})
        main_summary[name]["bbox_edge_points"] = edge
        print(f"  - 範圍 A 內最南點 {south[0]:.5f},{south[1]:.5f};最北點 {north[0]:.5f},{north[1]:.5f}")
        print(f"  - 與範圍 A 邊界的交點(進出點,每條軌道各一):" + (";".join(f"{la},{lo}" for la, lo in edge) or "無"))

    # 4. 車站
    st = []
    for el in rj["elements"]:
        t = el.get("tags", {})
        if t.get("railway") in ("station", "halt", "stop") or t.get("public_transport") == "station":
            c = el.get("center") or ({"lat": el.get("lat"), "lon": el.get("lon")} if "lat" in el else None)
            if not c or not (BBOX_A[0] <= c["lat"] <= BBOX_A[2] and BBOX_A[1] <= c["lon"] <= BBOX_A[3]):
                continue
            st.append({"type": el["type"], "id": el["id"], "name": t.get("name", "not_stated"),
                       "railway": t.get("railway", "-"), "station": t.get("station", "-"),
                       "network": t.get("network", t.get("operator", "-")), "layer": t.get("layer", "-"),
                       "level": t.get("level", "-"), "lat": c["lat"], "lon": c["lon"]})
    print("\n## 4. 範圍 A 內車站(railway=station/halt/stop 或 public_transport=station)\n")
    if not st:
        print("not_stated(此資料檔沒有車站元素)")
    else:
        print("| 元素 | name | railway | station | network/operator | layer | level | lat,lon |\n|---|---|---|---|---|---|---|---|")
        seen = set()
        for s in sorted(st, key=lambda s: (s["network"], s["name"])):
            k = (s["name"], s["railway"], s["type"])
            if k in seen:
                continue
            seen.add(k)
            print(f"| {s['type']}/{s['id']} | {s['name']} | {s['railway']} | {s['station']} | {s['network']} | "
                  f"{s['layer']} | {s['level']} | {s['lat']:.5f},{s['lon']:.5f} |")

    # 5. route relation
    rels = [el for el in rj["elements"] if el.get("type") == "relation"
            and el.get("tags", {}).get("route") in ("train", "subway", "light_rail", "railway", "tracks")]
    print("\n## 5. route relation(只列標籤)\n")
    if not rels:
        print("not_stated(此資料檔沒有 relation)")
    else:
        names = defaultdict(int)
        for r in rels:
            t = r.get("tags", {})
            if t.get("route") == "train":  # 班次 relation 很多,只依名稱第一個詞(車種)計數
                names[("train", "(班次)", (t.get("name", "not_stated").split() or ["not_stated"])[0])] += 1
            else:
                names[(t.get("route", "-"), t.get("ref", "-"), t.get("name", "not_stated"))] += 1
        print("| route | ref | name(train 為車種) | 筆數 |\n|---|---|---|---:|")
        for k, v in sorted(names.items()):
            print(f"| {k[0]} | {k[1]} | {k[2]} | {v} |")

    # 6. 高架主線跨越道路
    crossings = {}
    if a.roads:
        roads = json.load(open(a.roads, encoding="utf-8"))
        rsegs = []
        for el in roads["elements"]:
            if el.get("type") != "way":
                continue
            t = el.get("tags", {})
            for s in clipped_segments(el.get("geometry", [])):
                rsegs.append((s, el["id"], t))
        print("\n## 6. 高架主線與道路的平面交叉點(OSM 線段相交;交點下方/上方即需要處理的路口)\n")
        for name, ws in mains.items():
            pts = []
            for w in ws:
                if w["struct"] not in ("viaduct", "bridge", "layer>0"):
                    continue
                for s in w["segs"]:
                    for rs, rid, rt in rsegs:
                        if max(rs[0], rs[2]) < min(s[0], s[2]) or min(rs[0], rs[2]) > max(s[0], s[2]):
                            continue
                        if max(rs[1], rs[3]) < min(s[1], s[3]) or min(rs[1], rs[3]) > max(s[1], s[3]):
                            continue
                        p = seg_intersect(s, rs)
                        if p:
                            pts.append({"rail_way": w["id"], "road_way": rid, "lat": p[0], "lon": p[1],
                                        "name": rt.get("name", "not_stated"), "highway": rt.get("highway"),
                                        "road_bridge": rt.get("bridge", "-"), "road_tunnel": rt.get("tunnel", "-"),
                                        "road_layer": rt.get("layer", "-")})
            crossings[name] = pts
            maj = [p for p in pts if p["highway"] in MAJOR]
            byname = defaultdict(list)
            for p in maj:
                byname[p["name"]].append(p)
            print(f"### {name}\n")
            print(f"- 高架軌道 way 與道路 way 的交點:{len(pts)} 個(雙軌各算一次;含 service/residential);"
                  f"其中主要道路(tertiary 以上)交點 {len(maj)} 個,涉及 {len(byname)} 個路名")
            if byname:
                print("\n| 路名 | highway | 交點數 | 代表交點 lat,lon | 道路 bridge/tunnel/layer |\n|---|---|---:|---|---|")
                for nm, ps in sorted(byname.items(), key=lambda kv: kv[1][0]["lat"]):
                    p = ps[0]
                    print(f"| {nm} | {p['highway']} | {len(ps)} | {p['lat']:.5f},{p['lon']:.5f} | "
                          f"{p['road_bridge']}/{p['road_tunnel']}/{p['road_layer']} |")
            print()

    if a.json_out:
        os.makedirs(os.path.dirname(a.json_out), exist_ok=True)
        out = {"source": os.path.basename(a.rail),
               "timestamp_osm_base": rj.get("osm3s", {}).get("timestamp_osm_base"),
               "by_type_line_struct": {f"{k[0]}|{k[1]}": dict(v) for k, v in agg.items()},
               "ways": [{"id": w["id"], "tags": w["tags"], "len_m": w["len"], "struct": w["struct"]} for w in ways],
               "mains": main_summary, "stations": st, "crossings": crossings}
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
