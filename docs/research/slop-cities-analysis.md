# slop-cities 技術組成分析(與 slop-newyork 的差異)

- 分析日期:2026-11-16
- 對象:https://slop-cities.onrender.com/
- 前一份報告:`docs/research/slop-newyork-analysis.md`(以下簡稱「NY 報告」)。本文只寫 slop-cities **不同或新增**的部分;相同的部分只用一句話帶過,並註明 NY 報告的章節。
- 方法:用 curl 抓首頁、各城市頁,以及網站直接公開的原始檔(README、`tools/`、`js/city/`,共約 20 個請求，每次間隔 1 秒)。檔案存在 scratchpad 的 `slop-cities/site/`,**只閱讀，沒有執行**。地理資料的統計用我自己寫的 Python 腳本:把 `js/city/data/<city>.js` 當純文字讀進來，去掉 `export const GEO = ` 前綴後用 `json.loads` 解析，沒有 import 或執行它的模組。GitHub 資訊用 `gh api` 查。
- 標記方式:**【事實】** 附出處;**【推論】** 是我的判斷，還沒驗證。
- 出處寫法:`site:路徑:行號` 指 `https://slop-cities.onrender.com/路徑` 該檔的行號(檔案是 2026-11-16 抓的)。

---

## 0. 基本資料

| 項目 | 內容 | 出處 |
|---|---|---|
| 性質 | **slop-newyork 的 remix(fork)**,不是同一位作者另外做的專案。首頁仍然是 Slop New York,另外加了 7 張城市地圖 | 【事實】`site:README.md:1-3`;首頁 GitHub 連結指向 `mrdoob/slop-newyork`(`site:index.html`「repo-link」) |
| 維護者 | 【推論】GitHub 帳號 `yilin0830`。README 的 Render 部署按鈕和 `render.yaml` 都指向 `github.com/yilin0830/costco`,兩張清交/光復路地圖的資料來源也是同一帳號的 repo。網站有綠界(ECPay)贊助按鈕，推測維護者在台灣 | `site:README.md:8-9,104`、`site:render.yaml:2`、`site:README.md:65` |
| 原始碼 repo | **沒有公開**。`gh api repos/yilin0830/costco`、`.../nthu-nycu-3d-model`、`.../guangfu-parking-3d` 都回 404,可能是私有或已刪除。不過 **Render 把整個 repo 目錄當靜態檔案公開**,所以 `README.md`、`LICENSE`、`package.json`、`tools/`、`server/` 都能直接下載 | `gh api`(2026-11-16);`site:server/server.mjs:16`(`ROOT` = repo 根目錄) |
| commit 數、規模 | not_stated(拿不到 repo)。實測下載量:`js/city/main.js` 47 KB、`tools/city/build-city.mjs` 990 行、`js/city/buildings.js` 1,000 行 | `wc` |
| 授權 | 程式碼 MIT。LICENSE 檔沿用 `Copyright (c) 2026 Mr.doob`,fork 的新增部分沒有另外列版權人。地理資料為 OSM(ODbL)與 NYC Open Data;地標照片來自 Wikimedia Commons(多為 CC BY-SA);電台音樂為 CC BY 3.0 與公有領域 | `site:LICENSE:1-3`、`site:README.md:242-273` |
| 打包 | 沒有打包工具，也沒有任何依賴。`package.json` 只有 `start` 和 `test` 兩個指令 | `site:package.json` |
| 名字相近的專案 | `zz85/slop-cities`(GitHub)是另一個專案，內容是「各城市 slop remix 的目錄」(只有 `cities.yml`、`map/`),和本站無關。本站 README 結尾有連到它 | `gh api repos/zz85/slop-cities/contents`;`site:README.md:240` |

---

## 1. 摘要：最值得借鏡的幾點(依對我們的價值排序)

