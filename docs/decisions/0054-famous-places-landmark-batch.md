# 0054 知名地點擴充與地標模型批次(44 個地點、31 個 GLB)

日期:2026-11-20
狀態：已實作(補記於 2026-11-21;commit 8c5be7e、1448931、7956c14、01428df)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 延續 `docs/decisions/0031-named-places.md`:
  - 第一階段「掛名」做了 18 個地點;待辦寫「七期以外的第二批地點(廣三 SOGO、勤美、草悟道、美術館、中友、好市多…)」與「18 個地點的專屬造型，分批做…優先順序待 Cooper 指定」。
  - Cooper 2026-11-14:「希望每棟都做，可以分階段陸續製作。」
- `docs/design/map-expansion-draft.md` 1-C 列過第二批候選(廣三 SOGO、勤美誠品、國美館、科博館、中友、好市多、文心路沿線捷運站)。
- 這次新增的麥當勞 10 間、星巴克 5 間、水湳北屯 7 個地點，選擇依據與 Cooper 是否指定:not_stated。

## 決定
### 地點清單(8c5be7e)
- `data/landmarks/places.json` 從 18 個增為 62 個(新增 44 個;`tests/unit/places.test.ts:79` 驗 62 個):
  - 臺中車站 1 個(`places.json:22`)
  - 獨棟麥當勞 10 間(`places.json:24-33`)
  - 星巴克 5 間(`places.json:35-39`)
  - 水湳 / 逢甲 / 北屯 7 個:洲際棒球場、漢神洲際、中央公園、綠美圖、會展中心、逢甲夜市、迪卡儂北屯(`places.json:41-47`)
  - 市區 14 個：科博館、國美館、勤美誠品、廣三 SOGO、市民廣場、審計新村、臺中公園、中友百貨、一中街、第二市場、宮原眼科、大魯閣新時代、好市多、文心秀泰(`places.json:49-62`)
  - 文心路沿線捷運站 7 個(`places.json:64-70`)
- 位置來源沿用 0031 的四種(OSM id、既有地標 id、捷運站名、經緯度 `at`)。
- 接送點離地點的距離上限從 150 m 放寬到 260 m(測試名稱寫「含大型園區如洲際棒球場與中央公園」,`places.test.ts:87`)。

### 地標模型(1448931、7956c14、01428df)
- 共 31 個新 GLB(`public/models/landmarks/`),`data/landmarks/landmarks.json` 現有地標 48 個:
  - 1448931:麥當勞 10 + 星巴克 5 = 15 個(例:`landmarks.json:245-248` mcdonalds-wenxin6)
  - 7956c14:市區 11 個(湖心亭、科博館溫室、國美館、勤美、廣三 SOGO、中友、第二市場、宮原眼科、大魯閣、好市多、秀泰;例:`landmarks.json:425-428` chungyo-dept)
  - 01428df:水湳北屯 5 個(洲際棒球場、漢神洲際、綠美圖、會展中心、迪卡儂;例:`landmarks.json:479-482` intercontinental-stadium)
- 有模型的地點在 `places.json` 改為 `"landmark": <id>`(例 `places.json:24`、`:41`、`:56`)。
- 建模腳本(Blender 程序化建模，不是 Tripo):
  - `tools/models/landmark_mcdonalds_batch.py`(各店正面方位角清單 `:22-33`)
  - `tools/models/landmark_starbucks_batch.py`
  - `tools/models/landmark_downtown_batch.py`
  - `tools/models/landmark_north_batch.py`
  - 一次全部重建:`npm run models:landmarks`(`package.json:26`)。
- 外框:`data/landmarks/footprints-range-a.json`(三個 commit 都有新增)。
- 坡地：模型底座往下延伸約 2.8–3 m 實心裙腳，配合 0053 地形(各腳本開頭說明;測試門檻最低點 ≥ −3.2 m)。

### 品牌處理(沿用 0031)
- 招牌只有文字、不放商標圖案;麥當勞、星巴克腳本開頭明寫「不放任何註冊商標圖案，店名由遊戲端的樓頂文字招牌顯示」(`landmark_mcdonalds_batch.py:8`、`landmark_starbucks_batch.py:3`)。
- 注意：星巴克模型飾帶用品牌綠 `#00704A`(`landmark_starbucks_batch.py:5`、`:39`),`places.json` 的代表色也是 `#00704A`。0031 允許「代表色」,但沒有明講品牌標準色用在模型外觀是否可以(推論：屬於灰色地帶)。

## 驗證
- `tests/unit/places.test.ts`:`:79` 62 個地點都在;`:87` 每個接送點在地圖內、不在路面、不在建築裡、離地點 ≤ 260 m;`:107` 有建築的地點帶外牆色、周圍 30 m 不補建築。
- `tests/unit/landmark-models.test.ts`:`:234` 起每個地標的朝向檢查;`:251` 起每個地標「底面貼齊外框、沒有鏡像、高度正確」(依 `landmarks.json` 逐一產生)。
- 預覽圖(commit 內附):
  - 1448931:`docs/art/landmarks/mcdonalds-chongde3-front.png`、`-front34.png`,`mcdonalds-wenxin6-front*.png`,`starbucks-chongde-front*.png`,`starbucks-daying-front*.png`
  - 7956c14:`chungyo-dept`、`miyahara`、`nmns-greenhouse`、`parklane-cmp`、`second-market`、`taichung-park-pavilion` 各一張 `-front34.png`
  - 01428df:`decathlon-beitun`、`green-museumbrary`、`hanshin-intercontinental`、`intercontinental-stadium`、`taichung-icce` 各一張 `-front34.png`
- 遊戲內截圖:not_stated。

## 放棄的方案
- 商標圖案、品牌字體:沿用 0031 的放棄理由(repo 公開，商標圖案風險高)。
- 其他:not_stated。

## 待 Cooper
- 新增地點的選擇(特別是連鎖店 15 間)是否符合 Cooper 的意思;`docs/reviews/2026-11-21/gameplay.md:64` 指出 48 個地標裡連鎖店佔 31%。
- 星巴克模型使用品牌綠 `#00704A` 當外觀飾帶是否可以;要不要放品牌 logo(涉及商標，非法律意見)。
- 新增的 44 個地點中，只有 31 個有專屬模型;其餘(例如捷運站、逢甲夜市、中央公園、市民廣場、審計新村、一中街)仍只有招牌。要不要做、優先順序待 Cooper 指定。
