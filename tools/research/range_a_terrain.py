#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
範圍 A(南西北東 = 24.130,120.630,24.175,120.695)地形檢查:用內政部 20 m DTM 統計高程與道路坡度。

資料:
  --dem-zip  內政部 20 公尺網格數值地形模型「分幅_臺中市DEM.zip」(TGOS,政府資料開放授權第 1 版)
             下載網址見 data/elevation/moi_dtm20_index/moi_dtm20_index.csv(由 data.gov.tw 資料集 35430 取得)
             直接從 zip 讀數值,不解壓、不執行任何內容。
  --roads    data/osm/raw/q01_roads_B.json(Overpass,OSM 快照 2026-10-11T13:27:05Z)
  --features data/osm/raw/q03_features_B.json(取 ele 標籤測量點,用來檢查 DTM)
  --srtm     data/osm/raw/elev_opentopodata_srtm30m.json(既有 SRTM 29 點,交叉比對用,可省略)

用法(輸出 markdown 到 stdout,另寫 JSON 摘要):
  P=/Users/cooperfu/Projects/3D_Racing
  python3 -I $P/tools/research/range_a_terrain.py \
      --dem-zip  $P/data/elevation/moi_dtm20_taichung/taichung_dem20.zip \
      --roads    $P/data/osm/raw/q01_roads_B.json \
      --features $P/data/osm/raw/q03_features_B.json \
      --json-out $P/data/elevation/derived/range_a_terrain.json \
      > $P/data/elevation/derived/range_a_terrain.md
  python3 -I $P/tools/research/range_a_terrain.py --selftest      # 坐標轉換與內插自我檢查

方法:
  1. 讀每個圖幅 .hdr(西南角 E/N、行列數、網格間距),挑出與範圍 A 的 TM2 外框相交的圖幅,讀 .grd(E N Z 三欄,-999 為無值)。
  2. 每個網格點以 TM2(EPSG:3826)反算經緯度,只保留落在範圍 A bbox 內的點 → 高程統計、分位數、平面擬合殘差。
  3. 道路:OSM highway ∈ {motorway,trunk,primary,secondary,tertiary 與其 _link},幾何裁切到範圍 A,
     沿線每 50 m 取樣,雙線性內插 DTM 高程,算相鄰取樣點坡度;另以 200 m 窗格再算一次,降低 20 m 網格雜訊。
     bridge / tunnel / layer≠0 的路段另列(DTM 是地面高,不是橋面高,這些路段的坡度無意義)。
