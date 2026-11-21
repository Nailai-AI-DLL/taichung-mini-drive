# 0051 高架道路與匝道(74 快速道路、光明陸橋)

日期:2026-11-19(主體 b2011a7);2026-11-21(匝道端點修正 6bfe400)
狀態：已實作(補記於 2026-11-21;commit b2011a7、6bfe400)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 相關：道路的 `layer` / `elev` 欄位在 0048(9a16267)先加好;地圖擴大(0052)後 74 快速道路的範圍變大。
- 先前的高架只有捷運綠線(0030,純裝飾高架橋，不能開上去)。

## 決定
### 資料來源與判斷(建置端，`src/map/elevated.ts`)
- 資料來自 OSM 道路(world.json 的 roads),沒有另外下載高程資料。判斷規則(`elevated.ts:57-92`):
  - `highway=trunk` → 高架主線
  - `highway=trunk_link` → 匝道
  - 名稱含「陸橋」:端點接到一般平面道路的是引道(匝道),兩端都只接陸橋的是主跨(主線)
  - 名稱含「地下道」的排除(de94b04 加入，`elevated.ts:65-66`、`:79`)
- 主線高度 `ELEVATED_DECK_Y` = 8.5 m(`elevated.ts:7`;註解：低於捷運綠線的 10 m)。8.5 m 是推論值，實際高度 not_stated。
- 匝道高度：用 Dijkstra 算每個匝道節點到地面端的距離 dg、到主線的距離 dt,高度 = 8.5 × dg / (dg + dt)(`elevated.ts:136-183`)。
- 坡段每 12 m 細分(`RAMP_SUBDIV_M`,`elevated.ts:9`),並套用緩動曲線 25% 線性 + 75% smoothstep(`easeRamp`,`elevated.ts:15-18`),兩端坡度較緩。
- 高架下方原本畫在地面的標線與分隔島會被清掉(`cleanElevatedGroundStreet`,`elevated.ts:198`)。
- 建置時呼叫:`tools/map-build/build.ts:829`;只切分區時也會補算(`tools/map-build/tile.ts:16-22`)。
- 範圍 A 現況:`index.json` 的 `meta.stats.elevatedRoads` = 119 條(trunk 39、trunk_link 70、primary 6、tertiary 4);名稱前幾名：快官霧峰線 39、西屯二交流道 15、南屯二 / 北屯二交流道各 10、光明陸橋 6、廣福陸橋 4(2026-11-21 以 python 讀 index.json 統計)。

### 網格(`src/world/gen/elevated-road.ts`)
- 參數 `ELEVATED_ROAD_CFG`(`elevated-road.ts:21-46`):箱梁厚 0.85 m、護欄高 1.0 m / 寬 0.36 m、橋墩間距 32 m、離地 4.5 m 以上才立橋墩、0.35 m 以上才有護欄。
- 匝道匯入主線時內側護欄開口、外側保留;橋墩避開下方平面道路(見測試 `:54`)。
- 6bfe400:斜坡端點原本補一個「隨坡面傾斜的圓盤」填縫，會在坡上凸出半圓台階;改成只有水平彎道相接時才補、且圓盤降 1.5 cm,斜坡或與鄰段近似共線(夾角 < 16°)時不補(`needsEndpointDisc`,6bfe400 diff)。

### 碰撞
- 路面 `roadDeck` 用 trimesh 碰撞，摩擦 1.0、反彈 0(`src/physics/world.ts:61-66`;掛載 `src/world/chunk-manager.ts:47-48`)。
- 護欄、箱梁 `roadBarrier` 併入一般碰撞網格(`src/world/chunks.ts:405`)。
- 分區還沒下載時，250 m 內有高架的格子先用骨架建路面碰撞，避免傳送到橋上時掉下去(`src/world/streamer.ts:71-73`、`:106`)。
- 車流、R 鍵回路面依車高分層(見 0048 的測試)。

## 驗證
- `tests/unit/elevated-road.test.ts`:
  - `:15` 自動辨識 trunk / trunk_link / 陸橋，交接節點高度連續
  - `:38` 坡段細分後 2D 總長不變
  - `:54` 匯入處內側護欄開口、橋墩避開平面道路
  - `:83` Rapier 實測：車可從 y=0 開上匝道到 8.5 m、側撞護欄不墜橋、橋下平面道路暢通
  - `:149` 範圍 A 有 74 線、交流道與陸橋(超過 100 條),對應格子都有 roadDeck 與 roadBarrier
- 6bfe400 沒有新增測試(只改 `elevated-road.ts`)。
- 截圖:not_stated(這兩個 commit 沒有附圖;`docs/reviews/2026-11-21/gameplay.md:37` 提到 `xitun-ic.jpg`、`xitun-ic-air.jpg`,位置未查證)。

## 放棄的方案
- 6bfe400 之前的做法：斜坡端點補傾斜圓盤(會凸出半圓台階，被取代)。
- 其他:not_stated。

## 待 Cooper
- 高架主線 8.5 m 是推論值;要不要依實際橋高調整(實際值 not_stated)。
- 74 快速道路的速限、車流是否要不同於一般道路:not_stated(本次未查到相關設定)。
