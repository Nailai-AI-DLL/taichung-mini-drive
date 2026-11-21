# 資料治理與專案流程審查(HEAD 02fb027,2026-11-21)

審查範圍：資料管線、授權合規、決策文件、repo 健康度、驗證文化。只讀，未改任何專案檔。
標記：【事實】= 指令輸出或檔案內容;【推論】= 審查員判斷。法律相關段落皆為**非法律意見**。

## 摘要

- 程式面健康：單元測試 36 檔 / 536 項全過(`npx vitest run`,2026-11-21 21:51 實跑);CI(`.github/workflows/pages.yml`)先 `map:pull` 再 `npm test` 再 build,部署前有測試把關。
- 流程面明顯斷層：最近 16 個 commit(4d42ad4..HEAD,11/19–11/21)**沒有任何一份決策文件**,包含地圖資料搬到 orphan 分支、分區串流、雲端載入、高架道路、DTM 地形、擴圖到 65 km² 等架構級改變。`README.md`、`docs/README.md`、`docs/milestones/M1-progress.md` 都停在 11/11 或更早，其中 README 對地圖資料的描述已與事實相反。
- 可重建性：OSM 有下載腳本;**市政府建物圖、道路圖、行道樹、內政部 DTM 沒有下載腳本**,下載紀錄(SOURCE.md、fetch_log.tsv)只存在 gitignored 的 `data/`,換電腦後遺失。
- 授權：README credits 大致齊全，但漏「臺中市各類 GIS 道路圖(162899)」;遊戲內 credit 漏 DTM 與道路圖。打包的地圖資料依專案自己的授權研究屬 ODbL 衍生資料庫，但 repo / map-data 分支沒有任何授權聲明，也沒有 LICENSE。
- repo 體積:`.git` 235 MB,其中 200.7 MB 是 18 個歷史版本的 `public/map/range-a/world.json`;搬到 orphan 分支後 main 歷史仍保留這些 blob。另 `docs/art` 有 160 MB 被追蹤。

---

## 一、優點(附證據)

1. **CI 有測試門檻、地圖從 map-data 分支取得**【事實】
   `.github/workflows/pages.yml`:`sync-map-branch.sh pull` → `npm ci` → `npm test` → `npm run build`。測試沒過就不部署。
2. **測試量大且全綠**【事實】`tests/unit/` 36 檔,536 項全過(33.9 秒)。涵蓋 terrain、elevated-road、map-tiles、surface-and-loader 等最近新增的功能。
3. **敏感資料隔離做得好**【事實】
   - `.gitignore` 排除 `mini60/`(實車參考照)、`.env*`(Tripo 金鑰)、`docs/art/mini-3view/overlay.png`、原始下載資料。
   - `git grep` 掃 `tsk_`、`sk-`、`ghp_`、`AKIA`、Bearer、api_key 字串：只命中文件中對金鑰前綴的說明(`docs/decisions/0016-console-look.md:276`、`tools/models/tripo.mjs:17`),沒有實際金鑰。
   - commit 作者用 noreply 信箱(`docs/decisions/0021-github-public-repo.md:14`);16 個新 commit 作者皆為 Nailai-AI-DLL。
4. **商標風險有明確決策並落實**【事實】`docs/decisions/0031-named-places.md:23,29` 規定招牌只放文字、不放商標圖案;`tools/models/landmark_mcdonalds.py:9` 寫明不放金色拱門。`docs/art/places/*.jpg` 抽查為遊戲截圖(非網路照片);地標外觀參考只看 Wikimedia Commons、不下載(`docs/art/landmarks-reference.md:12`)。README 有「非 BMW/MINI 關聯」聲明(README.md 末行)。
5. **授權研究完整、可追溯**【事實】`docs/research/data-licensing.md`(353 行)逐條引用 ODbL §4.3–§4.6、OSMF 指引、政府開放授權第 1 版，並標 not_stated(:160–161)。Tripo 授權有 Cooper 原話與條款依據(`docs/decisions/0045-lowpoly-trees.md:4`)。
6. **決策編號連續**【事實】0001–0047 無缺號、無重號(`ls docs/decisions | grep -v bak`)。
7. **地圖分支同步腳本設計穩健**【事實】`tools/map-build/sync-map-branch.sh` 以暫存 repo、單一無歷史 commit force-push,避免 main 再長大;pull 用 `--depth=1` + `git archive`。也處理了 gh 帳號切換(對應 memory「push 前切 gh 帳號」)。
8. **下載有雜湊紀錄**【事實】`data/elevation/fetch_log.tsv` 記 URL、HTTP 狀態、bytes、sha256;OSM 下載腳本帶 User-Agent、驗證後原子替換(`tools/map-build/fetch-range-a.sh:4`)。

