#!/bin/bash
# 用法:
#   bash /Users/cooperfu/Projects/3D_Racing/tools/research/fetch_overpass.sh <查詢檔.overpassql 絕對路徑> <輸出 .json 絕對路徑> [only-primary]
#   第三參數給 only-primary 時只打 overpass-api.de(備援站故障時用,避免浪費查詢次數)。
# 說明:
#   - 依序打 OVERPASS_ENDPOINTS 裡的端點(預設 overpass-api.de → overpass.kumi.systems),
#     全部失敗就等一下再來一輪,最多 OVERPASS_ROUNDS 輪(預設 2,也就是最多 4 次請求)。
#   - 回應先寫到輸出檔旁的暫存檔,用 validate_overpass.mjs 驗證(完整 JSON、有 elements、沒有 remark)
#     通過後才原子替換輸出檔。失敗時舊的輸出檔保持原樣,不會被錯誤頁或不完整資料蓋掉。
#     (2026-10-24 改寫,參考 mrdoob/slop-newyork tools/overpass.sh;見 docs/decisions/0009 T3)
#   - 每次嘗試在輸出檔同資料夾的 fetch_log.tsv 追加一行:UTC 時間、端點、HTTP 狀態、查詢檔、輸出檔、位元組數。
#     HTTP 200 但驗證失敗時,狀態欄記成「200-invalid」。
#   - 只下載資料,不執行下載內容。OSM 資料每天在變,重抓得到的數字會與報告不同;
#     報告數字以 data/osm/raw/ 內已存的檔案為準。
#   - 請節制使用:連續查詢之間自行 sleep 數秒。
#   - 測試用環境變數:OVERPASS_ENDPOINTS(空白分隔)、OVERPASS_ROUNDS、OVERPASS_SLEEP(每次失敗後等幾秒,預設 5)。
set -u
QUERY="$1"
OUT="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$(dirname "$OUT")/fetch_log.tsv"
[ -r "$QUERY" ] || { echo "讀不到查詢檔:$QUERY" >&2; exit 2; }
[ -d "$(dirname "$OUT")" ] || { echo "輸出資料夾不存在:$(dirname "$OUT")" >&2; exit 2; }
[ -f "$LOG" ] || printf 'utc_time\tendpoint\thttp_status\tquery_file\toutput_file\tbytes\n' > "$LOG"
read -r -a EPS <<< "${OVERPASS_ENDPOINTS:-https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter}"
[ "${3:-}" = "only-primary" ] && EPS=("${EPS[0]}")
ROUNDS="${OVERPASS_ROUNDS:-2}"
SLEEP="${OVERPASS_SLEEP:-5}"
# 暫存檔和輸出檔在同一個資料夾,mv 才是原子操作
TMP="$(mktemp "${OUT}.tmp.XXXXXX")"
trap 'rm -f -- "$TMP"' EXIT
for ((round = 1; round <= ROUNDS; round++)); do
  for EP in "${EPS[@]}"; do
    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    CODE="$(curl -sS -m 300 -A '3D_Racing-OSM-feasibility-research/0.1' \
             --data-urlencode "data@${QUERY}" -o "$TMP" -w '%{http_code}' "$EP")"
    BYTES="$(wc -c < "$TMP" 2>/dev/null | tr -d ' ')"
    STATUS="$CODE"
    if [ "$CODE" = "200" ]; then
      if MSG="$(node "$HERE/validate_overpass.mjs" "$TMP" 2>&1)"; then
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$TS" "$EP" "$STATUS" "$(basename "$QUERY")" "$(basename "$OUT")" "${BYTES:-0}" >> "$LOG"
        chmod 644 "$TMP"  # mktemp 建立的檔案是 600,改回一般資料檔的權限
        mv -f -- "$TMP" "$OUT"
        echo "OK $EP $CODE ${BYTES} bytes ($MSG) -> $OUT"
        exit 0
      fi
      STATUS="200-invalid"
    else
      MSG="HTTP $CODE"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$TS" "$EP" "$STATUS" "$(basename "$QUERY")" "$(basename "$OUT")" "${BYTES:-0}" >> "$LOG"
    echo "FAIL 第 $round 輪 $EP:$MSG(bytes=${BYTES:-0});舊檔保持不變" >&2
    # 最後一次嘗試失敗就不用再等
    [ "$round" -eq "$ROUNDS" ] && [ "$EP" = "${EPS[${#EPS[@]}-1]}" ] || sleep $((SLEEP * round))
  done
done
echo "全部失敗,輸出檔未更動:$OUT" >&2
exit 1
