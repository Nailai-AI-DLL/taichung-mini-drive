# 0047 樹縮小、車燈調暗、其他車輛夜裡開車燈、紅綠燈位置檢查

日期:2026-11-16
狀態:1、2 已實作並推上(7141530);3 Cooper 選 A,已實作(未 commit)

## 背景
Cooper 2026-11-16:
1. 「現在樹的尺寸有點太大了，我覺得可以縮小些。」
2. 「夜晚模式中我們的車燈太亮了，這個可以調整嗎？另外路上的汽車是否也能讓他們開車燈？或是有其他做法？因為晚上看不太出來其他的車子在哪裡。」
3. 「可以繼續檢查紅綠燈位置。」

## 1. 樹縮小
- `TREE_DRAW_SCALE` = 0.75(`src/config/furniture.ts`),所有行道樹畫面上再乘這個倍數(實測樹高的比例照舊)。推論值，可再調。
- 碰撞半徑不變(樹幹粗細和以前差不多)。

## 2. 車燈
- 玩家大燈:`HEADLIGHT.intensity` 600 → 300、車燈玻璃自發光 3 → 1.6。
- 其他車輛車燈(`src/render/traffic.ts`):夜裡才顯示;一般車 / 公車各一組 InstancedMesh(頭燈兩顆暖白、尾燈兩顆紅),不受光照、顏色乘上倍數讓夜裡的泛光發光暈(頭燈 ×2.4、尾燈 ×6,紅色亮度低要乘多一點)。數值在 `TRAFFIC_LAMPS`(`src/config/look.ts`)。
- 不用真光源(每台車一盞會讓所有材質多算很多次，見 0042 評估)。
- 畫面:`docs/art/night-0047/`(`night-traffic-taxi.jpg` 頭燈、`night-traffic-taxi-rear.jpg` 尾燈、`night-traffic-bus*.jpg`、`night-taiwan-blvd.jpg` 調暗後的大燈)。
- 工具：`tools/shots/spot-shot.mjs` 加第 7 個參數(網址參數，例 `?night=1`);`tools/shots/traffic-shots.mjs` 加第 2 個參數(例 `&night=1`,多拍車尾)。

## 3. 紅綠燈位置檢查
- 市政府沒有開放號誌位置(`docs/research/street-furniture-data.md`)。改用 OSM 的號誌點當參考：新查詢 `tools/map-build/queries/range_a_signals.overpassql`(highway=traffic_signals 1,642 點、有號誌的行人穿越道 1,399 點;2026-11-16 抓，存 `data/osm/raw/range-a/range-a_signals.json`,不進版控)。
- 比對工具 `tools/research/signal_check.py`:兩邊各自把 35 m 內的點併成一個路口,50 m 內算同一個路口;路口名稱用臺中市道路圖的交叉路口點(R0005)。輸出 `data/osm/derived/signal-check.json`、地圖 `docs/art/signals-0047/signal-map.png`(綠 = 兩邊都有、紅 = OSM 有遊戲沒有、橘 = 遊戲有 OSM 沒有)。
- 結果:
  | | 路口數 |
  |---|---|
  | 遊戲(依規則放) | 897 |
  | OSM 號誌 | 927 |
  | 兩邊都有 | 616 |
  | OSM 有、遊戲沒有 | 501 |
  | 遊戲有、OSM 沒有 | 281 |
- 分布：紅點集中在中區、北區、東區(舊市區，路比較窄，現在的規則要路寬 ≥ 10 m 才放);橘點集中在西邊七期、南屯(新的棋盤路網，可能是規則放多了，也可能是 OSM 漏標)。
- 例:「OSM 有、遊戲沒有」包括臺灣大道三段 × 惠來路二段(最近的遊戲號誌在 70 m 外)、中清路一段 × 忠明路、臺灣大道二段 × 館前路。
- OSM 是志工標的，也可能漏標;「遊戲有、OSM 沒有」要人工判斷。

## 3-A. 號誌改依 OSM 號誌點放(Cooper 2026-11-16:「紅綠燈用A改法沒問題」)
- 先把前一版 commit/push(7141530),再改。
- `tools/map-build/lib/furniture.ts` `osmSignals`:進入路口的停止線 `SIGNAL_OSM_R` = 40 m 內有 OSM 號誌點 → 立號誌(位置規則和以前一樣：停止線旁、右側路緣、懸臂朝路中央)。沒有 OSM 號誌點的路口不放(以前「每個大路口都放」的規則只在沒有號誌點資料時才用)。
- OSM 號誌點附近沒有停止線(窄路沒畫停止線)→ 在最近道路的路緣補一支;那一點落在橫向道路或路口鋪面上時(大路口常見),沿道路往兩方向每 5 m 退一次再試，最多 40 m。
- 有號誌的行人穿越道照舊。
- 建置:`build.ts` `osmSignals: data/osm/raw/range-a/range-a_signals.json`(只取 highway=traffic_signals,範圍內 1,489 點)。
- 結果(`signal_check.py` 重跑，地圖 `docs/art/signals-0047/signal-map-after.png`):
  | | 改前 | 改後 |
  |---|---|---|
  | 號誌桿 | 2,012 支 | 2,420 支 |
  | 兩邊都有的路口 | 616 | 1,217 |
  | OSM 有、遊戲沒有 | 501 | 4 |
  | 遊戲有、OSM 沒有 | 281 | 12(有號誌的行人穿越道) |
- 第一版只靠停止線時還剩 108 個沒放到，多是大路口(臺灣大道 × 惠來路):補在路緣的那支落在橫向道路上被擋掉 → 加了「沿道路退後再試」。
- 測試(`tests/unit/intersection-signals.test.ts`):有 OSM 點的路口四個方向都放、沒有就不放;附近沒停止線的點補在最近道路路緣、在點的那一側。全部 394 項通過;e2e 卡頓 0 幀。

## 待 Cooper
- 樹的大小、大燈亮度、其他車輛車燈亮度(已推上，看完再調)。
