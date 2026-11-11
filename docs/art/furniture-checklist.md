# 街道傢俱操作手冊(行道樹與樹種、路燈、號誌桿、機車排、直式招牌、公車站、碰撞)

決策與理由見 `docs/decisions/0015-street-visual-upgrade.md` §11。

## 檔案地圖

| 要改什麼 | 檔案 |
|---|---|
| 哪些道路種樹 / 立燈 / 停機車、樹距、燈距、機車排長度、樹種權重、招牌高度與機率、公車站尺寸、離路緣距離、淨空、碰撞半徑 | `src/config/furniture.ts` |
| 樹冠、樹幹、桿子、燈頭、號誌燈箱與紅黃綠燈、機車車身與深色部件的顏色 | `src/config/palette.ts` 的 `treeCrown` `treeTrunk` `pole` `lampHead` `signalBox` `signalLamps` `scooterBody` `scooterDark` `treeSpeciesCrown` `palmTrunk` `signBoards` `signText` `signTextOnWhite` `busBlue` `busRoof` `busGlass` |
| 擺放邏輯(避開車道、路口鋪面、穿越道、建築、水面、水道;機車只停店面前) | `tools/map-build/lib/furniture.ts` 的 `placeFurniture` |
| 樹種怎麼選(同路名同一種) | `tools/map-build/lib/furniture.ts` 的 `treeKindOf` |
| 公車站資料下載(OSM 節點) | `bash tools/map-build/fetch-range-a-nodes.sh` → `data/osm/raw/range-a/range-a_nodes.json`;查詢在 `tools/map-build/queries/range_a_nodes.overpassql` |
| 哪些穿越道算有號誌(OSM `crossing=traffic_signals`) | `tools/map-build/build.ts`(`crossings.push` 的 `signals`)→ `tools/map-build/lib/street.ts` 的 `sig` |
| 樹(5 種樹形,`addTree` 的 `kind`)、路燈、號誌桿、直式招牌(`addSign`)、公車站(`addBusStop`)的幾何;機車樣板(零件表 `SCOOTER_PARTS`、`scooterTemplate`)與每台擺放(`scooterPoses`) | `src/world/gen/furniture.ts` |
| 機車的畫法(所有格子共用一個 InstancedMesh) | `src/render/scooters.ts` 的 `ScooterLayer`;`src/render/scene.ts` 的 `addChunkMeshes` / `removeChunkMeshes` |
| 碰撞(圓柱、一排機車一個長方體) | `src/world/chunks.ts` 的 `furnitureCollision`;`src/physics/world.ts` 的 `addStaticFurniture`;`src/main.ts` 的 onLoad |
| 分格、併進建築網格 | `src/world/chunks.ts`(`decodeWorld` 的 `json.furniture`、`buildChunk` 的 `fm`);`src/render/scene.ts` 的 `concatArrays` |
| world.json 格式 | `src/map/types.ts` 的 `WorldFurniture` |

## 改了之後要做什麼

| 改的是 | 要重新建置地圖? |
|---|---|
| 顏色、尺寸(`TREE_CROWN_R`、`LIGHT_H`、`SIGNAL_BOX`…) | 不用(執行端),重新整理頁面 |
| 擺放(哪些路、間距、離路緣、淨空、機車規則) | 要:`npm run map:build:range-a`;看終端的 `furnitureTrees` `furnitureTreeKind0–4` `furnitureLights` `furnitureSignals` `furnitureScooters` `furnitureSigns` `furnitureBusStops` `furnitureBusShelters` |
| 碰撞半徑、高度 | 不用 |

每次都跑:

