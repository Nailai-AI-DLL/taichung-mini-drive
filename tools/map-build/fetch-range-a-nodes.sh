#!/usr/bin/env bash
# 用法:bash tools/map-build/fetch-range-a-nodes.sh
# 下載範圍 A 的點資料(公車站)到 data/osm/raw/range-a/range-a_nodes.json(0015 第四批)。
# 沿用 tools/research/fetch_overpass.sh。Overpass 為公共服務,請勿頻繁呼叫。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/data/osm/raw/range-a"
bash "$ROOT/tools/research/fetch_overpass.sh" \
  "$ROOT/tools/map-build/queries/range_a_nodes.overpassql" \
  "$ROOT/data/osm/raw/range-a/range-a_nodes.json"
