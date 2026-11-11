#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台中首批地標的 OSM 對照:元素 type/id、name、中心座標、輪廓面積、高度/樓層標籤。

用法(請用 python3 -I,資料檔用絕對路徑傳入):
  python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/osm_landmarks.py \
      --landmarks /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q04_landmarks_B.json \
      --followup  /Users/cooperfu/Projects/3D_Racing/data/osm/raw/q05_landmark_followup.json \
      --out-json  /Users/cooperfu/Projects/3D_Racing/data/osm/derived/landmarks.json

輸出:stdout 印 Markdown 表格;--out-json 存完整結果(可省略)。只讀資料,不執行下載內容。

口徑:
  - 每個地標對應哪些 OSM 元素寫死在下方 LANDMARKS(人工比對 q04 名稱查詢結果後選定;
    選擇理由寫在 note)。腳本會檢查這些元素確實存在於資料檔,不存在就回報 MISSING。
  - 面積:把經緯度以元素自身緯度做等距圓柱投影(x = R·cosφ0·Δλ, y = R·Δφ,R=6371008.8 m)後用
    鞋帶公式;multipolygon relation 依 outer/inner 角色把 member way 串成閉合環,面積 = Σouter − Σinner。
  - 中心座標:多邊形用面積加權形心;多個元素合併時再以面積加權;線狀(街道)用沿線長度中點;
    node 直接用座標。座標四捨五入到小數 5 位。
  - 「宮原眼科」OSM 只有 POI node;若該 node 落在 q05 抓到的某個建物多邊形內,該建物視為其輪廓
    (此對應屬「推論」,報告需標註)。
