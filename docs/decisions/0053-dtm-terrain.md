# 0053 DTM 地形(高低起伏、道路貼地、物理、地面圖層排序)

日期:2026-11-20(地形主體 71888d7、修正 9a80df0);2026-11-21(路面撕裂修正 02fb027)
狀態：已實作(補記於 2026-11-21;commit 71888d7、9a80df0、02fb027)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 先前決定:`docs/decisions/0010-terrain-and-rail.md` 地形選 **A1 維持平面 y=0**(Cooper 2026-10-24:「三件事情按照你建議為主」),並寫「擴大到範圍 B 時，再評估 A3(粗地形 100–200 m)」。
- 這次改成 3D 地形，推翻 0010 的 A1。地圖只擴到 65 km²(0052),不是 0010 說的範圍 B;改做地形的理由與是否經 Cooper 同意:not_stated。
- 相關:`docs/research/map-expansion.md` 追加段第 4 點:「全台中包含大肚山台地、東邊丘陵，平的會很怪 → 要另外決定(做地形高低是大工程)」。

## 決定
### 資料(71888d7)
- 來源：內政部 20 m DTM 臺中市分幅(政府資料開放授權第 1 版),原始檔放 `data/elevation/moi_dtm20_taichung/taichung_dem20.zip`(不進版控，`.gitignore:18`);下載紀錄 `data/elevation/fetch_log.tsv`。同一份資料 0010 調查時已用過。
- 產生 `elevation.json`:`tools/map-build/elevation.py`,指令 `npm run map:elevation:range-a`(`package.json:20`)。
  - 網格間距 `STEP` 40 m、外擴 `MARGIN` 200 m、高度量化 0.1 m(`elevation.py:17-19`);平滑 2 次(`elevation.py:31`)。
  - 以出生點的高程當 y = 0(`elevation.py:149-152`)。
  - 現行檔：217 × 211 格、datum 79.98 m,相對高度 −41.0 m 到 +78.4 m、186 KB(2026-11-21 讀 `public/map/range-a/elevation.json`)。
- 執行端選用載入:`fetchElevation`(`src/map/load.ts:28-55`);檔案不存在或網址加 `?terrain=off` 就退回平面(`load.ts:33`)。

### 地面與道路貼地
- 每個 250 m 格子生成地形網格(`buildChunkTerrain`,`src/world/gen/terrain.ts:15`;`src/world/chunks.ts:571`),細分 `TERRAIN_CHUNK_DIVS` = 16(每格約 15.6 m,`terrain.ts:9`;02fb027 從 10 改為 16)。
- 綠地、人行道、路面、標線先做成平面，再依地形把每個頂點抬高(`drapeMeshArrays`,`terrain.ts:90`)。為了貼合坡面，線段先細分：地面 / 路面每 12 m、標線每 8 m、多邊形邊長上限 16 m(`chunks.ts:474-477`;02fb027 調整)。
- 細車道線加寬：白線至少 0.20 m、黃線至少 0.14 m,避免遠處斷線(`chunks.ts:506`;02fb027)。

### 物理(71888d7)
- 地形網格當碰撞面，摩擦 1.0(`src/world/chunk-manager.ts:44-46`,用 `addStaticRoadDeck`)。
- 有地形時，保底地面降到 y = −120、邊界牆加高到涵蓋 −100 ~ +260 m(`src/physics/world.ts:28`、`:35-36`)。
- 車流的高度與仰角依地形取樣(`src/traffic/traffic.ts:91`、`:120-122`、`:144-150`);main.ts 依是否有地形傳入(`src/main.ts:77-78`、`:121`)。
- 分區還沒到時，車子 250 m 內有地形的格子先用骨架建碰撞(`src/world/streamer.ts:106`)。

### 建築在坡地(9a80df0)
- 建築一樓放在外框各點地表高度的最高值，裙腳往下延伸到最低點再 2.5 m(至少 3 m),高坡側不被埋、低坡側不懸空(`chunks.ts:541-547`;`buildingElevationRange`、`extendBuildingSkirt` 在 `terrain.ts:104`、`:128`)。
- 地標模型裙腳的測試門檻：最低點 ≥ −3.2 m(`tests/unit/landmark-models.test.ts`,1448931 加入)。

### 地面圖層排序與閃爍 / 撕裂修正
- 9a80df0:
  - 視覺地形比碰撞面低一點，並推後深度，避免灰色地形穿出路面。
  - 地面圖層改用「貼地前的相對層高」`aLayer` 做深度偏移(不受海拔 −41 ~ +78 m 影響)。
- 02fb027(取代 9a80df0 的 `aLayer` 做法):
  - 地面類材質關閉 depthWrite、保留 depthTest(`src/render/scene.ts:190-194`)。
  - 用固定繪製順序：地形、建築、車、樹、高架 = 0(會寫深度)→ 綠地 / 水 / 人行道 / 路緣 = 1 → 路面與路口 = 2 → 分隔島 / 斑馬線 / 標線 = 3(`scene.ts:186-188`、`:256-258`)。
  - 地形網格視覺下移 0.2 m、polygonOffset factor 4 / units 8(`scene.ts:240-245`;9a80df0 時是 0.08 m、2 / 4)。物理仍用原高度。
  - 格子資料拆成 `ground`、`roadSurface`、`roadMarks` 三層(`chunks.ts` 的 `ChunkMeshes`)。

## 驗證
- `tests/unit/terrain.test.ts`:
  - `:25` 地形網格法向量朝上、下沉地標處挖洞
  - `:44` Rapier 實測：車在 8% 坡上穩定爬升不穿地
  - `:62` 實際 `range-a/elevation.json` 可載入、涵蓋全區高低差，生成貼地建築與地形網格
- `tests/unit/surface-and-loader.test.ts:85`、`:93` 高程插值與法向量。
- 9a80df0、02fb027 是畫面修正，沒有新增畫面測試;02fb027 只把 `terrain.test.ts` 的格數改成引用 `TERRAIN_CHUNK_DIVS`。修正前後的截圖:not_stated(commit 沒有附圖)。
- 依全域規則，這 3 個修正型 commit 應寫入踩坑記錄;`docs/reviews/2026-11-21/data-process.md:84` 指出沒有對應條目。本份不寫踩坑記錄。

## 放棄的方案
- 9a80df0 的 `aLayer` 深度偏移:被 02fb027 的「關閉 depthWrite + 固定繪製順序」取代(commit 標題:Eliminate road tearing)。
- 71888d7 初版的地形網格細分 10(每格 25 m):02fb027 改為 16。
- 0010 的 A1(平面)、A3(粗地形 100–200 m):這次直接用 40 m 網格。是否刻意不採 A3:not_stated。

## 待 Cooper
- 0010 的地形決定(A1 平面)已被推翻，請 Cooper 補確認是否同意改為 3D 地形。
- 0010 本身未修改;是否要在 0010 加註「已被 0053 取代」(修改前需先建 .bak)。