---

## 二、缺點(分級 + 證據 + 建議)

### 高

**H1. 最近 16 個 commit 零決策文件**【事實】
`git log --name-only 4d42ad4..HEAD | grep docs/decisions` → 無輸出;`git diff --stat 4d42ad4..HEAD -- docs` 只有 `docs/art/landmarks/*.png` 與 `docs/research/map-expansion.md`(+69 行)。最新決策 0047 停在 4d42ad4(11/16)。
未記錄的架構級決定：orphan map-data 分支(5d2b2db)、index.json + 1 km 分區(615e72a)、執行時串流(22bdf3a)、雲端載入(9a16267)、高架道路(b2011a7)、擴圖到 8.2×8.0 km(de94b04)、DTM 地形與物理(71888d7)、44 個知名地點與 31 個地標 GLB(8c5be7e、1448931、7956c14、01428df)、地表圖層排序(02fb027)。
`docs/research/map-expansion.md` 建議「先擴到 B 實測，再決定要不要做分區載入」,但實際直接做了分區串流。**沒有紀錄說明是誰拍板、放棄了什麼**【推論:違反 CLAUDE.md「決策寫進 docs/decisions,寫完才算完成」】。
建議：補 0048–0053 左右的決策(至少包含：地圖資料分支化、分區與串流格式、範圍擴大與邊界、DTM 地形、高架道路、知名地點與地標批次)。每份寫明 Cooper 原話或「Claude 自行決定(技術、可逆)」。

**H2. README 地圖資料說明與事實相反，新電腦照做會失敗**【事實】
`README.md:53` 寫「The built map for range A (`public/map/range-a/`) is committed, so the game runs without downloading anything」。但 `.gitignore` 已排除 `public/map/range-*/`,`git ls-files public/map` 只剩 m0。README 沒有提到 `npm run map:pull`,也沒列 widths / lanes / tile / elevation 步驟(`package.json:15–22` 有這些步驟)。README 在 16 個 commit 中都沒有修改。
建議:README「Map data」改成兩條路徑：(a) 只玩或開發：`npm run map:pull`;(b) 從頭重建：列完整步驟順序 fetch → widths → lanes → build → tile → elevation → skyline → push,並註明需要哪些政府資料。

**H3. 政府資料與 DTM 不可自動重建，來源紀錄只存在 gitignored 目錄**【事實】
- OSM 有 `map:fetch:range-a`。但建物圖(158889)、道路圖(162899)、行道樹(109853/108167)、路寬(83822)、DTM 都**沒有下載腳本**;`grep -rln 'data.gov.tw|taichung.gov|dem20|kmz|.shp' tools` 只命中處理腳本，沒有命中下載腳本。
- `SOURCE.md` 只有 `data/gov/buildings/`、`data/gov/road-width/` 兩份，而且都在 gitignore 範圍(`.gitignore` 的 `data/gov/`);`data/gov/roads/`、`data/gov/trees/`、`data/elevation/` 沒有 SOURCE.md(elevation 只有 fetch_log.tsv)。
- `docs/README.md` 的「從零重做」段落只提到 `data/osm/raw/` 與 OSM 統計腳本。
【推論】換電腦時,`npm run map:pull` 能讓遊戲跑起來，但**無法重新建置地圖**;要重建得靠人記得資料集編號與手動下載、解壓的路徑。
建議:(1) 把各 SOURCE.md 與 fetch_log 的內容匯成一份進版控的 `docs/research/data-sources.md`(或 `tools/map-build/SOURCES.md`),包含資料集 ID、下載 URL、版本、sha256、解壓後的路徑。(2) 補 `tools/map-build/fetch-gov.sh`,下載並驗證 sha256。(3) 驗收：在乾淨的 clone 只靠文件重建 range-a,和 map-data 分支的 index.json 比對 stats。

