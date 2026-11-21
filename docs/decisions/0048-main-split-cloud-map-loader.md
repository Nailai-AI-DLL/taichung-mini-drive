# 0048 主程式拆分與雲端地圖載入

日期:2026-11-19
狀態：已實作(補記於 2026-11-21;commit 9a16267、8857eec)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 相關文件:`docs/research/map-expansion.md`(在 9a16267 一起加入)。其中「追加(2026-11-17)」段記錄 Cooper 問過「這些地圖資料是不是放在伺服器上用來載入會更適合？」,文件建議先用「GitHub Pages + 地圖檔另一個分支」,不夠再搬 Cloudflare R2(要開帳號，由 Cooper 決定)。
- 推論：這兩個 commit 是後續分區串流(0050)、地圖分支(0049)、高架(0051)、地形(0053)的前置重構;commit 標題自稱 "Refactor step 1 / step 2"。

## 決定
### 雲端地圖載入(9a16267)
- 地圖來源優先序(`src/map/load.ts:78-88` `resolveMapBaseUrl`):
  1. 網址參數 `?mapUrl=`(`load.ts:80-81`)
  2. 建置期環境變數 `VITE_MAP_URL`(`load.ts:82-83`;註解舉例 Cloudflare R2,`load.ts:2`)
  3. 同站 `${BASE_URL}map`(`load.ts:84-87`,GitHub Pages / 本機)
  - 結尾斜線會被去掉(`load.ts:81`、`83`)。
- 資源網址組合:`mapAssetUrl`(`load.ts:90-93`)、分區網址 `regionTileUrl` → `tiles/<rx>_<rz>.json`(`load.ts:96-98`)。
- 目前 `VITE_MAP_URL` 沒有在 CI 設定(`.github/workflows/pages.yml:31-33` 只設 `VITE_BASE`),所以線上版走第 3 條。

### WorldSurface(9a16267)
- `src/world/surface.ts:173-203` `WorldSurface`:地表高度 `terrainY`、法向量 `terrainNormal`、下沉地標洞 `sunkHoles`、`isSpotValid`、招牌位置 `placeSignSpecs`、R 鍵回路面 `snapToRoad` 集中在一個入口。
- 地表高度用 `ElevationSampler` 介面(`surface.ts:10`),預設平面 `FLAT_ELEVATION`(`surface.ts:15`),網格雙線性插值 `GridElevationSampler`(`surface.ts:32-59`)。

### 2.5D 道路高度(9a16267)
- `WorldRoad` 新增 `layer`(0 地面、1+ 高架、-1 地下道)與 `elev`(各折點高度 × 10 的整數)(`src/map/types.ts:28-31`);`RoadWay` 同步(`types.ts:199-202`)。
- 車流、R 鍵回路面依車子高度 y 區分高架與平面道路(測試見下)。

### 拆出四個子系統(8857eec)
- `src/main.ts` 從 593 行降到 442 行(`git show 8857eec^:src/main.ts | wc -l` = 593;現行 `wc -l src/main.ts` = 442)。
- `PerfTracker`(`src/core/perf-tracker.ts:26`):每幀各子系統耗時(`FrameWork`,`perf-tracker.ts:4-13`)、平均 / 1% Low FPS、最慢 5 幀;不依賴 DOM,可在 Node 測。main.ts 用法 `main.ts:85`。
- `WorldChunkManager`(`src/world/chunk-manager.ts:22`):接 ChunkStreamer 與 three.js 場景 / Rapier 物理，生成時加網格與碰撞體(`chunk-manager.ts:36-56`)。main.ts 用法 `main.ts:93`。
- `TrafficSystem` / `TrafficPhysicsSync`(`src/traffic/traffic-system.ts:44`、`:11`):車流物理步進、繪製同步、夜間車燈、`hasCarNear`。main.ts 用法 `main.ts:116`。
- `PickupSession`(`src/game/pickup-session.ts:33`):接送狀態機、撞擊偵測、慈慈與光柱、HUD / 小地圖 / 大地圖標記。main.ts 用法 `main.ts:123`。

## 驗證
- `tests/unit/surface-and-loader.test.ts`:
  - `:33`「優先順序:?mapUrl 參數 > VITE_MAP_URL 環境變數 > 同站 BASE_URL/map,並自動正規化斜線」
  - `:52` 組合 world.json、skyline.json 與分區網址;`:59` fetchWorld 失敗時錯誤含狀態碼與網址
  - `:85`、`:93` GridElevationSampler 插值與法向量
  - `:110`–`:154` 2.5D 路網(依車高分道路、匝道高度與仰角、snapToRoad 在橋上留在橋面)
  - `:171`–`:205` 車流不會從高架跨層轉進平面道路、可沿匝道爬升、高架上的車不因橋下玩家煞車
  - `:227`–`:248` WorldSurface 空間查詢
- `tests/unit/subsystems.test.ts`:`:10` PerfTracker 統計;`:39` TrafficPhysicsSync 建立 / 更新 / 移除剛體並反映高架高度。
- WorldChunkManager、PickupSession 沒有單元測試(`docs/reviews/2026-11-21/architecture.md:115-120` 也指出)。
- 截圖:not_stated(commit 沒有附圖)。

## 放棄的方案
- not_stated。
- 參考:`docs/research/map-expansion.md`「伺服器」段列過 GitHub Releases 附檔(不適合幾千個小檔)與 Cloudflare R2(要開帳號);實作保留了 `VITE_MAP_URL` 入口，但目前沒用 R2(推論，依 CI 沒設此變數)。

## 待 Cooper
- 是否要改用外部檔案空間(例如 Cloudflare R2)放地圖檔;要開帳號，由 Cooper 決定。
- 子系統拆分屬於技術路線，若無異議可視為定案。
