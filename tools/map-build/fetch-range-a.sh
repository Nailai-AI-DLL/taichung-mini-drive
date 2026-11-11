#!/usr/bin/env bash
# 用法:bash tools/map-build/fetch-range-a.sh
# 下載範圍 A OSM 原始資料到 data/osm/raw/range-a/range-a_area.json。
# 沿用 tools/research/fetch_overpass.sh(帶 User-Agent、驗證後才原子替換、失敗換備援站、寫 fetch_log.tsv)。
# Overpass 為公共服務,請勿頻繁呼叫。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/data/osm/raw/range-a"
bash "$ROOT/tools/research/fetch_overpass.sh" \
  "$ROOT/tools/map-build/queries/range_a.overpassql" \
  "$ROOT/data/osm/raw/range-a/range-a_area.json"