1. **建築高度估算用「離市中心多遠」加權，而且完全確定、沒有亂數**(§3.1)。沒有標高度的建築，樓層數 = `2 + round(core × 5)`(面積 > 1500 m²)或 `2 + round(core × 3 × min(1, 面積/400))`;住宅類固定用城市參數 `houseLevels`(台灣地圖設 3–5 層)。`core` 是幾個「核心」橢圓(車站、指定經緯度)的線性衰減加權和，上限 1。估出來的高度上限 140 m,有標的高度照標(`site:tools/city/build-city.mjs:448-456,520-543`)。我們的 `tools/map-build/lib/buildings.ts:41-54` 只看類型和面積，再用 OSM id 加減 1 層，**完全沒有位置因素**,所以台中市中心和郊區估出來的高度一樣。加一個 `coreFactor`(例如以台中車站、七期、逢甲為核心)是很小的改動。**可直接借概念**,實際效果要看截圖比對。
2. **車道標線完全由 `lanes` 與 `width` 推導，再依台灣規則補上在地細節**(§3.2)。台灣樣式包括：雙向道路等級 ≥ tertiary 畫雙黃線，其他畫黃虛線;路寬 ≥ 10.5 m 的主要道路畫機車優先道(距路緣 2.4 m 的白實線，加上「機車優先」字樣);號誌路口畫機車待轉區;巷弄畫紅線;接近號誌 30 m 內車道線改成實線。路口箭頭是**規則推的**:最內側車道畫直行加遠側轉向，最外側畫直行加路緣側轉向，**沒有讀 OSM 的 `turn:lanes`**(`site:js/city/street/style.js:57-63`、`site:js/city/street/markings.js:341-455`)。我們缺的「車道用途資料」,**他們也沒有**,是用規則補的。這套規則和 renderer 無關，可以移植。
3. **台灣沒有建築資料的地方就留空，不腦補**(§3.1)。README 明講台灣沒有開放的建物輪廓資料，所以只放 OSM 有的建築(`site:README.md:6,178,215`)。實測新竹工研院地圖約 3.9 × 3.9 km,只有 **344 棟**建築。他們寫好了一個台灣透天厝沿街補建產生器(面寬 4.5–6.5 m 連棟、主要道路一樓為店面、主要道路上 5–12 層華廈),但**目前每張地圖都關閉**(`build-city.mjs:724-735`;`cities.mjs` 的 `infill: null`)。這套產生器正好對應我們「路邊沒有建築」的問題，參數可以參考。不過，用不用程序補建是**品味與真實性的取捨**,要由 Cooper 決定。
4. **OSM `building:part`(Simple 3D Buildings)整套支援**(§3.1)。如果一棟建築有 part,就用 part 取代外框;每個 part 各自讀 `height`、`min_height`、`building:min_level` 和 `roof:shape`,也讀 `building:colour` 和 `roof:colour`(`build-city.mjs:466-516,236-262`)。實測台北 101 地圖 5,952 棟建築中，有 1,316 個是 part。台中七期的高樓如果在 OSM 有 part,就能自動得到裙樓加塔樓的造型。我們目前只讀外框。**值得借**。
5. **一般道路寬度的預設表**(§3.2)。依道路等級查 `{寬, 車道數}`;如果 OSM 有標車道數，寬度改用 `max(0.7 × 表寬, lanes × 3.1 + 1.0)`;單行道的車道數取一半;每個城市可以用 `roadWidth()` 覆寫(`build-city.mjs:265-307`)。這和我們 `tools/map-build/lib/roads.ts` 的「lanes → 等級預設」思路一樣，可以拿來交叉核對數值。
6. 宮廟、土地公廟有專門處理：沒有標高度時，依面積給 4.4 m 或 6.8 m 單層，紅牆、燕尾脊(`build-city.mjs:538-540`)。我們的 `kindHeight` 已經有類似規則(`TEMPLE_EST_FLOORS`),**不需要改**,只記錄為兩邊做法一致。

**前提不變**:他們跟 NY 一樣用 WebGPURenderer + TSL(three.js dev 分支),shader **不能直接搬到**我們的 WebGL + `onBeforeCompile`(NY 報告 §1 最後一段)。上面第 1、2、3、5 點都在**建置工具或純資料規則**層，和 renderer 無關。

---

## 2. 技術組成細節

### 2.1 前端

