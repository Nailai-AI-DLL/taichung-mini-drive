"""
遠景山脈天際線(decisions/0019):從內政部 20 m DTM(臺中市分幅,政府資料開放授權第 1 版)算出
「站在地圖中心往每個方位看,遠方山的仰角」,分近 / 中 / 遠三層,遊戲裡畫成跟著鏡頭的三圈山影。

- 只讀 zip 裡的 .grd 文字數值,不解壓、不執行任何內容(同 tools/research/range_a_terrain.py)。
- 取 200 m 網格(每 10 格取 1 格):山的輪廓在 3 km 外,200 m 足夠,也讓檔案小。
- 仰角含地球曲率與大氣折射(係數 0.13):下沉量 = d² / (2R) × (1 − 0.13)。
- 資料只涵蓋臺中市;彰化(八卦山)、南投、苗栗的山沒有資料 → 那些方位會比實際低(not_stated 的部分照實留空)。

用法:
  python3 tools/map-build/skyline.py data/elevation/moi_dtm20_taichung/taichung_dem20.zip public/map/range-a/world.json public/map/range-a/skyline.json
"""
import json
import math
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'research'))
from range_a_terrain import parse_hdr, tm_inverse  # noqa: E402

R_EARTH = 6371008.8
REFRACTION = 0.13
GRID = 200          # 取樣網格(公尺)
AZ_STEP = 0.5       # 方位角解析度(度)
EYE = 1.5           # 眼睛離地(公尺)
# 三層的距離範圍(公尺):近(大坑、大肚山)、中、遠(中央山脈)
BANDS = [(3000, 12000), (12000, 30000), (30000, 200000)]


def main():
    zip_path, world_path, out_path = sys.argv[1:4]
    meta = json.load(open(world_path))['meta']
    oe, on = meta['origin']['e'], meta['origin']['n']
    z = zipfile.ZipFile(zip_path)
    pts = []
    tiles = 0
    for h in [i.filename for i in z.infolist() if i.filename.endswith('dem.hdr')]:
        m = parse_hdr(z.read(h).decode('big5', 'replace'))
        assert m['dx'] == 20 and m['dy'] == 20, m
        tiles += 1
        for ln in z.read(h[:-4] + '.grd').decode('ascii').splitlines():
            p = ln.split()
            if len(p) != 3:
                continue
            e, n, zz = int(float(p[0])), int(float(p[1])), float(p[2])
            if zz <= -999 or e % GRID or n % GRID:
                continue
            pts.append((e, n, zz))
    # 觀察點高度:地圖中心附近 1 km 內的平均地面高度
    near = [p[2] for p in pts if abs(p[0] - oe) < 1000 and abs(p[1] - on) < 1000]
    h0 = (sum(near) / len(near) if near else 80.0) + EYE
    nbin = int(round(360 / AZ_STEP))
    best = [[(-90.0, 0.0, 0.0) for _ in range(nbin)] for _ in BANDS]  # (仰角, 距離, 高程)
    top = max(pts, key=lambda p: p[2])
    for e, n, zz in pts:
        dx, dn = e - oe, n - on
        d = math.hypot(dx, dn)
        bi = next((i for i, (a, b) in enumerate(BANDS) if a <= d < b), None)
        if bi is None:
            continue
        drop = d * d / (2 * R_EARTH) * (1 - REFRACTION)
        ang = math.degrees(math.atan2(zz - drop - h0, d))
        az = (math.degrees(math.atan2(dx, dn)) + 360) % 360  # 北 = 0、東 = 90
        k = int(az / AZ_STEP) % nbin
        if ang > best[bi][k][0]:
            best[bi][k] = (ang, d, zz)
    out = {
        'source': '內政部 20 m DTM 臺中市分幅(政府資料開放授權第 1 版);只涵蓋臺中市',
        'tiles': tiles, 'grid': GRID, 'azStep': AZ_STEP, 'eyeElevation': round(h0, 1),
        'bands': [],
    }
    for (a, b), row in zip(BANDS, best):
        # 沒有資料的方位(-90)記成 null
        out['bands'].append({
            'minDist': a, 'maxDist': b,
            'angle': [None if r[0] <= -89 else round(r[0], 3) for r in row],
            'dist': [None if r[0] <= -89 else round(r[1]) for r in row],
        })
    json.dump(out, open(out_path, 'w'), ensure_ascii=False, separators=(',', ':'))
    lat, lon = tm_inverse(top[0], top[1])
    print('TILES', tiles, 'POINTS', len(pts), 'EYE %.1f m' % h0)
    print('HIGHEST %.0f m at %.4fN %.4fE' % (top[2], lat, lon))
    for i, row in enumerate(best):
        k = max(range(nbin), key=lambda j: row[j][0])
        r = row[k]
        print('BAND', i, 'max %.2f deg at az %.1f dist %.1f km elev %.0f m; empty bins %d' % (r[0], k * AZ_STEP, r[1] / 1000, r[2], sum(1 for x in row if x[0] <= -89)))
    print('OUT', out_path, os.path.getsize(out_path) // 1024, 'KB')


main()
