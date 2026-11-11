"""
產生 M0 路名測試點(tests/fixtures/road-name-points.json),只讀 OSM 原始資料,不經過遊戲的建置管線,
作為路名查詢的獨立對照。

挑選規則:M0 區域(歌劇院中心 ±450 m,留 50 m 邊界)內、可行駛且有名稱的道路,
每個路名取一條,用該路名最長的一段線段(≥ 40 m)的中點與方向;依線段長度排序取前 10 個路名。

用法:python3 -I tools/research/make_road_name_fixture.py data/osm/raw/m0/m0_area.json tests/fixtures/road-name-points.json
"""
import json, math, sys

CENTER = (24.16293, 120.64052)
HALF = 450.0
DRIVABLE = {"motorway","trunk","primary","secondary","tertiary","unclassified","residential","living_street",
            "service","motorway_link","trunk_link","primary_link","secondary_link","tertiary_link"}

def local_m(lat, lon):
    # 等距圓柱近似,只用來判斷是否在區域內(誤差遠小於 50 m 邊界)
    dy = (lat - CENTER[0]) * 111320.0
    dx = (lon - CENTER[1]) * 111320.0 * math.cos(math.radians(CENTER[0]))
    return dx, dy

def bearing(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def main(src, dst):
    els = json.load(open(src, encoding="utf-8"))["elements"]
    best = {}
    for e in els:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") not in DRIVABLE or not t.get("name") or t.get("area") == "yes":
            continue
        if t.get("access") in ("no", "private"):
            continue
        g = e["geometry"]
        for a, b in zip(g, g[1:]):
            ax, ay = local_m(a["lat"], a["lon"]); bx, by = local_m(b["lat"], b["lon"])
            mid = ((ax + bx) / 2, (ay + by) / 2)
            if abs(mid[0]) > HALF or abs(mid[1]) > HALF:
                continue
            length = math.hypot(bx - ax, by - ay)
            if length < 40:
                continue
            brg = bearing(a, b)
            if t.get("oneway") == "-1":
                brg = (brg + 180) % 360
            cur = best.get(t["name"])
            if not cur or length > cur["segLengthM"]:
                best[t["name"]] = {
                    "name": t["name"], "osmWayId": e["id"],
                    "lat": round((a["lat"] + b["lat"]) / 2, 7), "lon": round((a["lon"] + b["lon"]) / 2, 7),
                    "bearingDeg": round(brg, 1), "segLengthM": round(length, 1), "highway": t["highway"],
                }
    pts = sorted(best.values(), key=lambda p: -p["segLengthM"])[:10]
    out = {"source": src, "rule": __doc__.strip().splitlines()[3], "points": pts}
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(len(pts), "points ->", dst)
    for p in pts: print(p["name"], p["highway"], p["segLengthM"])

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