"""
import argparse
import json
import math
import sys

R_EARTH = 6371008.8

# (地標, 主要元素, 附屬元素, 說明)。type 用 OSM 原文 way/relation/node。
LANDMARKS = [
    ("臺中國家歌劇院", [("way", 222636759)], [], "building=public amenity=theatre"),
    ("臺中車站(新站)", [("way", 442234244)], [("way", 639082755)], "building=train_station;附屬=站前廣場"),
    ("臺中驛(舊站紅磚站房)", [("way", 223056023)], [], "historic=building"),
    ("臺中市政府(臺灣大道市政大樓)", [("way", 222413435)], [("relation", 4226837)], "附屬=type=site relation"),
    ("臺中市議會", [("way", 222636758)], [], ""),
    ("國立自然科學博物館", [("way", 219414222)],
     [("way", i) for i in range(936530136, 936530144)] + [("way", 219476253)],
     "主要=園區 leisure=park 多邊形;附屬=園區內 tourism=museum 無名建物 8 棟 + 熱帶雨林溫室"),
    ("國立臺灣美術館", [("way", 240137720)], [("relation", 8133795)], "主要=館舍建物;附屬=美術園區 park"),
    ("臺中公園(湖心亭)", [("relation", 10093212)], [("way", 322820685)], "主要=公園 multipolygon;附屬=湖心亭建物"),
    ("秋紅谷景觀生態公園", [("way", 224961782)], [], "OSM name=秋紅谷廣場"),
    ("草悟道", "NAME:草悟道:leisure=park", [], "由多段 leisure=park 組成,全部合併"),
    ("勤美誠品綠園道", [("way", 238733789)], [], ""),
    ("新光三越台中中港店", [("way", 148849083)], [], "OSM name 只有「新光三越」"),
    ("大遠百 Top City", [("way", 224955652)], [], ""),
    ("宮原眼科", [("node", 3124088457)], "CONTAINING_BUILDING", "OSM 只有 POI node(amenity=restaurant)"),
    ("第二市場", [("way", 271452260)], [], ""),
    ("審計新村", [("way", 560332944)], [("way", 480897552), ("node", 14191074301)], "主要=tourism=attraction 範圍"),
    ("一中街", "NAME:一中街:highway", [], "街道(線),非建物"),
    ("逢甲夜市", [("way", 450771065)], [], "amenity=marketplace 範圍"),
    ("東海大學路思義教堂", [("way", 227101621)], [], ""),
    ("臺中洲際棒球場", [("relation", 9106109)], [("way", 224591705), ("relation", 11527293)], "主要=building=stadium multipolygon"),
    ("中友百貨", [("relation", 7347107)], [("way", 223053792), ("way", 223053791), ("way", 223053794)], "主要=multipolygon;附屬=A/B/C 棟建物"),
    ("區域B最高建物:臺中之鑽(臺中商銀總部)", [("way", 1529973208)], [], "OSM 無 name,依位置(河南路/市政路口)與 height=182 對應,屬推論"),
]

KEEP_TAGS = ["name", "name:en", "name:zh", "official_name", "alt_name", "old_name", "building", "building:part",
             "amenity", "tourism", "leisure", "historic", "shop", "landuse", "highway", "height", "min_height",
             "building:levels", "building:levels:underground", "roof:shape", "roof:height", "roof:levels",
             "roof:colour", "building:colour", "building:material", "start_date", "architect", "wikidata",
             "wikipedia", "construction", "note", "heritage", "addr:street", "addr:housenumber"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def proj(points, lat0):
    k = math.cos(math.radians(lat0))
    return [(R_EARTH * k * math.radians(p[1]), R_EARTH * math.radians(p[0])) for p in points]


def ring_area_centroid(ring):
    """ring: [(lat,lon),...] 閉合或未閉合皆可。回傳 (面積 m²(正值), 形心 lat, 形心 lon)。"""
    if len(ring) < 3:
        return 0.0, None, None
    lat0 = sum(p[0] for p in ring) / len(ring)
    lon0 = sum(p[1] for p in ring) / len(ring)
    pts = proj([(p[0] - lat0, p[1] - lon0) for p in ring], lat0)
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        cr = x1 * y2 - x2 * y1
        a += cr
        cx += (x1 + x2) * cr
        cy += (y1 + y2) * cr
    a /= 2.0
    if a == 0:
        return 0.0, lat0, lon0
    cx /= (6 * a)
    cy /= (6 * a)
    k = math.cos(math.radians(lat0))
    clat = lat0 + math.degrees(cy / R_EARTH)
    clon = lon0 + math.degrees(cx / (R_EARTH * k))
    return abs(a), clat, clon


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def build_rings(segments):
    """把多段 [(lat,lon)...] 依端點串成閉合環。"""
    segs = [list(s) for s in segments if len(s) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += list(reversed(s))[1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = list(reversed(s))[:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        rings.append(cur)
    return rings


def geom_of(el):
    """回傳 dict:kind(point/line/polygon), area, clat, clon, length。"""
    if el["type"] == "node":
        return {"kind": "point", "area": None, "clat": el["lat"], "clon": el["lon"], "length": None}
    if el["type"] == "way":
        pts = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if len(pts) >= 4 and pts[0] == pts[-1] and "highway" not in el.get("tags", {}):
            a, la, lo = ring_area_centroid(pts)
            return {"kind": "polygon", "area": a, "clat": la, "clon": lo, "length": None}
        # 線:沿線長度中點
        segl = [haversine(*a, *b) for a, b in zip(pts, pts[1:])]
        L = sum(segl)
        half, acc = L / 2, 0.0
        mid = pts[0]
        for (a, b), l in zip(zip(pts, pts[1:]), segl):
            if acc + l >= half and l > 0:
                t = (half - acc) / l
                mid = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                break
            acc += l
        return {"kind": "line", "area": None, "clat": mid[0], "clon": mid[1], "length": L, "pts": pts}
    if el["type"] == "relation":
        outer, inner = [], []
        for m in el.get("members", []):
            if m.get("type") != "way" or "geometry" not in m:
                continue
            g = [(p["lat"], p["lon"]) for p in m["geometry"] if p]
            (inner if m.get("role") == "inner" else outer).append(g)
        if not outer:
            return {"kind": "relation-no-geometry", "area": None, "clat": None, "clon": None, "length": None}
        A = SX = SY = 0.0
        for r in build_rings(outer):
            a, la, lo = ring_area_centroid(r)
            A += a
            SX += a * la
            SY += a * lo
        for r in build_rings(inner):
            a, la, lo = ring_area_centroid(r)
            A -= a
            SX -= a * la
            SY -= a * lo
        return {"kind": "polygon", "area": A, "clat": SX / A if A else None, "clon": SY / A if A else None, "length": None}
    return {"kind": "unknown"}


def point_in_poly(lat, lon, pts):
    inside = False
    for (y1, x1), (y2, x2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > lat) != (y2 > lat):
            xi = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < xi:
                inside = not inside
    return inside


def combine(geoms):
    polys = [g for g in geoms if g["kind"] == "polygon" and g["area"]]
    if polys:
        A = sum(g["area"] for g in polys)
        return A, sum(g["area"] * g["clat"] for g in polys) / A, sum(g["area"] * g["clon"] for g in polys) / A
    lines = [g for g in geoms if g["kind"] == "line"]
    if lines:
        L = sum(g["length"] for g in lines)
        return None, sum(g["length"] * g["clat"] for g in lines) / L, sum(g["length"] * g["clon"] for g in lines) / L
    pts = [g for g in geoms if g.get("clat") is not None]
    if pts:
        return None, pts[0]["clat"], pts[0]["clon"]
    return None, None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--followup", required=True)
    ap.add_argument("--out-json")
    a = ap.parse_args()
    q4, q5 = load(a.landmarks), load(a.followup)
    idx = {}
    for src, d in (("q04", q4), ("q05", q5)):
        for el in d["elements"]:
            idx.setdefault((el["type"], el["id"]), (src, el))

    results = []
    for name, prim, extra, note in LANDMARKS:
        if isinstance(prim, str) and prim.startswith("NAME:"):
            # 規則格式 NAME:<name>:<key> 或 NAME:<name>:<key>=<value>
            _, nm, cond = prim.split(":")
            ck, _, cv = cond.partition("=")

            def ok(t):
                return t.get("name") == nm and ck in t and (not cv or t[ck] == cv)
            prim = sorted(k for k, (s, el) in idx.items() if ok(el.get("tags", {})))
        missing = [k for k in prim if k not in idx]
        found = [k for k in prim if k in idx]
        geoms = []
        elems = []
        for k in found:
            src, el = idx[k]
            g = geom_of(el)
            geoms.append(g)
            elems.append({"type": k[0], "id": k[1], "src": src, "kind": g["kind"],
                          "area_m2": round(g["area"]) if g.get("area") else None,
                          "length_m": round(g["length"]) if g.get("length") else None,
                          "tags": {t: el.get("tags", {}).get(t) for t in KEEP_TAGS if t in el.get("tags", {})}})
        area, clat, clon = combine(geoms)
        extras = []
        if extra == "CONTAINING_BUILDING":
            node = idx[found[0]][1]
            for k, (src, el) in idx.items():
                if src != "q05" or k[0] != "way" or "building" not in el.get("tags", {}):
                    continue
                pts = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
                if len(pts) >= 4 and point_in_poly(node["lat"], node["lon"], pts[:-1]):
                    g = geom_of(el)
                    extras.append({"type": k[0], "id": k[1], "relation_to_main": "POI node 位於此建物內(推論為其輪廓)",
                                   "area_m2": round(g["area"]), "clat": round(g["clat"], 5), "clon": round(g["clon"], 5),
                                   "tags": {t: el["tags"][t] for t in KEEP_TAGS if t in el["tags"]}})
            if extras:
                area = sum(e["area_m2"] for e in extras)
        else:
            for k in extra:
                if k not in idx:
                    extras.append({"type": k[0], "id": k[1], "missing": True})
                    continue
                src, el = idx[k]
                g = geom_of(el)
                extras.append({"type": k[0], "id": k[1], "kind": g["kind"],
                               "area_m2": round(g["area"]) if g.get("area") else None,
                               "clat": round(g["clat"], 5) if g.get("clat") else None,
                               "clon": round(g["clon"], 5) if g.get("clon") else None,
                               "tags": {t: el.get("tags", {}).get(t) for t in KEEP_TAGS if t in el.get("tags", {})}})
        results.append({
            "landmark": name, "found": bool(found), "missing_ids": missing, "note": note,
            "center": [round(clat, 5), round(clon, 5)] if clat is not None else None,
            "area_m2": round(area) if area else None,
            "elements": elems, "extras": extras,
        })

    print("| 地標 | OSM 元素 | OSM name | 中心 lat,lon | 輪廓面積 m² | height / levels |")
    print("|---|---|---|---|---:|---|")
    for r in results:
        ids = ", ".join(f"{e['type']}/{e['id']}" for e in r["elements"]) or "MISSING"
        nm = " / ".join(sorted({e["tags"].get("name", "(無 name)") for e in r["elements"]})) or "-"
        hl = "; ".join(f"h={e['tags'].get('height', '-')} lv={e['tags'].get('building:levels', '-')}" for e in r["elements"][:3])
        if len(r["elements"]) > 3:
            hl += f" …(共 {len(r['elements'])} 段)"
        c = f"{r['center'][0]:.5f},{r['center'][1]:.5f}" if r["center"] else "not_stated"
        ar = f"{r['area_m2']:,}" if r["area_m2"] else "not_stated"
        print(f"| {r['landmark']} | {ids} | {nm} | {c} | {ar} | {hl} |")
    print()
    for r in results:
        print(f"## {r['landmark']}  ({r['note']})")
        for e in r["elements"]:
            print("  -", json.dumps(e, ensure_ascii=False))
        for e in r["extras"]:
            print("  + 附屬", json.dumps(e, ensure_ascii=False))
    if a.out_json:
        with open(a.out_json, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        print("\n(已寫出", a.out_json, ")")


if __name__ == "__main__":
    sys.exit(main())
