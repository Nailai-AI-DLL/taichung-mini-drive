#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
紅綠燈位置檢查(decisions/0047):遊戲依規則放的號誌(world.json furniture.signals)vs OSM 號誌點
(highway=traffic_signals,tools/map-build/queries/range_a_signals.overpassql)。
兩邊各自把 CLUSTER_M 公尺內的點併成一個路口,再以 MATCH_M 公尺內算同一個路口。
路口名稱用臺中市道路圖的交叉路口點(R0005,data/gov/roads/shp/junction)最近的一點(NAME_M 內)。
注意:OSM 號誌點是志工標的,也可能漏標;「OSM 有、遊戲沒有」比較可信,「遊戲有、OSM 沒有」要人工判斷。

用法:python3 -I tools/research/signal_check.py <world.json> <signals.json> <junction.dbf> <輸出.json> <輸出.png>
"""
import json
import math
import struct
import sys
from collections import Counter

world_p, sig_p, junc_p, out_json, out_png = sys.argv[1:6]
CLUSTER_M, MATCH_M, NAME_M = 35.0, 50.0, 40.0

# ---- TWD97 TM2 正算(GRS80;和遊戲 src/map/projection.ts 同一個投影)----
a = 6378137.0
f = 1 / 298.257222101
k0, lon0, E0 = 0.9999, math.radians(121), 250000
e2 = f * (2 - f)
ep2 = e2 / (1 - e2)


def _M(p):
    return a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * p)
                + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * p) - (35 * e2 ** 3 / 3072) * math.sin(6 * p))


def tm2(lat, lon):
    p, l = math.radians(lat), math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    T, C, A = math.tan(p) ** 2, ep2 * math.cos(p) ** 2, (l - lon0) * math.cos(p)
    x = E0 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120)
    y = k0 * (_M(p) + N * math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return x, y


world = json.load(open(world_p, encoding="utf-8"))
oe, on = world["meta"]["origin"]["e"], world["meta"]["origin"]["n"]
x0, z0, x1, z1 = world["meta"]["bounds"]


def to_world(e, n):
    return e - oe, -(n - on)


def cluster(pts):
    """貪婪併點:每個點併進 CLUSTER_M 內已有的群(以群中心判斷)"""
    cs = []
    for p in pts:
        for c in cs:
            if math.hypot(c["x"] - p[0], c["z"] - p[1]) < CLUSTER_M:
                c["n"] += 1
                c["x"] += (p[0] - c["x"]) / c["n"]
                c["z"] += (p[1] - c["z"]) / c["n"]
                break
        else:
            cs.append({"x": p[0], "z": p[1], "n": 1})
    return cs


# 遊戲號誌桿
fs = world["furniture"]["signals"]
game = cluster([(fs[i] / 10, fs[i + 1] / 10) for i in range(0, len(fs), 4)])
# OSM 路口號誌點(不含只有行人穿越道號誌的)
osm_pts = []
for el in json.load(open(sig_p, encoding="utf-8"))["elements"]:
    if el.get("tags", {}).get("highway") != "traffic_signals":
        continue
    x, z = to_world(*tm2(el["lat"], el["lon"]))
    if x0 <= x <= x1 and z0 <= z <= z1:
        osm_pts.append((x, z))
osm = cluster(osm_pts)

# 道路圖交叉路口點(只取範圍內)
junc = []
fh = open(junc_p, "rb")
h = fh.read(32)
nrec, hl, rl = struct.unpack("<IHH", h[4:12])
fd = fh.read(hl - 32)
fields, off, p = {}, 1, 0
while p + 32 <= len(fd) and fd[p] != 0x0D:
    fields[fd[p:p + 11].split(b"\0")[0].decode()] = (off, fd[p + 16])
    off += fd[p + 16]
    p += 32
fh.seek(hl)
data = fh.read(nrec * rl)
g = lambda r, k: r[fields[k][0]:fields[k][0] + fields[k][1]].decode("utf-8", "replace").strip()
for i in range(nrec):
    r = data[i * rl:(i + 1) * rl]
    try:
        x, z = to_world(float(g(r, "R5D")), float(g(r, "R5E")))
    except ValueError:
        continue
    if x0 - 50 <= x <= x1 + 50 and z0 - 50 <= z <= z1 + 50:
        junc.append((x, z, g(r, "R5B"), g(r, "R5C")))


def name_of(c):
    best, bd = "", NAME_M
    for x, z, a_, b_ in junc:
        d = math.hypot(x - c["x"], z - c["z"])
        if d < bd and a_ != b_:
            best, bd = f"{a_} × {b_}", d
    return best


def near(c, cs):
    return any(math.hypot(c["x"] - o["x"], c["z"] - o["z"]) < MATCH_M for o in cs)


both = [c for c in game if near(c, osm)]
extra = [c for c in game if not near(c, osm)]
missing = [c for c in osm if not near(c, game)]
for c in extra + missing:
    c["name"] = name_of(c)
    c["x"], c["z"] = round(c["x"], 1), round(c["z"], 1)
res = {
    "說明": "遊戲號誌路口 vs OSM 號誌路口(highway=traffic_signals);由 tools/research/signal_check.py 產生,見 docs/decisions/0047",
    "game": len(game), "osm": len(osm), "both": len(both), "extra_in_game": len(extra), "missing_in_game": len(missing),
    "missing": sorted(missing, key=lambda c: -c["n"]), "extra": extra,
}
json.dump(res, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"遊戲號誌路口 {len(game)}、OSM 號誌路口 {len(osm)};兩邊都有 {len(both)};只有遊戲有 {len(extra)};只有 OSM 有 {len(missing)}")

# 地圖(灰 = 道路;綠 = 兩邊都有;紅 = 遊戲少了;橘 = 遊戲多的)
try:
    from PIL import Image, ImageDraw
    S = 0.3  # 每公尺像素
    W, H = int((x1 - x0) * S), int((z1 - z0) * S)
    im = Image.new("RGB", (W, H), (250, 250, 248))
    d = ImageDraw.Draw(im)
    P = lambda x, z: ((x - x0) * S, (z - z0) * S)
    for r in world["roads"]:
        pts = [P(r["pts"][i] / 10, r["pts"][i + 1] / 10) for i in range(0, len(r["pts"]), 2)]
        if len(pts) > 1:
            d.line(pts, fill=(200, 200, 200), width=max(1, int(r["width"] * S * 0.5)))
    for cs, col in ((both, (40, 170, 70)), (extra, (240, 150, 20)), (missing, (220, 40, 40))):
        for c in cs:
            x, y = P(c["x"], c["z"])
            d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col)
    im.save(out_png)
except ImportError:
    pass