| 項目 | 內容 | 出處 |
|---|---|---|
| 引擎 | three.js **dev 分支**:`three.webgpu.js` 與 `three.tsl.js` 用 importmap 從 jsDelivr 載入(和 NY 相同，見 NY 報告 §2.f) | 【事實】`site:index.html` 的 importmap;`site:hsinchu.html:11-20` |
| 後端選擇 | **新增**:`pickBackend()` 先試 WebGPU adapter,失敗就用 WebGL2(`forceWebGL`),兩者都失敗則丟出 StartupError;`?webgl=1` 可強制走 WebGL2 | 【事實】`site:js/startup.js:3-6,57-67` |
| 城市頁架構 | **新增**:每座城市一個 HTML(`hsinchu.html` 等),共用 `js/city/main.js`,再以 `data-city` 加上 `js/city/data/<city>.js` 區分城市。紐約仍走原本的 `js/main.js` | 【事實】`site:hsinchu.html:2,21-23` |
| 建築渲染 | **與 NY 不同**:城市地圖不是用「單位立方體 instancing」,而是把建築依 **400 m 分塊合併成 mesh**(`mergeGeometries`),每塊一個 Mesh,立面參數寫在頂點屬性裡，給 facade shader 用。屋脊瓦、封簷板、招牌只在相機附近用 instancing | 【事實】`site:js/city/buildings.js:8,19-20,83,732-794` |
| 道路渲染 | 路面是沿中心線擠出的 ribbon,UV 以公尺計，並把車道寬放進頂點屬性，給 shader 畫胎痕(這點不同於 NY 的「道路 = 負空間」,NY 報告 §2.b) | 【事實】`site:js/city/roads.js:164-189` |
| 音效 | 沿用 NY 的程序合成音效(NY 報告 §2.g)。**新增**收音機:兩個頻道串流 Wikimedia Commons 上的 MP3,另一個頻道在瀏覽器即時合成 | 【事實】`site:README.md:21-26` |
| 新增玩法 | 左右駕切換(會依行駛側重建整張地圖)、Logitech G29 方向盤(含 WebHID 力回饋 beta)、Pacejka 輪胎模型(`?physics=sim`)、車庫(車身、顏色、台日車牌)、貨車系統、多人連線、地標資訊卡、中英日 i18n | 【事實】`site:README.md:15-16,48-58,67-98`;`site:js/city/main.js:1-39`(import 清單) |
| UI | 原生 HTML 加 CSS(`css/city.css`、`city-touch.css`),Google Fonts 載入 Inter 和 Noto Sans TC,圖示用 SVG sprite | 【事實】`site:hsinchu.html:24-28` |
| 測試 | `node --test tests/*.test.cjs tests/*.test.mjs`(沒有下載也沒有執行) | `site:package.json` |

### 2.2 後端與部署(新增，NY 是純靜態的 GitHub Pages)

- 【事實】Render **免費方案**的 Node web service,沒有 build 步驟,`startCommand: node server/server.mjs`,healthCheck 路徑為 `/mp/status`(`site:render.yaml`)。前面有 Cloudflare(回應標頭 `server: cloudflare`、`x-render-origin-server: Render`)。
- 【事實】`server/server.mjs` 沒有任何依賴，同時做兩件事:(1) 把 repo 根目錄當靜態檔案伺服;(2) 自己實作的 RFC 6455 WebSocket 多人轉發(`/mp`),每個房間最多 16 人，各城市分開(`site:server/server.mjs:1,16,51,254`;`site:README.md:96-98`)。轉發器不具權威性，AI 車流在各玩家的瀏覽器各自模擬。
- 【事實】**不是動態生成城市**。每座城市都是事先用 `tools/city/build-city.mjs` 建好的 `js/city/data/<city>.js` 靜態 ES module(`site:README.md:204-211`)。實測 `hsinchu.js` 409,499 bytes,`taipei101.js` 1,559,050 bytes。
- 【事實】免費方案閒置後會休眠，首次載入約需 30 秒喚醒(`site:README.md:104`)。頁面上也寫了「首次載入約需 30–60 秒」。

### 2.3 支援城市

| 頁面 | 範圍 | 建築來源 |
|---|---|---|
| `index.html` | 紐約曼哈頓 | 同 NY 報告 |
| `matsumoto.html` | 日本松本，約 3.5 × 3.9 km | OSM,加上日本國土地理院基盤地圖情報(約 31,000 棟) |
| `hsinchu.html` | 新竹工研院中興院區，約 3.9 × 3.9 km | 只有 OSM(實測 344 棟) |
| `nthu.html` | 清大與陽明交大光復校區，約 2.3 × 2.2 km | 第三方 3D 模型 repo 的處理後資料(`yilin0830/nthu-nycu-3d-model`,目前 404) |
| `guangfu.html` | 新竹光復路一段，約 2.9 × 1.5 km | 同上(`yilin0830/guangfu-parking-3d`,目前 404),含「示意街屋」 |
| `taipei101.html` | 台北信義區，約 2.4 × 2.4 km | 只有 OSM,含 building:part(實測 5,952 棟，其中 1,316 個是 part) |
| `nangang.html` | 台北南港展覽館，約 2.7 × 1.9 km | 只有 OSM |
| `hsinchustation.html` | 新竹車站與東門城，約 2.2 × 1.9 km | 只有 OSM |