1. `npx vitest run`(`tests/unit/furniture.test.ts`:擺放規則、機車排、法向量、燈頭方向、碰撞(車子撞樹 / 撞機車會被擋)、實際資料「沒有傢俱在車道 / 路口鋪面 / 水道上」「沒有樹在建築裡」「分格後和 world.json 一一對應」)。
2. `npm run test:e2e`(fps ≥ 58、draw call < 300、高速穿越無 > 33 ms 卡頓、撞到行道樹會被擋下;特別看「單格生成最長」)。
3. 截圖對照:
   ```bash
   node tools/shots/street-shots.mjs docs/art/furniture-sample/after furniture
   ```
   ```bash
   python3 tools/shots/compare.py docs/art/furniture-sample
   ```
   機位:f01 惠中路、f02 台灣大道、f03 七期號誌路口、f04 七期俯瞰、f05 舊城區、f06 五權路、f07 出生點附近號誌、f08 台灣大道俯瞰、f09–f10 機車排、f11 招牌、f12 候車亭、f13 站牌、f14–f17 層狀 / 叢生 / 椰子 / 尖塔樹。
4. 要拍「改前」:先把 world.json 的 `furniture` 拿掉再拍 `before/`,拍完重新建置(或從備份還原)。

## 常見問題

| 現象 | 原因 / 處理 |
|---|---|
| 傢俱立在路口的路面色上 | 路口鋪面要傳進 `placeFurniture`(`obstacles.junctions`);曾經漏掉,192 件立在鋪面上(0015 §11.7) |
| 傢俱在河上 | 水道是帶狀,要另外檢查(`obstacles.waterways`);只檢查水面多邊形會漏(0015 §11.7) |
| 機車看起來像椅子 | 輪子要是圓的(`addWheel` 八角柱);方塊輪像椅腳 |
| 撞到傢俱沒反應 | `main.ts` onLoad 有沒有呼叫 `addStaticFurniture`;e2e「撞到行道樹會被擋下」會量到 |
| e2e 撞樹測試失敗,但手動開去撞會停 | 測試起點不能和別的傢俱重疊(曾經退太遠、落在對面的樹上) |
| 加了新傢俱後高速開車卡頓 | 數量多的東西不要逐個生成網格併進格子網格;改用共用 InstancedMesh(機車的做法,0015 §11.8)。先用 Node 量單格生成時間 |
| 加一種樹形 | `TREE_SPECIES` 加一項、`TREE_SPECIES_WEIGHTS` 加權重、`treeSpeciesCrown` 加顏色、`addTree` 的 switch 加一個 case;要重新建置地圖 |
| 公車站全部不見 | `range-a_nodes.json` 不在(重新跑下載腳本);建置終端的 `busStopNodes` 是 0 |
| 招牌插進隔壁建築 | 沿板子取 3 點檢查;`SIGN_DEPTH` 太長也會 |
| 舊城區窄街沒有招牌 | 不要禁止招牌伸到車道上方(外牆貼著路,一禁就整條街消失;0015 §11.10) |
| 同一條路的樹種不一樣 | `treeKindOf` 要傳整條路(同路名)最窄的寬度 |
| 樹或桿子長在馬路上 | 看 `placeFurniture` 的 `ok()`:平行的路只擋「在車道上」,橫交的路多留 `CLEAR_ROAD`;分隔幹道中間若鋪成路面色,桿子會像在車道上(0015 §11.4) |
| 路口轉角太空 / 太擠 | `CLEAR_ROAD`(橫交道路淨空)、`CLEAR_CROSSWALK` |
| 重疊描繪的路種了兩排 | 同類最小間距 `TREE_MIN_GAP` / `LIGHT_MIN_GAP`(`furniture.ts` 開頭) |
| 樹冠從背面看是破的 | 三角形繞向;測試「法向量都朝外」會量到 |
| 傢俱出現窗格 | 代碼不是 `PLAIN_CODE`;測試「代碼全是 PLAIN_CODE」 |
| 高速開車時卡頓 | 看 e2e 報告的 `stream.worst`(最慢幀前一幀的分項);傢俱是第二段生成(`buildFurniture`、streamer 的 `onFurniture`),不要再塞回 `buildChunk` 的同一幀 |
| 寫測試時改壞擋不住 | 例子:十字路口測試原本用「在哪條路的人行道帶上」分類,剛好把要檢查的淨空區排除掉了;改成橫交道路本身不放傢俱,全部傢俱都屬於同一條路 |