**H4. 打包的地圖資料沒有 ODbL 聲明;repo 沒有 LICENSE**【事實 + 非法律意見】
- 專案自己的研究結論:「遊戲內打包的 GLB/JSON 若可還原出原始資料……屬 Derivative Database → 公開時須以 ODbL 提供」(`docs/research/data-licensing.md:18`,細節 :122–123、:153)。world.json / 分區檔含道路幾何與建物輪廓，可抽取原始資料【推論】。
- `public/map/m0/index.json` 沒有 license 欄位;`package.json` 沒有 license;`git ls-files` 沒有 LICENSE/NOTICE。map-data 分支內容未在本機(`git rev-parse map-data` 失敗、只有 `git ls-remote` 看得到 b13ef99),依規定不下載，所以分支內是否有授權檔是 **not_stated**。
- `docs/decisions/0021-github-public-repo.md:53`:「沒有放 LICENSE,預設保留所有權利，由 Cooper 決定」——到現在還是待決狀態。
建議(請 Cooper 決定;非法律意見):在 map-data 分支根目錄放 `LICENSE-DATA.md`(ODbL 1.0 + OSM 署名 + 政府資料開放授權第 1 版署名);`index.json` 的 meta 加 `license`/`attribution` 欄位;程式碼授權另外決定。

### 中

**M1. 署名缺漏**【事實】
- README credits(`README.md:83–87`)漏了「臺中市各類 GIS 道路圖(114 年版,dataset 162899)」,而車道數與速限(decision 0046,`package.json:16` 的 `centerline-114.csv`)來自這份資料。Tripo 只寫「car, tree and street light」;31 個地標 GLB 是 Blender 腳本產生的(`tools/models/landmark_*.py`),README 沒說明來源【推論:不需要署名，但讀者會誤以為也是 Tripo 產生的】。
- 遊戲內 credit(`src/ui/hud.ts:27–29`)只有 OSM + 臺中市政府(連結只指向建物圖 158889),**沒有內政部 DTM**,也沒有道路圖。政府資料開放授權第 1 版要求標示提供機關【非法律意見】。
- 研究建議提供詳細的「資料授權」頁(`data-licensing.md:121`),遊戲內沒有。
建議:hud credit 加「內政部 20m DTM」;做一個可點開的「資料來源」面板，列出全部資料集與授權。

**M2. `.git` 235 MB,其中 200.7 MB 是 world.json 舊版本**【事實】
`git count-objects -vH`:size-pack 213 MB;`git rev-list --objects --all` 中 `public/map/range-a/world.json` 有 18 個 blob,共 200.7 MB(單個最大 21.2 MB)。5d2b2db 只從 main 刪除這個檔案，沒有改寫歷史，所以每次 clone 仍要下載。另有 `backup/pre-english-history` 分支也保留舊歷史。
【推論】GitHub Pages CI 的 `actions/checkout@v4` 預設 depth=1,影響不大;但新電腦完整 clone 或 fork 的人要下載約 230 MB。
建議(要 Cooper 拍板，屬不可逆操作):用 `git filter-repo --path public/map/range-a/world.json --invert-paths` 改寫歷史並 force-push,或接受現況並在 README 說明可用 `--depth 1` clone。

**M3. `docs/art` 追蹤 160 MB 的 PNG/JPG**【事實】`git ls-files docs/art` 467 檔,總大小 159.9 MB;全 repo 有 452 張圖。最近 16 個 commit 中有 3 個增加了地標預覽 PNG(每張約 1 MB)。【推論】照目前的速度,repo 會隨地標數量持續變大。
建議：預覽圖改存 JPG(q85)或縮到 800 px;或比照地圖改放 orphan 分支 / Git LFS。

**M4. `.bak` 檔散落 123 個**【事實】`find docs -name '*.bak*'` 有 123 個(decisions 67 個;`docs/milestones/M1-progress.md` 有 .bak 到 .bak20;`docs/README.md` 有 .bak 到 .bak11)。`.gitignore` 已排除,`git ls-files | grep bak` = 0,所以**沒有進版控**(這是正確的)。
問題：備份只存在本機，換電腦後消失;而且版控本身已經能取代 .bak 的功能【推論】。
建議：維持不進版控;定期把超過 30 天、已 commit 的 .bak 移到 `~/.claude/backups/3D_Racing/`;或請 Cooper 考慮把守則改成「已 commit 的檔案以 git 歷史為備份」。

**M5. 閱讀索引與里程碑過期**【事實】`docs/README.md` 只列到 0015(:15–29),最後修改是 5d39398(11/11);`docs/milestones/M1-progress.md` 最後修改也在 11/11,內容沒有 003x/004x 的編號。map-data 分支、map:push/pull 在 README、docs/README、decisions 中**都沒有出現**(grep 無結果),只有 `.gitignore` 的註解。
建議:docs/README 改成「決策索引自動產生」(一行一份 decision 的標題 + 狀態),寫成腳本放進 `tools/dev/`;M1-progress 補 11/12–11/21 的進度，或標示 M1 已結束並開 M2。

