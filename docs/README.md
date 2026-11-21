# 文件索引

專案:台中 MINI 兜風(工作名稱)— three.js 網頁開車遊戲,玩家開 Q 版 MINI Cooper 在依真實資料生成的台中市區兜風。

## 閱讀順序

1. `production-plan.md` — 製作規劃書(需求、玩法、地圖策略、美術、技術、里程碑、拍板紀錄)
2. `research/osm-taichung-feasibility.md` — OSM 台中資料實查結果(數字可用 `tools/research/` 腳本重現)
3. `research/data-licensing.md` — 資料與智財授權調查
   `research/slop-newyork-analysis.md` — mrdoob/slop-newyork 參考分析
   `research/range-a-terrain-rail.md` — 範圍 A 地形高差與高架鐵路調查
   `research/road-width-data.md` — 臺中市政府道路寬度資料與 OSM 對應
   `research/road-markings-tw.md` — 台灣道路標線法規尺寸(遊戲標線依據)
   `research/data-sources.md` — **地圖資料來源總表**(資料集 ID、下載方式、sha256、處理腳本;換電腦重建地圖用)
   `research/building-lane-data.md`、`research/street-furniture-data.md`、`research/gov-road-map.md` — 市政府建物、行道樹、道路圖調查
   `research/google-paid-options.md` — Google 付費方案能否當參考(結論：不能)
   `research/night-mode-assessment.md` — 夜景可行性評估
   `research/map-expansion.md` — 地圖擴展評估(含全台中、分區載入、伺服器)
4. `decisions/` — 每個重要決策一檔,含放棄的方案與理由(清單由 `node tools/dev/decision-index.mjs` 自動產生)
   <!-- decisions:start -->
   - `0001-map-data-source.md` 地圖資料來源
   - `0002-tech-stack.md` 技術選型
   - `0003-licensing-research-method.md` 授權調查的取證方法與判讀原則
   - `0004-osm-feasibility-research-method.md` 決策紀錄:OSM 台中資料可行性調查(2026-10-11/12)
   - `0005-cooper-direction-v0.2.md` Cooper 方向拍板(規劃書 v0.2)
   - `0006-m0-implementation.md` M0 技術驗證的實作決定
   - `0007-m0-feedback.md` M0 試開回饋與 M1 建模工具提案
   - `0008-mini-model-approach.md` MINI 模型製作路線(重新評估)
   - `0009-slop-newyork-adoption.md` 參考 slop-newyork 的借用清單
   - `0010-terrain-and-rail.md` 範圍 A 地形與高架鐵路的處理方式
   - `0011-road-width-mapping.md` 政府路寬資料的對應方式與換算
   - `0012-world-data-v2.md` 地圖資料格式 v2 與分塊生成
   - `0013-landmark-pipeline.md` 地標管線
   - `0014-minimap.md` 小地圖
   - `0015-street-visual-upgrade.md` 城市、馬路、街道畫面優化(提案)
   - `0016-console-look.md` 畫面整體升級:「遊戲主機般的設計感」(提案)
   - `0017-city-speed-steering-first-person.md` 市區極速 60、轉向收斂、第一人稱視角(2026-11-12)
   - `0018-fp-hood-double-yellow.md` 第一人稱引擎蓋、雙黃線扭曲修正(2026-11-12)
   - `0019-distant-mountains-clouds.md` 遠景山脈(依實際地形)與雲的多樣化(2026-11-12)
   - `0020-tripo-street-props.md` Tripo 街道物件(路燈、路樹)體檢(路燈可用;路樹需要重新生成;等 Cooper 決定)
   - `0021-github-public-repo.md` 推上 GitHub 公開 repo、commit 改用英文(已完成)
   - `0022-github-pages.md` 對外試玩網址:GitHub Pages(已採用)
   - `0023-facade-from-fps-project.md` 建築立面：參考台中七期 FPS 專案(已實作，等 Cooper 看過拍板(品味判斷))
   - `0024-fewer-lights-signals-every-intersection.md` 路燈減半、每個路口放紅綠燈(已實作)
   - `0025-hide-trees-scooters.md` 行道樹、機車先移除(已實作)
   - `0026-buildings-off-road.md` 建築不壓到車道(已實作)
   - `0027-fill-buildings.md` 補虛構建築(已實作)
   - `0028-traffic-box-cars.md` 路上的其他車輛(方塊車)(已實作(數值待 Cooper 試玩後調))
   - `0029-pickup-cici.md` 玩法:接送慈慈(已實作第一版(數值、台詞待 Cooper 試玩後調))
   - `0030-mrt-viaduct.md` 文心路高架捷運(綠線)(已實作)
   - `0031-named-places.md` 知名地點(第一階段:掛名)(已實作第一階段;第二階段(每棟專屬造型)待分批)
   - `0032-dept-store-models.md` 專屬造型第一批:三棟百貨(已實作,等 Cooper 看過)
   - `0033-mrt-stations.md` 專屬造型第二批:捷運綠線車站(已實作,等 Cooper 看過)
   - `0034-hotel-models.md` 專屬造型第三批:兩棟飯店(已實作,等 Cooper 看過)
   - `0035-places-batch4-models.md` 專屬造型第四批:麥當勞、IKEA、圓滿戶外劇場、秋紅谷(已實作,等 Cooper 看過)
   - `0036-places-batch5-models.md` 專屬造型第五批(最後一批):金錢豹、蔦屋書店、朝馬運動中心(已實作,等 Cooper 看過)
   - `0037-bigmap-traffic-kinds-camera.md` 大地圖、車種(白黑黃 + 計程車 + 公車)、取消加速拉遠、地標配色查核(1–3 已實作,等 Cooper 試玩;4 只完成查核,改色等 Cooper 決定風格)
   - `0038-landmark-colours-true-to-photo.md` 地標配色改成照實(已實作)
   - `0039-gov-buildings-sample.md` 臺中市建物圖(真實樓層):西屯路 + 七期樣張 → 鋪到範圍 A 全區(全區已鋪，等 Cooper 試玩(尚未 commit))
   - `0040-top-speed-120.md` 極速 60 → 120 km/h(已實作)
   - `0041-gov-house-type-shops.md` 依建物圖房屋型態決定店面與招牌密度(已實作(未 commit))
   - `0042-trees-lights-night.md` 實測行道樹、路燈再減半、夜景第一步(N 鍵)(已實作(未 commit),等 Cooper 看夜景與行道樹)
   - `0043-headlights-trees-visibility.md` 夜裡開大燈;行道樹看不到的原因(大燈已實作(未 commit);行道樹顯示方式等 Cooper 決定)
   - `0044-generated-trees-default.md` 行道樹預設顯示，用程式生成的 5 種樹形(InstancedMesh)(已實作(未 commit))
   - `0045-lowpoly-trees.md` 行道樹換成低多邊形樹(Tripo,5 棵、每棵 450 面)(已實作、已 commit。授權已確認:Cooper 2026-11-16「nailai7981 是我的 Pro 帳號沒錯…)
   - `0046-gov-lanes-speed.md` 依臺中市道路圖的車道數畫標線、依速限決定其他車輛車速(已實作(未 commit))
   - `0047-tree-size-car-lamps-signal-check.md` 樹縮小、車燈調暗、其他車輛夜裡開車燈、紅綠燈位置檢查(1、2 已實作並推上(7141530);3 Cooper 選 A,已實作(未 commit))
   - `0048-main-split-cloud-map-loader.md` 主程式拆分與雲端地圖載入(已實作(補記於 2026-11-21;commit 9a16267、8857eec))
   - `0049-map-data-orphan-branch.md` 地圖資料移到 orphan map-data 分支(已實作(補記於 2026-11-21;commit 5d2b2db))
   - `0050-map-region-tiles-streaming.md` 地圖分區檔與執行時串流(已實作(補記於 2026-11-21;commit 615e72a、22bdf3a))
   - `0051-elevated-roads-ramps.md` 高架道路與匝道(74 快速道路、光明陸橋)(已實作(補記於 2026-11-21;commit b2011a7、6bfe400))
   - `0052-map-expand-8x8km.md` 地圖範圍擴大到 8.2 × 8.0 km(已實作(補記於 2026-11-21;commit de94b04))
   - `0053-dtm-terrain.md` DTM 地形(高低起伏、道路貼地、物理、地面圖層排序)(已實作(補記於 2026-11-21;commit 71888d7、9a80df0、02fb027))
   - `0054-famous-places-landmark-batch.md` 知名地點擴充與地標模型批次(44 個地點、31 個 GLB)(已實作(補記於 2026-11-21;commit 8c5be7e、1448931、7956c14、01428df))
   - `0055-bigmap-fast-travel.md` 大地圖點擊快速移動(已實作(補記於 2026-11-21;commit e8e32fd))
   <!-- decisions:end -->
