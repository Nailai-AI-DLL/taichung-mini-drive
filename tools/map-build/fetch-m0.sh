#!/usr/bin/env bash
# 用法:bash tools/map-build/fetch-m0.sh
# 下載 M0 區域(歌劇院周邊)OSM 原始資料到 data/osm/raw/m0/m0_area.json。
# 沿用 tools/research/fetch_overpass.sh(帶 User-Agent、失敗換備援站、寫 fetch_log.tsv)。
# 只在需要更新資料時執行;Overpass 為公共服務,請勿頻繁呼叫。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/tools/research/fetch_overpass.sh" \
  "$ROOT/tools/map-build/queries/m0_area.overpassql" \
  "$ROOT/data/osm/raw/m0/m0_area.json"