**M6. 坑洞日誌在最近的返工後中斷;教訓沒寫回制度檔**【事實】
- `~/.claude/logs/pitfalls.md` 共 35 筆 `專案: 3D_Racing`,最後一筆日期是 2026-11-17(:1184)。之後有 3 個修正型 commit(9a80df0 地形穿模與 Z-fighting、6bfe400 匝道端點圓盤、02fb027 道路撕裂),都沒有對應的日誌條目。
- 日誌全檔 88 處寫「教訓該寫回 verification.md(待建/Phase 1)」,但 `~/.claude/rules/verification.md` 仍然是「尚未建立」。
- 本專案重複出現的模式【推論】:**幾何重疊與覆蓋**(建築壓車道 :1077、下沉外框蓋到道路 :1101、方向錯 90° :1111、對稱幾何測試分不出方向 :772、小地圖旋轉突變 :780,加上最新的 Z-fighting 與撕裂 commit);**自驗不足,要靠 Cooper 截圖或 fresh-context 驗收才抓到**(:1077、:697、:745)。
建議：把「幾何類變更必做：平移 / 旋轉 180° / 鏡像突變 + 與道路走廊的重疊檢查 + 夜間與高架鳥瞰截圖」寫成 `docs/art/geometry-checklist.md`;補記 11/19–11/21 的三筆返工;催 Phase 1 建立 verification.md。

### 低

**L1. 原始碼與文件含本機絕對路徑**【事實】`git grep 本機使用者名稱` 命中 33 行，分布在 14 個檔案(例如 `tools/research/elevation_check.py:13`、`docs/research/osm-taichung-feasibility.md`)。會洩漏本機使用者名稱，也讓腳本在別台電腦失效。建議改成相對於 ROOT 的路徑。
**L2. `docs/decisions/0045-lowpoly-trees.md:4,13` 寫出 Tripo 帳號名 nailai7981**【事實】memory 記載這個帳號「產出可進公開 repo」,屬於 Cooper 已知、可接受的範圍;只提醒這是公開資訊。
**L3. 部分決策沒有驗收段落**【事實】只有 7 份決策有「驗收」標題;0001、0002、0021、0041、0043、0047 全文沒有「驗收」或「驗證」字樣(`grep -L`)。0047 是最新一份。
**L4. `fetch-range-a-nodes.sh`、`gov_trees.py` 沒有 npm script**【事實】只在 `tools/map-build/build.ts:33,55` 與 `docs/art/furniture-checklist.md:13` 提到;重建步驟分散在各處。
**L5. 擴圖後 bbox 只寫在程式內**【事實】`package.json:15–16` 與 `build.ts:70` 寫 24.130–24.202°N、120.620–120.700°E(8.2×8.0 km),但沒有決策文件記錄這個範圍(見 H1)。

---

## 三、建議(依優先序)

1. **補決策文件**(H1):0048 起，一份對應一個架構決定;同時更新 `docs/README.md` 索引(M5)。工作量小、風險零。
2. **修 README 地圖段落 + 補資料來源總表 + gov 下載腳本**(H2、H3):驗收方式是在乾淨目錄 `git clone --depth 1` → `npm ci` → `npm run map:pull` → `npm test`,另一條路徑是從頭重建後比對 index.json 的 stats。
3. **授權聲明**(H4、M1):map-data 分支加 LICENSE-DATA、hud 補 DTM 與道路圖、README 補 162899。是否另外加程式碼授權由 Cooper 決定(非法律意見;必要時諮詢專業意見)。
4. **repo 瘦身**(M2、M3):請 Cooper 決定要不要改寫歷史;地標預覽圖改成 JPG 或縮小尺寸。
5. **驗證文化**(M6、L3):建立 geometry-checklist,補記坑洞日誌,催建 verification.md;決策範本固定加上「驗收」段落。

## 附：主要指令與輸出
- `git log --oneline 4d42ad4..HEAD | wc -l` → 16;`git diff --stat 4d42ad4..HEAD -- docs` → 只有 art PNG + map-expansion.md
- `git count-objects -vH` → size-pack 213.32 MiB;world.json 歷史 blob 18 個 / 200.7 MiB
- `npx vitest run` → 36 files / 536 tests passed
- `git ls-remote --heads origin` → main 02fb027、map-data b13ef99(本機沒有 map-data,內容 not_stated)
- `find docs -name '*.bak*' | wc -l` → 123;`git ls-files | grep -c bak` → 0
