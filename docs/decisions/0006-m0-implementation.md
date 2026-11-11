# 0006 M0 技術驗證的實作決定

- 日期:2026-10-12
- 狀態:已決定(純技術、可逆;依全域守則由 Claude 決定並記錄)
- 相關:`production-plan.md` §4.3、§6、§7;`docs/milestones/M0-report.md`

## 決定

| # | 項目 | M0 做法 | 與規劃書的差異 / 理由 |
|---|---|---|---|
| 1 | 地圖產物格式 | `public/map/<區域>/map.json`(路名索引、出生點、統計)+ `map.bin`(型別陣列) | 規劃書寫 GLB + meshopt。M0 只有 1 km²(412 KB),自訂二進位格式最簡單、零依賴;M1 範圍 A 分塊時再評估是否改 GLB |
| 2 | 路口路面 | 每條路做帶狀網格、兩端加圓形端蓋,重疊處不做聯集 | 規劃書寫 Clipper 聯集。路面同色同高、無貼圖,重疊不會閃爍;M1 要畫標線時才需要聯集 |
| 3 | 路寬 | 預設寬度表 + `lanes` 標籤;`data/overrides/road-width.json` 依 OSM id 覆寫(目前空) | Q13 決定的政府道路寬度資料移到 M1 接入(M0 驗收不需要) |
| 4 | 無樓層資料的建築高度(Q12) | 透天規模(<150 m²)4 樓;150–600 m² 5 樓;600–2000 m² 7 樓;>2000 m² 10 樓;apartments 8/14 樓;商業公共類 4/5/8 樓;工業 2 樓;車棚等 1.25 樓;再依 OSM id 加減 1 樓避免整排同高。層高 3.2 m | 數值是 Claude 的初值,集中在 `tools/map-build/lib/buildings.ts`,看過範圍 A 天際線後可調 |
| 5 | 建築 multipolygon | M0 略過(M0 區域內 0 筆) | M1 範圍 A 再處理 |
| 6 | 出生點 | 惠來路二段上最接近歌劇院中心的點,車頭沿道路方向 | |
| 7 | 車輛 | Rapier 射線懸吊控制器;四輪驅動 前 40% / 後 60%;手煞車降低後輪側向抓地 | 輪軸方向必須是 (0,0,1),設成 (0,0,-1) 時油門會讓車倒退(踩過的坑) |
| 8 | 路名牌字型 | 系統字型(PingFang TC 等)備援 | jf open 粉圓 在 M1 隨 UI 一起接入(須附 OFL) |
| 9 | 瀏覽器測試 | `playwright-core` 驅動本機已安裝的 Google Chrome(有視窗,才會用到真 GPU) | 不另外下載瀏覽器;測試時會短暫跳出 Chrome 視窗 |
| 10 | 路名測試點 | 用 Python 直接從 OSM 原始資料產生(`tools/research/make_road_name_fixture.py`),不經過遊戲建置管線 | 讓測試點和被測程式碼來源獨立 |
| 11 | 投影驗證 | 參考值來自獨立的純 Python 反算(`tools/research/twd97_to_wgs84.py`),不是 proj4 自己 | 回應規劃書驗收意見「proj4 自己驗自己」 |
| 12 | 程式目錄 | 遊戲迴圈直接放在 `src/main.ts`;沒有 core/、world/、landmarks/、modes/、audio/ | 規劃書 §6.2 的模組在 M0 還用不到,M1 再拆 |
| 13 | 路名搜尋半徑 | max(15 m, 最寬道路半寬 + 5 m) | 規劃書寫固定 15 m;寬路外側車道會超出 15 m |

## 放棄的方案

| 方案 | 放棄原因 |
|---|---|
| M0 就做 GLB + meshopt | 多兩個依賴、多一層轉檔,1 km² 看不出效益 |
| 路面先做 Clipper 聯集 | M0 沒有標線,聯集只增加建置時間與失敗點 |
| headless Chrome 量 fps | headless 可能走軟體繪圖,fps 不代表真實 |
| Playwright 自帶 Chromium | 要多下載約 150 MB;本機已有 Chrome |
| 測試駕駛撞到地圖邊界就判定失敗 | 地圖邊界本來就有牆;改成測試駕駛會在邊界前掉頭,另外檢查「卡住後能脫困」 |
