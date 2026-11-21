# 0050 地圖分區檔與執行時串流

日期:2026-11-19
狀態：已實作(補記於 2026-11-21;commit 615e72a、22bdf3a)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 相關文件:`docs/research/map-expansion.md`
  - 瓶頸 1:「開場一次載入整張地圖」,檔案、解析時間、記憶體都和面積成正比。
  - 追加段(2026-11-17)記錄 Cooper 的需求:「一開始載入只先以某幾區為主(例如西屯區、北區、西區、南屯區),其他區域放在背景陸續載入。」文件建議改成「依距離載入、遠的丟掉」,每 1 km 一檔，並列為建議順序第 1 步。
- Cooper 是否同意這個做法:not_stated。

## 決定
### 建置輸出(615e72a)
- 分區大小 `DEFAULT_TILE_SIZE` = 1000 m(`src/map/tiles.ts:22`),等於 4 × 4 個 250 m 格子(`tiles.ts:41-43`)。
- 建築、街道標線、街道傢俱移到 `tiles/<tx>_<tz>.json`;`index.json` 是去掉這些後的骨架，加上 `tileSize`、`tiles` 清單(`tiles.ts:226-233`)。知名地點把建築外框一起放進 index(`tiles.ts:218-224`),讓招牌不用等分區。
- 寫檔:`tools/map-build/lib/write-tiles.ts:8-39`;`build.ts` 建完 world.json 後接著寫分區(`tools/map-build/build.ts:859-862`);也可只從既有 world.json 切(`tools/map-build/tile.ts`,`npm run map:tile:range-a`,`package.json:18`)。
- 現況:`public/map/range-a/tiles/` 96 個檔、共 31 MB;`index.json` 2,414,677 bytes(2026-11-21 本機 `ls`)。

### 執行時串流(22bdf3a)
- 載入:`fetchWorld` 先抓 `index.json` 與 `elevation.json`(`src/map/load.ts:106-110`),再一次抓出生點周圍的分區(`load.ts:128-147`)。
- 開場預載半徑:`initialTileRadius` 預設 1500 m(`load.ts:128`)。注意 `load.ts:71` 的註解寫「預設 900 m」,與程式不一致。
- `TileStreamer` 預設(`tiles.ts:453-457`):
  - 載入半徑 `loadRadius` 1200 m
  - 卸載半徑 `unloadRadius` 4500 m
  - 同時下載數 `maxConcurrent` 6
- 每幀最多套用 1 個已下載的分區，挑離玩家最近的(`tiles.ts:503-520`);該幀若有套用，250 m 格子的網格生成讓到下一幀(`src/world/chunk-manager.ts:94-97`)。
- 分區還沒到的格子不生成(`src/world/streamer.ts` `isChunkReady`);例外:250 m 內有地形或高架橋的格子先用骨架建碰撞體，避免掉下去(`streamer.ts:71-73`、`:106`)。分區套用或卸載時讓受影響的格子重建(`invalidateChunks`,`chunk-manager.ts:81-83`)。
- 250 m 格子串流參數沿用：載入 800 m、卸載 950 m、每幀 4 ms(`streamer.ts:27`)。
- 關閉分區:網址加 `?tiles=off`(`load.ts:104`),或伺服器上沒有 `index.json` 時，退回整份 `world.json`(`load.ts:153-160`)。

### world.json 保留的用途
- 上面的退回路徑(`load.ts:153`)。
- `tools/map-build/tile.ts:14-23` 從 world.json 重新切分區。
- 天際線建置 `npm run map:skyline:range-a` 讀 world.json(`package.json:19`)。
- 單元測試用 world.json 對拍分區結果(見「驗證」)。

## 驗證
- `tests/unit/map-tiles.test.ts`:
  - `:26` 分區後 index.json 不含一般建築
  - `:36` 全部分區套用後，每格內容與網格頂點數和 world.json 100% 一致
  - `:63` 重複套用冪等、卸載可乾淨釋放
  - `:88` index.json 與所有分區檔存在(測試名稱寫「體積 < 2 MB」,但程式只檢查建築為 0、分區數 > 30、檔案存在;現行 index.json 約 2.4 MB)
  - `:96` 建築、樹、路燈、號誌總數與 world.json 相等
  - `:120` 只載 index 時，知名地點招牌座標與完整 world.json 一致
  - `:127` 開場只下載 index 與出生點周圍分區，開到遠處按需下載並卸載舊區(測試名稱寫「全區 48 區」,現行為 96 區)
- e2e `tests/e2e/run.mjs`:新增檢查「分區按需載入：只載入附近分區(遠少於全區總數)」(22bdf3a)。
- 截圖:not_stated。

## 放棄的方案
- not_stated。
- 參考:`docs/research/map-expansion.md` 指出「背景把全部載完」不可行(全部進記憶體約 2 GB 以上);這是研究文件的評估，不確定當時是否作為方案比較。

## 待 Cooper
- 開場預載範圍：目前是出生點 1500 m 內的分區，不是 Cooper 提過的「西屯、北、西、南屯幾區」。要不要改成依行政區預載，請 Cooper 決定。
- 技術小項(不需 Cooper 決定，記下供後續修):`load.ts:71` 註解 900 m 與程式 1500 m 不一致;`map-tiles.test.ts:88`、`:127` 測試名稱的數字過時。