出處:`site:README.md:5-14`、`site:tools/city/cities.mjs`、我自己寫的統計腳本。**有台灣城市(新竹 4 張、台北 2 張),沒有台中。**

---

## 3. 資料來源(本次重點)

### 3.1 建築：位置與高度

**位置(footprint)**
- 【事實】台灣地圖用 **OSM 建築外框**:從 OSM API `/api/0.6/map` 以 0.01° 為一格抓 tile(`site:tools/city/fetch-osm.sh`),壓成 gz 後放進 repo。OSM 有 `building:part` 時用 part 取代外框(`build-city.mjs:466-516`)。
- 【事實】README 寫明「台灣沒有開放的建物輪廓資料」,所以台北 101、南港、新竹車站、工研院四張地圖都只有 OSM 建築(`site:README.md:215`)。
  - 【推論】這個說法和我們自己的調查不一致。`docs/research/building-lane-data.md` §2.1、§2.2 列出了 NLSC 三維建物模型與臺中市建物圖(data.gov.tw 158889 / 152106)。所以在建築資料上，**我們可能比他們多一條路可走**;授權與覆蓋率以那份報告為準。
- 【事實】日本(松本)另外加了國土地理院基盤地圖情報的建物輪廓。OSM 外框優先，和 OSM 重疊的 GSI 外框會被略過(`build-city.mjs:555-607`)。
- 【事實】清交、光復路兩張地圖直接用第三方 3D 模型處理後的建築，包含 footprint、高度、地面高程(SRTM),以及光復路的「示意街屋」;這兩張只從 OSM 取道路圖、公園和河流(`site:README.md:10`;`build-city.mjs:66-69,618-640`)。這些模型的原始資料從哪裡來:not_stated(repo 是 404)。
- 【事實】程序補建(infill)的程式碼還在，但 README 說「no map uses it」(`site:README.md:217`)。核對設定:`hsinchu`、`taipei101`、`nangang`、`hsinchustation` 的 `infill: null`;`nthu`、`guangfu` 雖然是 `'taiwan'`,但因為是 `model: true`,建置時會跳過(`build-city.mjs:737` 的 `MODEL || !CITY.infill ? [] : ...`)。

**高度規則**(`build-city.mjs:230-233,520-543`)
1. 有 `height` 就照用;mapped 高度上限 600 m。
2. 沒有 `height` 但有 `building:levels` 時，取 `levels`(上限 40),高度 = `levels × 3.3 + (levels > 2 ? 0.8 : 0.3)`。
3. 兩者都沒有時:
   - `building` 符合 house、detached、residential、hut、shed、garage、temple、shrine → `CITY.houseLevels`。各地圖設定：新竹 3、台北 101 為 5、南港 4、新竹車站 4(`cities.mjs:46,112,127,141`)。
   - 面積 > 1500 m² → `2 + round(core × 5)` 層。
   - 其他 → `2 + round(core × 3 × min(1, 面積/400))` 層。
   - `core = min(1, Σ max(0, 1 − 橢圓正規化距離) × weight)`,核心可以設在車站、指定經緯度或世界座標橢圓(`build-city.mjs:448-456`;新竹車站地圖的設定見 `cities.mjs:138`)。
   - 估出來的高度上限 140 m,下限 3 m。
4. 宮廟(`religion=taoist|chinese_folk`)沒有標高度時，面積 < 150 m² 為 4.4 m,否則 6.8 m(`build-city.mjs:538-540`)。
5. part 沒有 `height` 時用 `(levels || 主體 levels || 2) × 3.4 + 0.6`(`build-city.mjs:507-508`)。
6. 日本 GSI 建物依類別給高度：普通建物 2 層、堅ろう建物 `min(8, 3 + round(core × 3 + min(2, 面積/600)))` 層、高層建物 11 層(`build-city.mjs:598-602`)。

