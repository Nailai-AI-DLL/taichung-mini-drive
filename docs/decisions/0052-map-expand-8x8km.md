# 0052 地圖範圍擴大到 8.2 × 8.0 km

日期:2026-11-20
狀態：已實作(補記於 2026-11-21;commit de94b04)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 擴大前文件上的狀態:
  - `docs/design/map-expansion-draft.md` 第 3 項(地圖範圍):狀態寫「Cooper 還在考慮」;建議「之後第一步擴『北 +1.7 km、西 +1.5 km』:約 8.1 × 6.7 km = 54 km²」。
  - `docs/decisions/0031-named-places.md` 背景記錄 Cooper 2026-11-14:地圖範圍「我在思考一下跟你說」(未定)。
  - `docs/research/map-expansion.md` 結論:「建議先擴到 B 實測，再決定要不要做分區載入」(B = 10.7 × 9.4 km、100 km²)。追加段(2026-11-17)記錄 Cooper 提過「除了和平區之外的台中區域都包含進去」。
- 實際做的範圍(8.2 × 8.0 km、約 65 km²)比草案的北 + 西(54 km²)大、比 B(100 km²)小。為什麼選這個大小、是否經 Cooper 同意:not_stated。
- 草案寫明擴大要重新下載 OSM 與重新比對政府資料，「都要下載，需 Cooper 同意」;是否取得同意:not_stated。

## 決定
- 範圍(`tools/map-build/build.ts:69-81` range-a 設定;舊值取自 de94b04 diff):
  - 中心 [24.166, 120.66],半寬 `halfX` 4100 m、半高 `halfZ` 4000 m(`build.ts:75-77`;原為 [24.1525, 120.6625]、3300、2490)。
  - 經緯度 24.130–24.202°N、120.620–120.700°E(`build.ts:70`;原 24.130–24.175、120.630–120.695)。
  - 政府建物圖取用範圍 `rect` 改為 [24.12, 120.61, 24.21, 120.71](`build.ts:81`;原 [24.12, 120.62, 24.185, 120.705])。
- 範圍內新增(依 build.ts 註解):逢甲夜市、水湳中央公園、北屯、洲際棒球場、台 74 線西段與北段。
- OSM 查詢框同步放大(`tools/map-build/queries/range_a.overpassql:5-12`,南西北東 24.1286, 120.6185, 24.2034, 120.7015);另外三個查詢(nodes、rail、signals)也改了範圍。
- 路寬、車道數比對加上 `--bbox 24.130,120.620,24.202,120.700`(`package.json:15-16`)。
- 數量變化(擴大前取 `git show 5d2b2db^:public/map/range-a/world.json` 的 `meta.stats`;擴大後取現行 `public/map/range-a/index.json` 的 `meta.stats`,已包含之後 commit 的地標等變動):

  | 項目 | 擴大前 | 現行 |
  |---|---|---|
  | bounds(遊戲座標，公尺) | ±3300 / ±2490 | ±4100 / ±4000 |
  | 建築 `buildings` | 119,670 | 191,115 |
  | 道路 way `roadWays` | 5,620 | 9,352 |
  | 道路總長 `roadLengthM` | 817 km | 1,501 km |
  | 行道樹 `furnitureTrees` | 45,616 | 75,493 |
  | 路燈 `furnitureLights` | 1,571 | 2,754 |
  | 號誌 `furnitureSignals` | 2,420 | 3,853 |
  | 分區數 | not_stated(擴大前測試名稱寫 48) | 96 |

- 測試門檻跟著放寬(de94b04):world.json gzip 上限 6 MB → 12 MB(測試註解寫擴大後約 8.2 MB);政府建物數上限 130,000 → 220,000;OSM 補的建物上限 2,000 → 2,500(`tests/unit/world-chunks.test.ts:31`、`:40`、`:42`)。

## 驗證
- de94b04 修改的測試:`world-chunks.test.ts`(資料量門檻)、`map-tiles.test.ts`(遠處瞬移座標改為 x=2600, z=2500)、`elevated-road.test.ts`、`furniture.test.ts`、`viaduct.test.ts`。
- 實跑結果:not_stated(commit 沒有記錄;2026-11-21 審查報告寫 536 項單元測試全過，見 `docs/reviews/2026-11-21-project-review.md`)。
- 截圖:not_stated。

## 放棄的方案
- not_stated。
- 文件中出現過的候選(不確定當時是否比較):草案「北 +1.7 km、西 +1.5 km(54 km²)」;研究文件 B(100 km²)、C(209 km²)、D(全市)。

## 待 Cooper
- 補確認：這次擴大的範圍是否就是 Cooper 要的(草案第 7、8 題當時未回覆:「先做 1、2,再擴北和西」的順序;北邊要到水湳中央公園還是只到逢甲)。現行範圍已到 24.202°N,包含水湳中央公園。
- 是否繼續往研究文件的 B / C 或「和平區以外全台中」擴大。
- `docs/decisions/0037` 的大地圖範圍描述(6.6 × 5.0)已過時(`docs/reviews/2026-11-21/gameplay.md:60`),本份不修改 0037。
