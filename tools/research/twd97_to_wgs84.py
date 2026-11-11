#!/usr/bin/env python3
"""TWD97 TM2(121 分帶,EPSG:3826)→ WGS84 經緯度,純 Python,不需 pyproj。

用途:驗證臺中市開放資料(例如「臺中市道路寬度」CSV 的 TM2度分帶97X/Y 坐標)
確實落在 EPSG:3826,並供資料管線做抽查。

參數(EPSG:3826):GRS80 橢球,中央經線 121°E,尺度 0.9999,東偏 250000 m,北偏 0。
TWD97 與 WGS84 差異在公分~公尺級,遊戲用途可忽略。

用法:
  python3 twd97_to_wgs84.py 218161.488 2672948.65
  python3 twd97_to_wgs84.py --selftest
"""
import math
import sys

A = 6378137.0
F = 1 / 298.257222101  # GRS80
K0 = 0.9999
LON0 = math.radians(121.0)
FE = 250000.0
FN = 0.0


def tm_inverse(x, y):
    e2 = F * (2 - F)
    ep2 = e2 / (1 - e2)
    m = (y - FN) / K0
    mu = m / (A * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    c1 = ep2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = A / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    r1 = A * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                  + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def selftest():
    # 臺中市區應落在約 北緯 24.0~24.3、東經 120.5~120.8
    samples = {
        "榮華街(北區),臺中市道路寬度 CSV 第3列": (218161.488, 2672948.65),
        "柳川西路三段(北區),同 CSV 第8列": (217238.144, 2671479.465),
    }
    ok = True
    for name, (x, y) in samples.items():
        lat, lon = tm_inverse(x, y)
        inside = 24.0 < lat < 24.3 and 120.5 < lon < 120.8
        ok &= inside
        print(f"{name}: lat={lat:.5f}, lon={lon:.5f}, 在臺中市區範圍內={inside}")
    print("SELFTEST", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    la, lo = tm_inverse(float(sys.argv[1]), float(sys.argv[2]))
    print(f"{la:.6f},{lo:.6f}")