README 強調「Untagged heights are computed from rules, never random」(`site:README.md:217`)。程式碼裡只有 infill 用了 seeded `rand()`(`build-city.mjs:724-806`)。

**實測**(我自己寫的統計腳本):新竹工研院 344 棟,median 高度 10.7 m,最高 47 m,沒有任何 `building:colour` 或 `roof:shape`。台北 101 共 5,952 棟,median 14 m,最高 448 m(101 本體另外用地標模型);有 `building:colour` 的 600 棟、有 `roof:shape` 的 31 棟。

### 3.2 道路：寬度與車道

- 【事實】來源**只有 OSM**,沒有用任何政府路寬或車道資料(`build-city.mjs:295-309`)。
- 寬度與車道規則:
  - `lanes` 取 OSM 值;沒有的話，查等級預設表(motorway 3、trunk/primary 4、secondary/tertiary/residential 2…);單行道取一半。
  - `width` 取 OSM 值，有效範圍 2.5–40 m;沒有或超出範圍時，如果有標 `lanes`,寬度 = `max(0.7 × 表寬, lanes × 3.1 + 1.0)`,否則直接用表寬。等級預設寬度:motorway 11.5(單向一條 way)、trunk 13、primary 12、secondary 9.5、tertiary 8、unclassified 5.5、residential 4.6、living_street 4.2、service 3.8 m(`build-city.mjs:265-281,303-306`)。
  - 每個城市可以用 `roadWidth(tags)` 覆寫。只有清交、光復路兩張地圖有用，數值說明是「沿用原模型的路寬」,例如 primary 18、secondary 14 或 16、residential 6.5 m;光復路的雙向 secondary 寬度 = `min(24, 3.4 × lanes + 3)`(`cities.mjs:61,85-89`)。
- 實測新竹工研院地圖的 1,007 段道路中，寬度最常見的是 3.8 m(645 段，即 service 預設)、7.2 m(110 段);車道數 2 的有 922 段，大多是預設值。有 `maxspeed` 的 65 段。**這表示新竹 OSM 的寬度和車道資料也很稀疏**,和台中情況類似。
- 斷面與標線的台灣樣式(`site:js/city/street/style.js:40-63`、`site:js/city/street/markings.js`):
  - 等級 ≥ tertiary 且寬度 ≥ 7 m 的道路，有人行道(primary 以上 3.2 m,其他 2.6 m);寬度 ≥ 10.5 m 再加機車優先道。
  - 巷弄沒有路緣石，畫紅線。
  - 中心線:rank ≥ 3 畫雙黃線，其他畫黃虛線(`site:js/city/cities.js:135`)。
  - 每個方向的車道數 = `oneway ? lanes : floor(lanes/2)`;車道寬 = 半幅寬 / 每向車道數(`markings.js:349-353`)。
  - 停止線、斑馬線只畫在 OSM 有標的號誌或 crossing;「停」「慢」只畫在 OSM 有標的 stop。
  - 機車待轉區畫在 rank ≥ 3、寬 ≥ 7 m 的號誌路口(`markings.js:444`)。
  - 車道箭頭由規則決定(`markings.js:428-441`),**沒有讀 `turn:lanes`**。
- 其他圖層也都來自 OSM:號誌與路口名稱、減速丘(`traffic_calming`)、路面材質(`surface`)、路燈、公車站、YouBike 站、電塔電線、行道樹、土地使用(`site:README.md:176-198`;`build-city.mjs:362,826-913`)。

### 3.3 授權與我們能否採用

| 東西 | 授權 | 我們能否用 |
|---|---|---|
| 程式碼(含 `tools/city/*.mjs`、`js/city/*`) | MIT,LICENSE 寫 Mr.doob | 【推論】可以參考，也可以複製，但要保留 MIT 版權聲明。網站把原始檔公開讓人下載,README 也聲明採 MIT(`README.md:244`)。不過 fork 作者沒有另外列版權人，**原始 repo 也不是公開的**,所以版權歸屬有一點模糊。建議**只借用規則和數值，自己用 TypeScript 重寫**,不要整檔複製 |
| OSM 資料 | ODbL | 我們本來就在用，沒有新增義務 |
| GSI 基盤地圖情報 | 日本國土地理院的使用條款 | 只涵蓋日本，和我們無關 |
| 清交、光復路的模型資料 | not_stated(來源 repo 是 404) | 不採用 |
| 地標照片 | Commons CC BY-SA 等 | 我們用不到;如果要用，需要署名並以相同方式分享 |
| three.js dev 分支 + TSL shader | MIT | 和我們的 WebGL renderer 不相容，不能直接搬 |

