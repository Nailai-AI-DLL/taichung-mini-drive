#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
研究腳本幾何函式的自我檢查(haversine、bbox 裁切、多邊形面積/形心、multipolygon 串環)。
用法:python3 -I /Users/cooperfu/Projects/3D_Racing/tools/research/test_geo.py   (全部通過印 ALL OK)
"""
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


S = load("osm_area_stats")
L = load("osm_landmarks")

# 1. haversine:經線 1 度 = πR/180
assert abs(S.haversine(24.0, 120.0, 25.0, 120.0) - math.pi * 6371008.8 / 180) < 0.01
# 2. 裁切:跨越 bbox 的水平線段只留 bbox 內部分
bbox = (24.0, 120.0, 24.1, 120.1)
c = S.clip_segment(24.05, 119.9, 24.05, 120.2, bbox)
assert c and abs(c[1] - 120.0) < 1e-12 and abs(c[3] - 120.1) < 1e-12
assert S.clip_segment(24.2, 119.9, 24.2, 120.2, bbox) is None          # 完全在外
geom = [{"lat": 24.05, "lon": 119.9}, {"lat": 24.05, "lon": 120.2}]
assert abs(S.clipped_length(geom, bbox) - S.haversine(24.05, 120.0, 24.05, 120.1)) < 0.5
# 3. 面積:0.001° × 0.001° 方塊(緯度 24.15)≈ (R·dφ)·(R·cosφ·dλ)
d = 0.001
sq = [(24.15, 120.6), (24.15, 120.6 + d), (24.15 + d, 120.6 + d), (24.15 + d, 120.6), (24.15, 120.6)]
a, la, lo = L.ring_area_centroid(sq)
exp = (6371008.8 * math.radians(d)) ** 2 * math.cos(math.radians(24.1505))
assert abs(a - exp) / exp < 1e-3, (a, exp)
assert abs(la - 24.1505) < 1e-6 and abs(lo - 120.6005) < 1e-6
# 4. multipolygon:外環拆兩段、內環挖洞
outer = [[(0, 0), (0, 0.002), (0.002, 0.002)], [(0.002, 0.002), (0.002, 0), (0, 0)]]
rings = L.build_rings(outer)
assert len(rings) == 1 and rings[0][0] == rings[0][-1]
rel = {"type": "relation", "members": [
    {"type": "way", "role": "outer", "geometry": [{"lat": p[0], "lon": p[1]} for p in seg]} for seg in outer] + [
    {"type": "way", "role": "inner", "geometry": [{"lat": p[0], "lon": p[1]} for p in
                                                   [(0.0005, 0.0005), (0.0005, 0.0015), (0.0015, 0.0015), (0.0015, 0.0005), (0.0005, 0.0005)]]}]}
g = L.geom_of(rel)
full = L.ring_area_centroid([(0, 0), (0, 0.002), (0.002, 0.002), (0.002, 0), (0, 0)])[0]
hole = L.ring_area_centroid([(0.0005, 0.0005), (0.0005, 0.0015), (0.0015, 0.0015), (0.0015, 0.0005), (0.0005, 0.0005)])[0]
assert abs(g["area"] - (full - hole)) < 1e-6
# 5. point in polygon
assert L.point_in_poly(24.1505, 120.6005, sq[:-1]) and not L.point_in_poly(24.2, 120.6, sq[:-1])
print("ALL OK")