5. `reviews/2026-11-21-project-review.md` — 專案優缺點分析報告(細節在 `reviews/2026-11-21/`)
6. `milestones/M0-report.md` — M0 驗收報告
   `milestones/M1-plan.md` — M1 實作計畫(待 Cooper 確認)
7. `art/m0-style-sample/` — 方案甲風格樣張截圖
   - `art/landmarks-reference.md` — P0 地標外觀參考(高度出處、量體、主色;§10、§11 為更正)
   - `art/landmarks-checklist.md` — 地標模型操作手冊(改高度、改模型、驗證)
   - `art/landmarks/` — 地標預覽圖與遊戲內截圖
   - `art/m1-minimap/` — 小地圖截圖(車頭朝上、北朝上)
   - `art/visual-baseline/` — 街道優化前的原始畫面
   - `art/street-checklist.md` — 街道細節操作手冊(擴大範圍、改規則、驗證)
   - `art/building-checklist.md` — 建築變化操作手冊(細分類、窗格、店面、廟宇、屋頂附加物)
   - `art/furniture-checklist.md` — 街道傢俱操作手冊(行道樹、路燈、號誌桿)
   - `art/street-sample/after/` — 街道優化樣張區截圖(`tools/shots/street-shots.mjs` 產生)

## 從零重做這份規劃需要的東西

- 原始需求(見 `production-plan.md` §1.1 的「原始需求」欄)
- 地圖資料:`research/data-sources.md` 列出每份原始資料的下載方式與 sha256;建置順序見專案根目錄 README「Map data」;只要玩或開發的話 `npm run map:pull` 即可
- `data/osm/raw/` 的 OSM 原始資料 + `tools/research/` 的統計腳本 → 可重現所有資料統計
- `research/` 兩份調查的來源 URL → 可重新查證授權結論
- `decisions/` → 了解每個選擇為何如此、放棄了什麼

## 文件規則

- 修改 `docs/` 下既有規格檔前,先建立 `.bak` 副本。
- 決策與放棄的方案寫進 `decisions/`,編號遞增;新增後執行 `node tools/dev/decision-index.mjs` 更新索引(`npm test` 會檢查索引是否最新)。
- 查不到的資料寫 not_stated,不腦補。