---

## 4. 與 slop-newyork 的差異(相同處一句帶過)

| 面向 | slop-newyork(NY 報告) | slop-cities 新增或不同 |
|---|---|---|
| 地圖資料 | 以 NYC Open Data 為主，一般建築用程序生成(§2.a、§2.b) | 新城市**只用 OSM 實際資料**,加上日本 GSI 與第三方校園模型;預設不做程序生成 |
| 建築渲染 | 單位立方體 InstancedMesh,依立面材質分組(§2.b) | 任意多邊形 footprint 擠出，依 400 m 分塊合併 mesh;支援屋頂形狀、騎樓、二丁掛、鐵窗 |
| 道路 | 道路是街廓之間的負空間;標線依道路圖生成(§2.b) | 沿中心線擠出 ribbon 加路緣石，標線分台灣和日本樣式 |
| 後端 | 純靜態 GitHub Pages | Render Node 伺服器加 WebSocket 多人連線 |
| 渲染後端 | WebGPU(§2.f) | 新增 WebGL2 fallback |
| 車輛物理 | 運動學 arcade(§2.c) | 新增 Pacejka 模擬模式、G29 方向盤、手排、貨車 |
| 相機、音效、後處理、小地圖 | §2.c、§2.e、§2.g | 沿用;另外加駕駛艙、引擎蓋視角和收音機 |
| 資料管線 | Overpass 加防呆(§2.a) | 改用 OSM API `/map` 分 tile 下載，已存在的 tile 跳過，以 `</osm>` 判斷檔案完整(`fetch-osm.sh:22-32`) |

附帶一點：上游 `mrdoob/slop-newyork` 在 NY 報告之後(commit 數從 42 增加到約 162)新增了 `tools/build-buildings.py`,改用 NYC Open Data 建物 footprint 資料集 `5zhs-2jue`,讀 `height_roof` 欄位(英尺轉公尺)。所以 NY 報告 §2.a「一般建築沒有從任何來源取得」的說法**已經過時**(`gh api repos/mrdoob/slop-newyork/contents/tools/build-buildings.py`,第 29、107 行)。

---

## 5. not_stated 清單

| 項目 | 原因 | 怎麼確認 |
|---|---|---|
| slop-cities 原始 repo 的 commit 數、星數、歷史 | `yilin0830/costco` 回 404 | 請作者公開 repo,或在 issue 中詢問 |
| fork 新增程式碼的版權人 | LICENSE 只寫 Mr.doob | 同上 |
| 清交、光復路兩個來源模型的建築高度從哪裡來 | `yilin0830/nthu-nycu-3d-model`、`guangfu-parking-3d` 都是 404 | 同上 |
| three.js 實際版本號 | 使用 `@dev` 浮動分支，沒有固定版本 | 在瀏覽器 console 看 `THREE.REVISION`(這次沒有執行) |
| 網站實際的 FPS 與 draw call 數 | 沒有在瀏覽器實際執行 | 用瀏覽器開啟並看 HUD 上的 fps |
| `tests/` 的內容 | 沒有下載 | 下載 `tests/*.test.mjs` 閱讀 |

---

## 6. 重做本分析需要的東西

- 首頁 HTML 找出 importmap、modulepreload 和城市連結,再抓 `README.md`、`package.json`、`render.yaml`、`tools/city/{build-city,cities}.mjs`、`tools/city/fetch-osm.sh`、`js/city/{buildings,roads,cities}.js`、`js/city/street/{style,markings,layout}.js`、`js/startup.js`、`server/server.mjs`,以及 `js/city/data/{hsinchu,taipei101}.js`。全部用 `curl -A "Mozilla/5.0"` 抓，每次間隔 1 秒。
- 統計腳本：讀 `export const GEO = {...};`,去掉前綴後用 `json.loads` 解析，再統計 `buildings[].{h,k,g,s,part,c,rs}` 與 `roads[].{w,l,ms}`。
- 程式碼行號以 2026-11-16 抓下來的版本為準;網站有 `autoDeploy: true`,行號之後可能會變。