"""
import argparse
import bisect
import json
import math
import os
import sys
import zipfile

BBOX_A = (24.130, 120.630, 24.175, 120.695)  # 南, 西, 北, 東
R_EARTH = 6371008.8
NEAR_EXCL_M = 80  # 陡坡段中點距水道/橋節點小於此值時,於第三張表排除
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary",
         "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}

# ---------- TWD97 TM2 121 分帶(EPSG:3826)----------
A_ELL = 6378137.0
F_ELL = 1 / 298.257222101
K0 = 0.9999
LON0 = math.radians(121.0)
FE = 250000.0
E2 = F_ELL * (2 - F_ELL)
EP2 = E2 / (1 - E2)


def _meridian_arc(phi):
    e2 = E2
    return A_ELL * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
                    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
                    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
                    - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))


def tm_forward(lat, lon):
    phi, lam = math.radians(lat), math.radians(lon)
    n = A_ELL / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = EP2 * math.cos(phi) ** 2
    a = (lam - LON0) * math.cos(phi)
    m = _meridian_arc(phi)
    x = FE + K0 * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * EP2) * a ** 5 / 120)
    y = K0 * (m + n * math.tan(phi) * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
                                       + (61 - 58 * t + t ** 2 + 600 * c - 330 * EP2) * a ** 6 / 720))
    return x, y


def tm_inverse(x, y):
    m = y / K0
    mu = m / (A_ELL * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    c1 = EP2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = A_ELL / math.sqrt(1 - E2 * math.sin(phi1) ** 2)
    r1 = A_ELL * (1 - E2) / (1 - E2 * math.sin(phi1) ** 2) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                  + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def in_bbox(lat, lon, b=BBOX_A):
    return b[0] <= lat <= b[2] and b[1] <= lon <= b[3]


# ---------- DTM ----------
class Dtm:
    """以 (E, N) → Z 字典存 20 m 網格;雙線性內插。"""

    def __init__(self):
        self.z = {}
        self.step = 20
        self.tiles = []

    def get(self, e, n):
        return self.z.get((e, n))

    def sample(self, x, y):
        s = self.step
        e0 = math.floor(x / s) * s
        n0 = math.floor(y / s) * s
        fx, fy = (x - e0) / s, (y - n0) / s
        q = [self.get(e0, n0), self.get(e0 + s, n0), self.get(e0, n0 + s), self.get(e0 + s, n0 + s)]
        if any(v is None for v in q):
            return None
        return (q[0] * (1 - fx) * (1 - fy) + q[1] * fx * (1 - fy) + q[2] * (1 - fx) * fy + q[3] * fx * fy)

    def sample_ll(self, lat, lon):
        return self.sample(*tm_forward(lat, lon))


def parse_hdr(text):
    v = [ln.strip() for ln in text.splitlines()]
    # 依 schema_hdr.csv:圖幅號碼, 平面基準, (高程基準), 比例尺, 單位, dx, dy, 行數, 列數, 總點數…
    # 實際檔案:第 0 行圖號、1 TWD97、2 WGS84(此欄位文字與 schema 不一致,照原樣記錄)、3 5000、4 m、5 dx、6 dy、
    # 7 行數、8 列數、9/10 總點數、11/12 西南角 E/N、13/14 東北角 E/N
    return {"sheet": v[0], "dx": int(v[5]), "dy": int(v[6]), "ncols": int(v[7]), "nrows": int(v[8]),
            "sw_e": int(v[11]), "sw_n": int(v[12]), "ne_e": int(v[13]), "ne_n": int(v[14]),
            "date": v[22] if len(v) > 22 else "not_stated"}


def load_dtm(zip_path, bbox=BBOX_A, margin=100):
    corners = [tm_forward(la, lo) for la in (bbox[0], bbox[2]) for lo in (bbox[1], bbox[3])]
    xmin = min(c[0] for c in corners) - margin
    xmax = max(c[0] for c in corners) + margin
    ymin = min(c[1] for c in corners) - margin
    ymax = max(c[1] for c in corners) + margin
    dtm = Dtm()
    z = zipfile.ZipFile(zip_path)
    names = [i.filename for i in z.infolist()]
    hdrs = [n for n in names if n.endswith("dem.hdr")]
    nodata = 0
    for h in hdrs:
        meta = parse_hdr(z.read(h).decode("big5", "replace"))
        if meta["ne_e"] < xmin or meta["sw_e"] > xmax or meta["ne_n"] < ymin or meta["sw_n"] > ymax:
            continue
        assert meta["dx"] == 20 and meta["dy"] == 20, meta
        grd = h[:-4] + ".grd"
        cnt = 0
        for ln in z.read(grd).decode("ascii").splitlines():
            p = ln.split()
            if len(p) != 3:
                continue
            e, n, zz = int(float(p[0])), int(float(p[1])), float(p[2])
            if zz <= -999:
                nodata += 1
                continue
            dtm.z[(e, n)] = zz  # 圖幅邊界重複點:值相同時覆蓋無影響
            cnt += 1
        meta["points"] = cnt
        dtm.tiles.append(meta)
    dtm.nodata = nodata
    dtm.window = (xmin, xmax, ymin, ymax)
    return dtm


def quantile(sorted_vals, q):
    if not sorted_vals:
        return None
    pos = q * (len(sorted_vals) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def plane_fit(pts):
    """最小平方擬合 z = a + b*e + c*n;回傳係數與殘差。純 Python 正規方程。"""
    n = len(pts)
    me = sum(p[0] for p in pts) / n
    mn = sum(p[1] for p in pts) / n
    mz = sum(p[2] for p in pts) / n
    see = sum((p[0] - me) ** 2 for p in pts)
    snn = sum((p[1] - mn) ** 2 for p in pts)
    sen = sum((p[0] - me) * (p[1] - mn) for p in pts)
    sez = sum((p[0] - me) * (p[2] - mz) for p in pts)
    snz = sum((p[1] - mn) * (p[2] - mz) for p in pts)
    det = see * snn - sen ** 2
    b = (sez * snn - snz * sen) / det
    c = (snz * see - sez * sen) / det
    res = [p[2] - (mz + b * (p[0] - me) + c * (p[1] - mn)) for p in pts]
    return b, c, res


# ---------- 道路 ----------
def clip_polyline(geom, bbox=BBOX_A):
    """把 polyline 切成落在 bbox 內的片段(以端點在 bbox 內判斷,邊界附近最多誤差一段節點間距)。"""
    parts, cur = [], []
    for p in geom:
        if p is None:
            continue
        if in_bbox(p["lat"], p["lon"], bbox):
            cur.append((p["lat"], p["lon"]))
        else:
            if len(cur) >= 2:
                parts.append(cur)
            cur = []
    if len(cur) >= 2:
        parts.append(cur)
    return parts


def resample(line, step):
    """沿 polyline 每 step 公尺取一點(含起點,最後不足 step 的尾段捨棄)。回傳 [(dist, lat, lon)]。"""
    out = [(0.0, line[0][0], line[0][1])]
    acc = 0.0
    nxt = step
    for (la1, lo1), (la2, lo2) in zip(line, line[1:]):
        seg = haversine(la1, lo1, la2, lo2)
        while seg > 0 and acc + seg >= nxt:
            t = (nxt - acc) / seg
            out.append((nxt, la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t))
            nxt += step
        acc += seg
    return out


def road_slopes(roads_json, dtm, step):
    segs = []
    excluded_len = 0.0
    total_len = 0.0
    for el in roads_json["elements"]:
        if el.get("type") != "way":
            continue
        t = el.get("tags", {})
        if t.get("highway") not in MAJOR:
            continue
        elevated = (t.get("bridge") not in (None, "no") or t.get("tunnel") not in (None, "no")
                    or t.get("layer") not in (None, "0") or t.get("covered") == "yes")
        for part in clip_polyline(el.get("geometry", [])):
            pts = resample(part, step)
            for (d1, la1, lo1), (d2, la2, lo2) in zip(pts, pts[1:]):
                z1, z2 = dtm.sample_ll(la1, lo1), dtm.sample_ll(la2, lo2)
                L = d2 - d1
                total_len += L
                if elevated:
                    excluded_len += L
                    continue
                if z1 is None or z2 is None:
                    continue
                segs.append({"way": el["id"], "name": t.get("name", "not_stated"), "highway": t["highway"],
                             "lat": (la1 + la2) / 2, "lon": (lo1 + lo2) / 2, "z1": z1, "z2": z2,
                             "len": L, "slope": (z2 - z1) / L * 100})
    return segs, total_len, excluded_len


def top_distinct(segs, k, min_sep=300):
    """取 |坡度| 最大的 k 段,同一路名在 min_sep 公尺內只取一段,避免同一處重複。"""
    out = []
    for s in sorted(segs, key=lambda s: -abs(s["slope"])):
        if any(o["name"] == s["name"] and haversine(o["lat"], o["lon"], s["lat"], s["lon"]) < min_sep for o in out):
            continue
        out.append(s)
        if len(out) == k:
            break
    return out


def context_points(roads_json, feat_json):
    """收集範圍 A(外擴)內的水道節點與 bridge/tunnel 道路節點,用來標註陡坡段附近是否有橋或河道。"""
    big = (BBOX_A[0] - 0.005, BBOX_A[1] - 0.005, BBOX_A[2] + 0.005, BBOX_A[3] + 0.005)
    water, bridge = [], []
    for el in (feat_json or {}).get("elements", []):
        t = el.get("tags", {})
        if el.get("type") == "way" and "waterway" in t:
            for q in el.get("geometry", []):
                if q and in_bbox(q["lat"], q["lon"], big):
                    water.append((q["lat"], q["lon"], t.get("name", t["waterway"])))
    for el in (roads_json or {}).get("elements", []):
        t = el.get("tags", {})
        if el.get("type") == "way" and (t.get("bridge") not in (None, "no") or t.get("tunnel") not in (None, "no")):
            for q in el.get("geometry", []):
                if q and in_bbox(q["lat"], q["lon"], big):
                    bridge.append((q["lat"], q["lon"], t.get("name", "not_stated")))
    return water, bridge


def nearest(pts, lat, lon):
    best = None
    for q in pts:
        if abs(q[0] - lat) > 0.003 or abs(q[1] - lon) > 0.003:
            continue
        d = haversine(lat, lon, q[0], q[1])
        if best is None or d < best[0]:
            best = (d, q[2])
    return best


def ctx_text(water, bridge, s):
    out = []
    w = nearest(water, s["lat"], s["lon"])
    b = nearest(bridge, s["lat"], s["lon"])
    out.append(f"水道 {w[1]} {w[0]:.0f} m" if w else "水道 >300 m")
    out.append(f"橋/隧道路段 {b[1]} {b[0]:.0f} m" if b else "橋/隧道路段 >300 m")
    return ";".join(out)


def survey_points(feat):
    out = []
    for el in feat["elements"]:
        if el.get("type") != "node":
            continue
        t = el.get("tags", {})
        try:
            ele = float(t.get("ele", ""))
        except ValueError:
            continue
        if ele <= 0 or not in_bbox(el["lat"], el["lon"]):
            continue
        out.append({"id": el["id"], "lat": el["lat"], "lon": el["lon"], "ele": ele, "name": t.get("name", "not_stated"),
                    "kind": t.get("man_made") or t.get("natural") or t.get("tourism") or "not_stated"})
    return out


def selftest():
    # 1. 正反算往返誤差 < 1 mm(範圍 A 四角)
    for la in (BBOX_A[0], BBOX_A[2]):
        for lo in (BBOX_A[1], BBOX_A[3]):
            x, y = tm_forward(la, lo)
            la2, lo2 = tm_inverse(x, y)
            assert haversine(la, lo, la2, lo2) < 0.001, (la, lo, la2, lo2)
    # 2. 中央經線 121°E 上 x 必為 250000
    x, _ = tm_forward(24.15, 121.0)
    assert abs(x - 250000) < 1e-6
    # 3. 雙線性內插:平面 z = 0.1e + 0.2n 內插值應精確
    d = Dtm()
    for e in (0, 20):
        for n in (0, 20):
            d.z[(e, n)] = 0.1 * e + 0.2 * n
    assert abs(d.sample(7, 13) - (0.7 + 2.6)) < 1e-9
    assert d.sample(25, 5) is None
    # 4. 重新取樣:1 km 經線上每 50 m → 21 點
    line = [(24.0, 120.0), (24.0 + 1000 / (R_EARTH * math.pi / 180), 120.0)]
    assert len(resample(line, 50)) == 21
    # 5. 分位數
    assert quantile([0, 10], 0.5) == 5
    print("SELFTEST PASS")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem-zip")
    ap.add_argument("--roads")
    ap.add_argument("--features")
    ap.add_argument("--srtm")
    ap.add_argument("--stations", help="q06_rail_A.json:列出各鐵路/捷運車站位置的 DTM 高程(參考點)")
    ap.add_argument("--json-out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

    dtm = load_dtm(a.dem_zip)
    # 範圍 A 內的網格點
    pts = []
    for (e, n), zz in dtm.z.items():
        la, lo = tm_inverse(e, n)
        if in_bbox(la, lo):
            pts.append((e, n, zz, la, lo))
    zs = sorted(p[2] for p in pts)
    pmin = min(pts, key=lambda p: p[2])
    pmax = max(pts, key=lambda p: p[2])
    qs = [0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1]
    qv = {q: quantile(zs, q) for q in qs}
    b, c, res = plane_fit([(p[0], p[1], p[2]) for p in pts])
    grad = math.hypot(b, c) * 100
    # 下坡方向(方位角,北=0,順時針)
    aspect = (math.degrees(math.atan2(-b, -c)) + 360) % 360
    rs = sorted(res)

    print("# 範圍 A 地形統計(內政部 20 m DTM)\n")
    print(f"- 範圍 A bbox(南,西,北,東):{BBOX_A}")
    print(f"- 使用圖幅:{len(dtm.tiles)} 幅:" + ", ".join(sorted(t['sheet'] for t in dtm.tiles)))
    print(f"- 讀入 TM2 視窗 E {dtm.window[0]:.0f}–{dtm.window[1]:.0f}、N {dtm.window[2]:.0f}–{dtm.window[3]:.0f};"
          f"視窗內圖幅無值點(-999)= {dtm.nodata}")
    print(f"- 範圍 A 內網格點數:{len(pts)}(20 m 間距)")
    print(f"\n## 高程(TWVD2001,m)\n")
    print(f"- 最低 {pmin[2]:.2f} m @ {pmin[3]:.5f},{pmin[4]:.5f}(E{pmin[0]} N{pmin[1]})")
    print(f"- 最高 {pmax[2]:.2f} m @ {pmax[3]:.5f},{pmax[4]:.5f}(E{pmax[0]} N{pmax[1]})")
    print(f"- **最大高差 {pmax[2] - pmin[2]:.2f} m**")
    print(f"- P1–P99 高差 {qv[0.99] - qv[0.01]:.2f} m;P5–P95 高差 {qv[0.95] - qv[0.05]:.2f} m")
    print("\n| 分位 | 高程 m |\n|---|---:|")
    for q in qs:
        print(f"| P{int(q * 100)} | {qv[q]:.2f} |")
    print("\n## 平面擬合(z = a + b·E + c·N)\n")
    print(f"- 整體坡度 {grad:.3f} %(每公里 {grad * 10:.2f} m),下坡方位 {aspect:.0f}°(北=0°,順時針)")
    print(f"- 殘差範圍 {rs[0]:.2f} ~ {rs[-1]:.2f} m(全距 {rs[-1] - rs[0]:.2f} m);"
          f"殘差 P1–P99 全距 {quantile(rs, 0.99) - quantile(rs, 0.01):.2f} m")

    # 高程直方圖(5 m 一格)
    print("\n## 高程分布(5 m 一格)\n\n| 區間 m | 點數 | 占比 |\n|---|---:|---:|")
    lo5 = int(math.floor(zs[0] / 5) * 5)
    hist = []
    k = lo5
    while k <= zs[-1]:
        cnt = bisect.bisect_left(zs, k + 5) - bisect.bisect_left(zs, k)
        hist.append((k, cnt))
        print(f"| {k}–{k + 5} | {cnt} | {cnt / len(zs) * 100:.1f}% |")
        k += 5

    # 測量點比對
    survey = []
    feat_json = json.load(open(a.features, encoding="utf-8")) if a.features else None
    if a.features:
        sp = survey_points(feat_json)
        print("\n## DTM 與 OSM 測量點(ele 標籤,範圍 A 內)比對\n")
        print("| node | name | 類別 | lat,lon | OSM ele | DTM | 差 (DTM−OSM) |\n|---|---|---|---|---:|---:|---:|")
        for p in sp:
            z = dtm.sample_ll(p["lat"], p["lon"])
            p["dtm"] = z
            if z is None:
                continue
            print(f"| {p['id']} | {p['name']} | {p['kind']} | {p['lat']:.5f},{p['lon']:.5f} | {p['ele']} | {z:.2f} | {z - p['ele']:+.2f} |")
            survey.append(p)
        if survey:
            errs = [p["dtm"] - p["ele"] for p in survey]
            print(f"\nn={len(errs)},平均差 {sum(errs) / len(errs):+.2f} m,平均絕對差 {sum(map(abs, errs)) / len(errs):.2f} m")
    srtm_cmp = []
    if a.srtm:
        res_s = json.load(open(a.srtm, encoding="utf-8")).get("results", [])
        print("\n## DTM 與既有 SRTM30m 點(範圍 A 內)比對\n\n| lat,lon | SRTM | DTM | 差 (SRTM−DTM) |\n|---|---:|---:|---:|")
        for r in res_s:
            la, lo = r["location"]["lat"], r["location"]["lng"]
            if not in_bbox(la, lo) or r.get("elevation") is None:
                continue
            z = dtm.sample_ll(la, lo)
            if z is None:
                continue
            srtm_cmp.append(r["elevation"] - z)
            print(f"| {la:.5f},{lo:.5f} | {r['elevation']} | {z:.2f} | {r['elevation'] - z:+.2f} |")
        if srtm_cmp:
            print(f"\nn={len(srtm_cmp)},SRTM 平均高於 DTM {sum(srtm_cmp) / len(srtm_cmp):+.2f} m")

    ref_pts = []
    if a.stations:
        sj = json.load(open(a.stations, encoding="utf-8"))
        for el in sj["elements"]:
            t = el.get("tags", {})
            if el.get("type") == "node" and t.get("railway") == "station" and in_bbox(el["lat"], el["lon"]):
                z = dtm.sample_ll(el["lat"], el["lon"])
                ref_pts.append({"name": t.get("name", "not_stated"), "station": t.get("station", t.get("network", "-")),
                                "lat": el["lat"], "lon": el["lon"], "dtm": z})
        ref_pts.sort(key=lambda r: r["dtm"] if r["dtm"] is not None else 1e9)
        print("\n## 車站位置的 DTM 地面高程(參考點,車站座標取自 q06 railway=station node)\n")
        print("| 車站 | station | lat,lon | DTM 地面高 m |\n|---|---|---|---:|")
        for r in ref_pts:
            print(f"| {r['name']} | {r['station']} | {r['lat']:.5f},{r['lon']:.5f} | "
                  + (f"{r['dtm']:.2f}" if r["dtm"] is not None else "not_stated") + " |")

    road = {}
    if a.roads:
        rj = json.load(open(a.roads, encoding="utf-8"))
        water, bridge = context_points(rj, feat_json)
        for step, near_excl in ((50, 0), (200, 0), (50, NEAR_EXCL_M)):
            segs, tot, exc = road_slopes(rj, dtm, step)
            key = f"{step}" if not near_excl else f"{step}_excl{near_excl}m"
            if near_excl:
                def near(s):
                    w = nearest(water, s["lat"], s["lon"])
                    b = nearest(bridge, s["lat"], s["lon"])
                    return (w and w[0] < near_excl) or (b and b[0] < near_excl)
                n0 = len(segs)
                segs = [s for s in segs if not near(s)]
                print(f"\n> 以下再排除「中點距水道或橋/隧道路段節點 < {near_excl} m」的取樣段 {n0 - len(segs)} 段"
                      f"(DTM 量的是河道/地面,不是橋面;橋頭引道的坡度在 DTM 上會被誇大)")
            sl = sorted(abs(s["slope"]) for s in segs)
            top = top_distinct(segs, 5)
            over = {th: sum(s["len"] for s in segs if abs(s["slope"]) > th) for th in (2, 3, 5)}
            seg_len = sum(s["len"] for s in segs)
            road[key] = {"n": len(segs), "total_len_m": tot, "excluded_len_m": exc,
                          "p50": quantile(sl, 0.5), "p95": quantile(sl, 0.95), "p99": quantile(sl, 0.99),
                          "max": sl[-1], "over": over, "seg_len": seg_len, "top": top}
            print(f"\n## 主要道路坡度,取樣間距 {step} m" + (f",排除橋/水道 {near_excl} m 內" if near_excl else "") + "\n")
            print(f"- 道路類別:{', '.join(sorted(MAJOR))};範圍 A 內取樣總長 {tot / 1000:.1f} km,"
                  f"其中 bridge/tunnel/layer≠0 排除 {exc / 1000:.1f} km;計入 {len(segs)} 段 {seg_len / 1000:.1f} km")
            print(f"- |坡度| 中位數 {road[key]['p50']:.2f}%、P95 {road[key]['p95']:.2f}%、P99 {road[key]['p99']:.2f}%、最大 {sl[-1]:.2f}%")
            print("- 超過門檻的長度占比:" + ";".join(f">{th}%:{v / seg_len * 100:.2f}%" for th, v in over.items()))
            print(f"\n最陡 5 段(同路名 300 m 內只列一段):\n\n| # | 路名 | highway | way | 中點 lat,lon | 起/訖高程 m | 坡度 % | 最近水道/最近橋隧路段 |\n|---|---|---|---|---|---|---:|---|")
            for i, s in enumerate(top, 1):
                print(f"| {i} | {s['name']} | {s['highway']} | {s['way']} | {s['lat']:.5f},{s['lon']:.5f} | "
                      f"{s['z1']:.2f} → {s['z2']:.2f} | {s['slope']:+.2f} | {ctx_text(water, bridge, s)} |")
                s["context"] = ctx_text(water, bridge, s)

    if a.json_out:
        os.makedirs(os.path.dirname(a.json_out), exist_ok=True)
        out = {"bbox_A": BBOX_A, "tiles": dtm.tiles, "grid_points_in_A": len(pts),
               "min": {"z": pmin[2], "lat": pmin[3], "lon": pmin[4]},
               "max": {"z": pmax[2], "lat": pmax[3], "lon": pmax[4]},
               "range_m": pmax[2] - pmin[2], "quantiles": {f"P{int(q * 100)}": qv[q] for q in qs},
               "plane_fit": {"grad_pct": grad, "downhill_azimuth_deg": aspect,
                             "residual_min": rs[0], "residual_max": rs[-1]},
               "hist_5m": hist,
               "station_ground_elevation": ref_pts,
               "survey_compare": [{k: p[k] for k in ("id", "name", "lat", "lon", "ele", "dtm")} for p in survey],
               "road_slopes": {str(k): v for k, v in road.items()}}
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
