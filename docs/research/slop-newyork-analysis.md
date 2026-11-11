# slop-newyork 參考分析

- 分析日期:2026-10-23
- Repo:https://github.com/mrdoob/slop-newyork(線上版:https://mrdoob.github.io/slop-newyork/)
- 分析時的 commit:`039a32796faf6ff914a07946b3d3d058d291e251`(2026-10-23 13:23 UTC,「Reduce car and bicycle coasting resistance」)
- 分析方法:`git clone --depth 1` 到 scratchpad,**只閱讀,未執行**它的任何程式、未 npm install、未跑建置腳本。commit 歷史、授權、星數用 `gh api` 查。數字都是實際量測(`wc`、`du`、`ls -la`、`gh api`)。地理資料的統計用我自己寫的腳本:把 `js/nyc-geodata.js` 當純文字讀進來,再用 `JSON.parse` 解析,沒有 import 或執行它的模組。
- 標記方式:**【事實】** 指在檔案或 API 裡直接看得到的內容;**【推論】** 是我的判斷,還沒驗證。
- 檔案路徑都相對於 repo 根目錄。我們專案的檔案會寫成 `3D_Racing/...`。

---

## 0. 基本資料(實測)

| 項目 | 數值 | 出處 |
|---|---|---|
| 授權 | MIT,Copyright (c) 2026 Mr.doob | `LICENSE:1-3`、`gh api repos/mrdoob/slop-newyork` → `license: MIT` |
| 建立時間 / 最後推送 | 2026-10-20 09:16 UTC / 2026-10-23 13:23 UTC | `gh api` |
| commit 數 | 42 | `gh api .../commits?per_page=1` 的 Link header:`page=42` |
| 星數 / fork 數 | 193 / 52(查詢當下) | `gh api` |
| 首個 commit | `2a1d5e7`「Initial commit: Slop New York」,41 個檔案、新增 188,146 行(大部分是 data JSON) | `gh api .../commits/2a1d5e7` |
| 工作目錄大小 | 21 MB(其中 `.git` 4.4 MB) | `du -sh` |
| `js/` | 30 個檔案、30,794 行、2,500,487 bytes | `ls`、`wc` |
| `tools/`(資料管線) | 8 個腳本(7 個 `.mjs` + `overpass.sh`,含 `benchmark-pedestrians.mjs`)、1,761 行 | `wc` |
| `tests/` | 13 個測試檔,含 helper 共 1,955 行 | `wc` |
| `css/style.css` | 1,452 行 | `wc` |
| `tools/data/`(原始資料) | 7 個 JSON、合計 14,775,021 bytes(最大是 `cscl_manhattan.json`,6.25 MB) | `ls -la` |
| 生成的地理資料 `js/nyc-geodata.js` | 1,117,086 bytes(gzip 385,732;brotli 299,275) | 自寫腳本實測 |
| `package.json` | **沒有**。沒有打包工具,three.js 用 importmap 從 jsDelivr 抓 `mrdoob/three.js@dev` | `index.html:11-20` |

---

## 1. 摘要:最值得借鏡的 8 點(依對我們的價值排序)

1. **地圖資料改成只傳 2D 描述,幾何在瀏覽器端生成**(§2.a、§2.b)。整個曼哈頓 2,691 個街廓的地理資料只有約 1.12 MB(1,117,086 bytes;gzip 386 KB),因為建築不存網格,是 runtime 依街廓與地塊矩形程式生成的。我們範圍 A 預估 50 MB 的主因,就是把擠出好的網格(位置、法向量、顏色)直接存進 map.bin。**建議參考概念**:改成只傳 footprint 多邊形(量化)加高度與類型,在 client 端用現有的擠出程式生成網格。這點直接影響「分塊 + 量化格式」待辦。
2. **建築的 instancing 與窗戶 shader**(§2.b)。所有一般建築都是「單位立方體 InstancedMesh、每種立面材質一個」;窗格由 shader 依 box-local 座標畫,並用每個 instance 的屬性(`box` 尺寸、`faces` 四面牆種類)決定哪面有窗、店面、門或是空白牆,窗數依牆寬取整,不會跨過轉角。我們的建築是不規則 footprint,不能全面改用方塊;但「頂點屬性標記牆種類」「窗格數依牆寬整數化」可以移植到 `3D_Racing/src/render/building-material.ts`。**參考**
3. **全島 instanced mesh 依空間切塊,再依尺寸決定消失距離;陰影用低成本替身**(§2.f,`js/scene-culling.js`)。直接對應我們的分塊載入待辦。**參考概念**
4. **追車鏡頭在「車體座標系」裡平滑**(§2.c,`js/cameras.js:335-352`)。他們的註解寫明,世界座標系的 lerp 在幀時間不均時會讓鏡頭前後湧動。我們的 `3D_Racing/src/camera/chase-camera.ts:56-57` 正是世界座標 lerp。**值得直接借用**(改動小,手感可感受到;是否真的改善要實測)。
5. **全程序合成的 Web Audio 音效,沒有任何音檔**(§2.g,`js/audio-*.js`)。引擎聲由依汽缸點火脈衝合成的循環 buffer 做成,依轉速 crossfade;用 PannerNode 定位;被建築擋住時用 lowpass 悶音。對應我們的「Web Audio 音效」待辦,也避開音檔授權問題。**參考概念**(MIT,可移植部分程式)
6. **車子模型也是程式 loft 生成**(§2.d)。手法比我們的 Blender 腳本細:單調三次樣條定義側視與俯視曲線、超橢圓收頭、玻璃艙另外 loft、所有細節由一個 shader 依 object-space 畫出。而且 **three.js r186 本身就附 `LoftGeometry.js` 和 `generators/city/CarGenerator.js`**,我們的 node_modules 裡已經有。不過它做的是**通用轎車,不是特定車款**,解決不了「看起來像 MINI」的問題,**不改變 0008 的判斷**。只有 Cooper 選路線 C 時才值得參考。
7. **小地圖與路名 HUD 的實作模式**(§2.g,`js/nyc-map.js:961-1060`、`js/main.js:380-423`)。小地圖用 Canvas 2D;把 2 倍大的地面層快取成離屏 canvas,玩家接近邊緣才重畫;路名沿路線標註;HUD 做成路牌樣式。對應我們的小地圖待辦。**參考概念**
8. **Overpass 下載的防呆**(§2.a,`tools/overpass.sh:15-35`)。先寫到暫存檔,完整 `JSON.parse` 驗證並拒絕帶 `remark` 的回應(Overpass 逾時時可能 200 但資料不全),最後原子 rename;三個端點輪流重試。我們的 `3D_Racing/tools/research/fetch_overpass.sh` 直接寫入目標檔,只檢查開頭有沒有 `"osm3s"`,失敗時會蓋掉舊的好資料。**值得直接借用**(小改動)。

另外兩點值得知道:色調後處理用預設表集中管理(§2.e),可套用到我們的低彩度風格;地標是程式建模後貼到 OSM 真實地塊並縮放到真實高度(§2.b),可參考給地標待辦。

**一個重要前提**:他們用的是 **WebGPURenderer + TSL**(three.js dev 分支),我們用 **WebGLRenderer + `onBeforeCompile`**(`3D_Racing/src/render/scene.ts:10`)。所以他們的 shader 程式碼**不能直接搬**,除非我們換 renderer。幾何生成、資料管線、相機、音效、小地圖這些與 renderer 無關的部分可以直接參考。

---

## 2. 各面向詳細分析

### 2.a 地圖資料

**【事實】**
- **來源**:主要是 **NYC Open Data**,OSM 只補充部分內容(`tools/geo-base.mjs:6-10`)。
  - `dcp_boroughs.json`:NYC DCP Borough Boundaries(行政區界)
  - `cscl_manhattan.json`:NYC Street Centerline(CSCL),含**路緣到路緣寬度**、車道數、單行方向、高程層級
  - `nycparks_manhattan.json`:NYC Parks 公園範圍
  - `osm_*.json`:用 Overpass 抓中央公園內部要素、碼頭、海岸線、36 棟地標的 footprint(`tools/data/q_*.overpassql`)
- **一般建築 footprint 沒有從任何來源取得**。Overpass 查詢只抓指定名稱的地標(`tools/data/q_landmarks.overpassql`);一般建築是 runtime 依街廓程式生成的(見 §2.b)。
- **取得腳本**:`tools/overpass.sh`,做法是暫存檔、JSON 驗證、原子 rename、3 個端點、最多 12 輪重試。`tools/geo-base.mjs:6` 提到的 `tools/fetch-geodata.sh` **不在 repo 裡**,所以 NYC Open Data 那三個檔怎麼下載的,repo 內沒有可重現的腳本。
- **投影**(`tools/geo-base.mjs:23-50`):以 5th Ave & 42nd St 為原點,用 WGS84 橢球在原點緯度的子午圈與卯酉圈曲率半徑做**局部切平面**(東、北,單位公尺),再**旋轉 29.02°** 讓 x 對齊曼哈頓棋盤的街道方向(角度由大道擬合求得,`geo-base.mjs:35` 註解「refined below from the avenues」)。1 單位 = 1 公尺。
- **前處理**:
  - 用 RDP 簡化折線與多邊形(`geo-base.mjs` 的 `rdp`、`rdpRing`)
  - **用 1 m 解析度的柵格算出街廓**(`tools/geo-blocks.mjs:1-3`、`:4-60`):先把每段平面道路依「路緣到路緣寬度」畫進陸地柵格,剩下的區塊做連通標記,得到「路緣島」(curb island),再內縮 4.6 m 人行道,得到地塊界線。柵格工具含 Felzenszwalb 距離轉換、形態學開閉運算、保留最大連通區、輪廓追蹤(`geo-base.mjs` 的 `Raster` 類別)。
  - 道路中心線依「路名、寬度、方向、車道數」串成折線(`tools/build-geodata.mjs:41-78`);另外建一張車流用的道路圖(`tools/geo-roadgraph.mjs`)。
- **輸出格式**:一個 ES module `js/nyc-geodata.js`,內容是 `export const GEO = {...JSON...}`。座標四捨五入到 0.1 m,多邊形用扁平陣列 `[x0,z0,x1,z1,...]`(`build-geodata.mjs:14-15`、`:225-233`)。
- **各部分大小(實測,JSON 字元數)**:blocks 432 KB(2,691 個街廓、3,461 個地塊矩形)、roads 219 KB(3,246 條)、boroughs 179 KB、roadGraph 102 KB、centralPark 45 KB、parks 44 KB(116 個)、landmarks 10 KB(36 棟)。全檔 1,117,086 bytes,gzip 後 385,732 bytes。
- **分塊 / 串流**:地理資料**一次整包載入**,沒有分塊。runtime 只有「細節物件」依玩家位置串流(§2.b、§2.f)。
- **LOD**:地理資料本身沒有 LOD。曼哈頓 129 街以北和其他行政區另外用低細節方式呈現(`js/boroughs.js:55-68`;`tools/geo-blocks.mjs:7` 的 `CUT_Z = -7090`)。

**【推論】對我們的意義**
- 我們用 OSM 全量建築 footprint 是對的:我們要的是真實建築輪廓,而他們的一般建築是程式生成、不是真實 footprint。路寬方面,`3D_Racing/docs/decisions/0001-map-data-source.md:19` 已決定用「臺中市政府道路寬度開放資料對應到 OSM 道路,對不上的用預設寬度表」(M1 項目 7,`docs/milestones/M1-plan.md:19`);目前 `data/overrides/road-width.json` 的 `byOsmId` 仍是空的,尚未接上。他們「只存 2D、client 端生成」的概念可以直接套用:12,500 棟 × 每棟約 10 個頂點 × 2 座標 × 2 bytes(16 位元量化)≈ 0.5 MB,加上高度、類型屬性,數量級遠低於目前的 50 MB 估算。代價是 client 端要跑 earcut 和擠出,載入時多一些 CPU。**這只是估算,要在分塊實作時實測。**
- 「用柵格把道路依寬度畫上去、剩下的就是街廓」的做法,可以給我們在 OSM 沒有人行道或街廓資料時產生人行道與街廓地面。台中 OSM 道路寬度大多缺漏(0001 記錄有車道數的道路約 13%),目前寬度依「overrides → lanes → 道路等級預設」推估(`tools/map-build/lib/roads.ts:44-57`);政府路寬接上後可改善,但對應率尚未實測。
- 投影:我們用 TWD97(TM2)已經是公尺制平面座標,不需要他們的局部切平面。他們「旋轉到街道主方向」的技巧對台中不適用,因為台中有棋盤街區,也有大量斜向道路(例如台灣大道)。

### 2.b 建築與道路生成

**【事實】建築(`js/buildings.js`,2,633 行)**
- **生成方式**:依街廓與地塊矩形,用 seeded PRNG(`mulberry32`,`buildings.js:60-70`)依「街區類型」生成建築。每個街廓用自己的位置當種子,所以每次載入結果相同(`buildings.js:287`)。
  - 街區類型有住宅、loft、辦公、NYCHA 社宅、濱水低樓等(`buildings.js:1093-1500`)
  - 建築類型有 brownstone、tenement、戰前公寓、1916 分區退縮的「婚禮蛋糕」、玻璃帷幕塔等(`buildings.js:760-1090`)
  - 鄰里設定檔(neighbourhood profile)依真實地區決定比例(`buildings.js:1508-1890`)
- **footprint**:全部是「軸對齊矩形的聯集」(`buildings.js:166-260`、`:411-415`),不是任意多邊形。非棋盤的街廓用「沿街框架」旋轉 θ 擺放(`buildings.js:265-267`)。
- **draw call 策略**:
  - 主體量體:每種立面材質一個 `InstancedMesh(BoxGeometry(1,1,1))`(`buildings.js:2108-2120`;`js/tsl-materials.js:1073-1099` 的 `createFacadeBoxes`)。每個 instance 帶兩個屬性:`box`(寬、高、深、種子+色調)和 `faces`(四面牆的 `WALL_KINDS`:店面 / 入口 / 後牆 / 地界牆 / 空白石牆,`tsl-materials.js:370`)。註解寫「6 TSL Facade Materials」(`buildings.js:2109`),原始碼沒有直接寫出 draw call 總數。
  - 時代廣場看板依主題合併成一個 mesh(`buildings.js:2122-2140`)。
  - 後院與中庭:一個 InstancedMesh,草地、鋪面、樹冠全由 world-space noise shader 畫,遠處淡化成平均色避免閃爍(`buildings.js:2142-2183`)。
  - 簷口、水塔、HVAC、逃生梯、遮雨棚、招牌、鷹架這些細節物件,每種是一個**固定容量的 InstancedMesh 池**,例如簷口 7,000、水塔 1,400(`buildings.js:2189-2194`)。玩家每移動 18 m,就用四叉樹查 560 m 半徑內的街廓重填,只上傳實際用到的 instance 範圍(`buildings.js:2396-2420` 的 `flagRange`)。
- **窗戶 shader**(`js/tsl-materials.js:386-488` 的 `facadeCell`):
  - box-local 模式下,u 從每面牆的轉角起算,**窗數 = 牆寬 / 窗寬四捨五入**,窗格寬度再反算,所以不會有半扇窗跨過轉角;可留轉角石柱(`cornerPier`)。
  - 每面牆依 `box.w` 的種子做整數窗格偏移,避免相鄰牆面窗戶重複。
  - 只有 0 樓是店面;入口牆依色調挑一個窗格當門;建築高度不是整層數時,頂端畫成實心女兒牆(`partial`),牆頂畫壓頂(`coping`)。
  - 上層窗戶有視差室內貼圖(interior mapping,`tsl-materials.js:194-250`),依像素覆蓋率(`fwidth`)淡化成平均亮度,避免遠處閃爍。
  - 已修過 45° 牆面主軸判斷造成的閃爍:在頂點階段決定主軸,用 flat interpolation 傳給片段(`tsl-materials.js:186-192`;commit `ed7d535`「Fix texture flicker on angled building facades」)。
- **地標**(`js/landmarks.js`,1,071 行):11 組地標用程式手工建模(帝國大廈、克萊斯勒等,`landmarks.js:192-1036`),再「貼到 OSM 真實外框的格網對齊 bbox,縮放到真實高度」(`landmarks.js:129-131`)。高度來自 OSM `height` 標籤(`build-geodata.mjs:166`)。
- **外圍行政區**:約 10 萬棟 instanced 建築共用一個便宜的窗格 shader,地面用程序化「城市地毯」shader 畫出街道格網、屋頂、綠地(`js/boroughs.js:64-67`)。

**【事實】道路**
- 路面是**整座島的一個平面多邊形**(海岸線,y=0,`js/city-grid.js:1521-1523`),人行道和路緣石是**疊在上面的「街廓島」**:矩形用 instanced slab,不規則形用擠出(`city-grid.js:1532-1545`)。換句話說,道路是街廓之間的「負空間」。
- 標線(車道線、雙黃線、停止線、斑馬線、自行車道)從可行駛道路圖生成,保證和車流行為一致(`js/road-paint.js:5-8`)。
- 路面 shader 有積水與潮濕遮罩,依時段調整濕度(`tsl-materials.js:1627-1760`;`lighting.js` 的 `roadWetness`)。

**【推論】對我們的意義**
- 「立方體 instancing」只適合矩形建築。台中 OSM footprint 多半是不規則多邊形,我們的「擠出 + 圓角 + 女兒牆」路線(`3D_Racing/tools/map-build/lib/buildings.ts`)要保留。可以借的是**資訊編碼方式**:建置時替每面牆寫入「牆寬」「從轉角起算的距離」「牆種類」頂點屬性,讓 `building-material.ts` 能畫出「窗數為整數、不跨轉角」的窗格,不再只有目前的水平窗帶。這和低彩度、可愛風格不衝突,窗格可以畫得很淡。
- 「道路 = 負空間」的做法對台中不適用:台中 OSM 沒有街廓與路緣資料,道路寬度也多半缺漏。我們用道路帶狀網格是合理的。
- 地標「程式建模 + 貼合 OSM 外框 + 真實高度」對應我們的地標待辦。台中地標(歌劇院、新光三越等)造型特殊,要程式建模還是外部模型,應個別評估。

### 2.c 車輛物理、操控、相機

**【事實】**
- **物理**:**自己寫的運動學(kinematic)arcade 模型,沒有用物理函式庫**(`js/controllers.js:38-58`、`:1082-1150`)。
  - 速度:`driveSpeed()` 用固定滾動阻力加二次空氣阻力,寫成不會越過 0、大 dt 也穩定的形式(`controllers.js:47-58`)。參數 `CAR_DRIVE`:極速 23.5 m/s(約 85 km/h)、boost 極速 36(`boostSpeed`,boost 加速度 21)、倒車 10.5、加速度 14 m/s²、滾動阻力 0.12、阻力係數 0.0004、煞車 9(`controllers.js:38-41`)。最新一個 commit 就是在調滑行阻力(`039a327`、`f3132b6`)。
  - 轉向:目標轉角 = 輸入 × 0.52 rad,以 `dt*10` 逼近;航向變化 = 轉角 × 2.4 × min(1, |v|/8) × dt(`controllers.js:1099-1105`)。沒有輪胎模型,側滑只在碰撞後以 `exp(-6.8 dt)` 衰減(`controllers.js:1107-1118`)。
  - **視覺懸吊**:車身 `chassisPivot` 的 pitch、roll、heave 用三個彈簧阻尼器驅動(k=68、c=11.2;heave k=85、c=12)。目標俯仰角取自加速度,目標側傾取自轉向 × 速度比(`controllers.js:1122-1138`)。這純粹是視覺效果,不影響行駛。
  - 碰撞:海岸線夾限,加上 48 m 網格空間雜湊查詢附近的 OBB 碰撞體(`controllers.js:799-860`)。
- **相機**(`js/cameras.js`):11 個預設,包含追車、低角度、第一人稱和 8 個風景機位(`cameras.js:8-20`)。
  - 追車距離隨速度拉遠(最多 +25%),速度先用 `exp(-3dt)` 平滑(`cameras.js:185-200`)。
  - **追車鏡頭在車體座標系平滑**(`cameras.js:335-352`):平滑的對象是「相機相對車子的位移」,不是世界座標;車子高度另外在世界座標平滑。註解說明原因:世界座標的跟隨會落後「速度 × dt」,幀時間不均時鏡頭會前後湧動。
  - 遠平面 60,000 m,搭配 reversed depth buffer(`cameras.js:26-31`、`main.js:43-48`)。

**【推論】對我們的意義**
- 我們用 Rapier raycast vehicle(`3D_Racing/src/physics/world.ts`、`src/vehicle/`)才有真實懸吊與碰撞,**他們的物理不適用**,沒有理由退回運動學模型。
- 不過,**視覺用的車身 pitch / roll 彈簧**很適合「可愛」手感:Q 版車身在加減速、轉彎時明顯點頭、側傾。可以疊在 Rapier 的車體姿態上,只作用在模型節點。要不要加、幅度多少,屬於手感(品味)判斷,**需要 Cooper 試玩拍板**。
- **追車鏡頭改成在車體座標系平滑可以直接借用**。我們 `chase-camera.ts:56-57` 是 `this.pos.lerp(desired, k)`,正是他們修掉的那種寫法。驗證方式:用 `3D_Racing/tools/dev/handling-probe.ts` 或 e2e 錄一段固定輸入,比較改前改後「相機到車的距離」逐幀變異數,並在 60 Hz 與 120 Hz 螢幕上各測一次。

### 2.d 車子模型(對我們卡關的問題特別重要)

**【事實】**
- **完全由程式在 runtime 生成,沒有任何外部模型檔**。repo 內沒有 `.glb`、`.gltf`、`.png`、`.jpg`;`grep GLTFLoader` 無結果(`js/` 全目錄)。
- 出處:`js/actor-models.js:26-31` 的註解寫明,這是從 three.js 官方範例 `webgpu_generator_city` 的 `LoftGeometry.js` 與 `CarGenerator.js` **移植改寫**。**我們專案已安裝的 three r186.1 裡就有這兩個檔**:`3D_Racing/node_modules/three/examples/jsm/geometries/LoftGeometry.js`、`.../generators/city/CarGenerator.js`(479 行),同目錄還有 `SkyscraperGenerator.js`(1,757 行)等城市生成器。授權是 three.js 的 MIT。
- 做法(`js/actor-models.js:194-200`、`:213-312`、`:316-578`):
  1. **設計表 `BODY_SPECS`**:用 `[z, 值]` 控制點描述車身側視與俯視曲線,包括半寬、門檻高、肩線高、腰線、引擎蓋與車頂拱度、側窗內傾(tumblehome)。車頭、車尾的每個量另有「長度、尖端值、超橢圓指數」的收頭參數。內建 `sedan`、`suv`、`taxi` 三種(`actor-models.js:215-306`)。
  2. 曲線用 **Fritsch-Carlson 單調三次樣條**插值,平滑而且不會過衝(`actor-models.js:316-350`)。
  3. 車頭、車尾用**超橢圓 1/4 弧**收到尖端,尖端切線垂直(`endFactor`,`actor-models.js:352-360`)。
  4. 每個斷面的右半邊 = 下緣超橢圓角(n=2.8)+ 上緣超橢圓角(n=3.2)+ 拋物線頂拱,再鏡射(`actor-models.js:475-498`)。
  5. 沿車長取約 45 個斷面,在車頭車尾和輪拱處加密,輪拱是圓形(`bodyStations`,`actor-models.js:500-532`),然後 loft 成封閉網格。
  6. **玻璃艙另外 loft 一個開放曲面**,有前擋傾角、後窗、側窗內傾和圓角車頂邊(`actor-models.js:409-464`、`:547-578`)。
  7. 玻璃、膠條、柱子、燈、水箱罩、車牌、門縫、塗裝、煞車燈、方向燈,**全部由一個 TSL 材質依 object-space 位置與法向量用 SDF 畫出**,所以每種車身只要一個 instanced draw call(`actor-models.js:197-200`、`:891-935`)。另有少數獨立幾何零件:輪胎和輪圈是 LatheGeometry(`actor-models.js:668-735`),後照鏡(`:739-751`)、車頂行李架(`:756-773`,有 `rails` 的車型)、計程車頂燈(`:787-810`)也是獨立幾何;全部在 `buildCarGeometry` 用 `mergeGeometries` 合成一個 geometry(`:813-824`)。
  8. **LOD**:遠景用「約 250 三角形」的粗斷面 proxy(`actor-models.js:826-829`;`js/traffic.js:223-228`;高速公路車流 170 m、450 m 兩段切換,`traffic.js:2118-2124`)。
- 玩家的車是 `BODY_SPECS.taxi` 加黃色漆(`controllers.js:416-427`),另外加貼合曲面的車門貼花與車牌(`controllers.js:429-455`)、車底接觸陰影平面(`controllers.js:488-494`)。
- 完整車模的三角形數:**not_stated**。原始碼沒有寫,要算就得執行它的程式,本次分析不執行。

**【推論】對我們卡關問題的意義**
- 他們的做法和我們 `3D_Racing/tools/models/mini_f55.py`(Blender 參數化斷面 loft + 超橢圓)**屬於同一類方法**,差別在完成度:
  - 曲線用單調樣條控制,不是少數幾個斷面
  - 車頭車尾、輪拱有專門的收頭與加密
  - 玻璃艙是獨立曲面
  - 細節用 shader 畫,不靠布林運算或貼片
- 但他們的目標是「一看就是紐約計程車、轎車、SUV」的**通用車型**,不是「一看就是某品牌某車款」。`3D_Racing/docs/decisions/0008-mini-model-approach.md` §1 已指出,我們的問題是「方法的上限」:辨識度要靠精準剪影、銳利摺線、獨立零件。這個 repo **沒有推翻這個判斷**,也沒有提供 MINI 或任何特定車款的資產。
- 如果 Cooper 在 0008 選了路線 C(繼續程式建模),可以這樣用:
  1. 直接用 r186 內建的 `LoftGeometry` 在 three.js 端生成車身,跳過 Blender,改參數立即看到結果,迭代比較快。
  2. 用 `BODY_SPECS` 的資料結構描述 F55 的側視、俯視曲線(以公開尺寸與照片目測)。
  3. 細節改用 shader 畫,不做幾何。
  
  不過 `CarGenerator.js` 的材質是 `MeshStandardNodeMaterial`(TSL),只能在 WebGPURenderer 上用,我們的 WebGLRenderer 只能借幾何部分。**即使這樣做,「像 MINI」仍沒有保證**,建議把它當成路線 C 的工具升級,而不是新路線。

### 2.e 渲染與風格

**【事實】**
- Renderer:`WebGPURenderer`,reversed depth buffer,`setPixelRatio(1.0)`(固定 1,不依 DPR),`ClusteredLighting` 處理大量點光源與聚光燈(`js/main.js:43-52`)。
- 天空:three addons 的 `SkyMesh`(Preetham + 雲,`js/lighting.js:160`),烘成 PMREM 當環境光(IBL)(`lighting.js:258`;import 在 `lighting.js:20-23`)。
- 陰影:r186 addons 的 `SunLight`,2 個 cascade,每個 3072²,近 cascade 涵蓋約 0.35–80 m,`normalBias 0.05`(`lighting.js:203-215`)。
- 霧:依天空顏色的「空氣透視」霧,用 `fog()` node 從 PMREM 取地平線色,密度隨時段變(`lighting.js:226-250` 的 `createAerialFogNode`;初始的 `FogExp2` 在 `lighting.js:151`)。
- 時段預設 4 組(黃金時刻、正午、藍調時刻、深夜),每組含太陽方向與顏色、半球光、霧色與密度、室內燈亮度、路面濕度、雲量等(`lighting.js:30-136`)。
- 後處理(`js/post-processing.js`,89 行):半解析度 SSR(`main.js:167-200`)、Bloom(半解析度)、曝光、白平衡、對比、飽和度、vibrance、暗部偏冷亮部偏暖、暗角,最後 ACES tone mapping。**依時段的 `LOOKS` 預設表集中管理**(`post-processing.js:23-28`)。
- 色調取向:寫實、高對比(對比 1.08–1.12、飽和 1.06–1.08),和我們的低彩度淡雅風格相反。

**【推論】對我們的意義**
- 我們的風格是方案丙「真實淡雅」(`3D_Racing/src/config/palette.ts`),**他們的寫實色調不適用**。
- **「LOOKS 預設表 + 最後一關統一調色」的結構值得參考**:把曝光、飽和、冷暖分離、暗角集中在一個地方,配合 `palette.ts` 調出一致的低彩度感,比一個一個改材質顏色好控制。WebGL 端可用 three addons 的 `EffectComposer` 加自訂 ShaderPass 實作。最終數值屬於品味判斷,**要 Cooper 看樣張決定**。
- 固定 `pixelRatio = 1` 是換效能的取捨。我們目前是 `min(DPR, 2)`(`3D_Racing/src/render/scene.ts:11`),要不要調整等效能預算實測後再說。

### 2.f 效能技巧、程式架構、建置工具

**【事實】**
- **空間切塊 culling**(`js/scene-culling.js`,317 行;註解在 `:3-12`):
  - 起因:全島的 InstancedMesh 包圍球約 7 km,three.js 永遠剔除不了,每幀要轉換所有 instance 三次(主視角加兩個陰影 cascade)。
  - 做法 1:把小物件的 InstancedMesh 依 `cell × cell` 切成多個 mesh,共用頂點資料和材質(`chunkInstancedMesh`,`scene-culling.js:74-80`)。每塊依「第 90 百分位的 instance 尺寸」算出消失距離,約等於小於 1–2 像素就隱藏(`CULL_PER_METRE = 1100`、`CULL_MIN 300`、`CULL_MAX 2000`,`scene-culling.js:14-19`)。
  - 做法 2:大型陰影投射物另外做「只有位置屬性的陰影替身」,切成 500 m 格,放在只有陰影相機會渲染的 layer 3;原物件不再投影(`scene-culling.js:10-12`、`:14`、`:20`)。
- 細節物件池只上傳用到的範圍(`buildings.js:2402-2408`;commit `b574893`「Limit building detail uploads to active instances」)。
- 材質快取,避免重複編譯 WGSL(`tsl-materials.js:182-184`)。在載入畫面用 `compileAsync` 分批預先編譯 shader(`main.js:555-605`)。
- 樹 3 級 LOD,每個樹種、變體、LOD 層級合成一個 instanced mesh,相機移動幾公尺才重新分組(`js/trees.js:13-14`)。
- 行人:整群人一個 instanced draw(每個 LOD 一個),骨骼變換放在 storage buffer,在 vertex 階段蒙皮(`js/pedestrians.js:33-34`)。
- 碼頭:同材質的靜態幾何合併,用 `uv.x` 編碼變體,一種材質一個 draw call(`js/city-grid.js:491-492`、`:675-676`)。
- 架構:原生 ES modules、沒有打包工具,`index.html` 用 `modulepreload` 平行預載 29 個模組(`index.html:21-50`;commit `1f66530`「Replace window globals with native ES modules」)。
- 測試:`node:test` 加上自寫的 `vm` 模組載入器(把 import 換成 stub,不需要瀏覽器;`tests/helpers/module.cjs:1-30`),甚至用數值方式驗證 TSL 運算式(`tests/facade-projection.test.cjs:7-20`)。沒有 `package.json`,怎麼執行測試 **not_stated**(推論是 `node --test tests/`)。
- 實際 draw call 數、fps、載入時間:**not_stated**。HUD 會顯示 fps(`index.html:96`),但 repo 沒有記錄量測值。

**【推論】對我們的意義**
- `scene-culling.js` 的兩個概念(**instance 依格切塊、依尺寸決定消失距離**,以及**陰影專用的低成本替身 + 只有陰影相機看得到的 layer**)直接對應我們的分塊載入待辦。我們目前的陰影是「光源跟著車走、單一 2048 shadow map」(`scene.ts:33-43`、`followSun`),全圖建築上線後也會碰到陰影相機要轉換所有建築的問題。
- 他們「沒有打包工具、three.js 跟 dev 分支」的作法**不適用**於我們。我們用 Vite + TS + 鎖定 r186,可重現性比較好。

### 2.g 遊戲性 / UX

**【事實】**
- HUD(`index.html:84-255`):品牌加 fps、時段切換、傳送選單(8 個地標)、全螢幕地圖 [M]、靜音 [N]、隱藏 HUD [H]、移動模式(走路、開車、腳踏車、直升機)、速度與高度表、相機切換。另有觸控搖桿與手把支援(`js/touch-controls.js`、`js/gamepad-controls.js`)。
- **路名**:`getLocationLabel(x, z)`(`js/city-config.js:673-697`):
  - 先看是否在地標 80 m 內,是就顯示「地標名 · 大道 & 街道」。
  - 中央公園內顯示「Central Park · near xx St」。
  - 靠近岸邊顯示「Hudson/East River Waterfront」。
  - 其他情況顯示「最近的大道 & 最近的街道」。
  - HUD 把結果畫成**紐約綠色路牌樣式**的一對 `span.street-sign`(`js/main.js:380-423`),字型用 Overpass(仿美國公路字體 Highway Gothic,`index.html:51-55`)。
- **小地圖 / 全圖**(`js/nyc-map.js`,1,290 行):
  - Canvas 2D,和 3D 世界 1:1;地面上約顯示 800 m,隨高度拉遠(`nyc-map.js:43`、`:981-984`)。
  - **2 倍大的離屏 canvas 快取**地面層與路名,玩家接近快取邊緣或縮放比例變動超過 12% 才重畫(`nyc-map.js:994-1022`)。
  - 疊上即時車流點、GPS 路線、地標點(`nyc-map.js:1034-1060`)。
  - 全圖可搜尋街道與地標,點擊即傳送並設定 GPS(`index.html:257-315`)。
- **音效**(`js/audio-*.js`,共 1,920 行):
  - **完全程序合成,沒有音檔**。引擎聲依汽缸數、柴油或汽油合成 20 個四行程循環的排氣脈衝 buffer,分低轉與高轉兩組 crossfade(`js/audio-synthesis.js:39-95`)。另有直升機旋翼、渦輪、腳踏車棘輪與鏈條、警笛(`audio-synthesis.js:97-215`)。
  - 腳步、說話片段、喇叭、撞擊(車體、金屬、碎片)、風聲、行人號誌聲也都是合成的(`js/audio-events.js:39-288`)。
  - 空間化:每個聲源一個 `PannerNode`,加 lowpass 模擬建築遮擋,所有聲源共用一個短卷積殘響。遮擋判斷沿用移動用的碰撞網格,不做 mesh raycast(`js/audio-system.js:13-30`、`js/audio-acoustics.js:1-2`)。
  - 效能:參數設為 k-rate,降低每個 sample 的運算(`audio-synthesis.js:6-12`);只挑最近的聲源發聲(`js/audio-sources.js:56-84`,控制頻率 10 Hz)。
- 其他:200 輛車加 12 輛公車,用 IDM 跟車模型,會換車道、看紅綠燈、禮讓行人;340 名行人(`js/traffic.js:24-32`)。換模式或傳送後會回到原位置(commit `9301fcb`)。

**【推論】對我們的意義**
- **路名**:我們已經用 flatbush 查最近道路(`3D_Racing/src/map/road-index.ts`)。可以借的是**顯示規則的優先序**(地標附近 → 特殊區域 → 「A 路 & B 街」交叉口)和**路牌樣式的 HUD**。台灣路牌是藍底白字或綠底白字,樣式要另外設計,屬於品味判斷,**要問 Cooper**。
- **小地圖**:「離屏 2 倍快取 + 靠近邊緣才重畫」是成本很低的實作模式,可直接套用到我們的小地圖待辦。我們的地圖已經有 2D 道路與建築資料,畫 Canvas 2D 不需要額外資料。
- **音效**:Lo-fi 可愛風格不一定要寫實引擎聲,但「合成引擎聲(零音檔、零授權風險)+ PannerNode + 只播最近的幾個聲源」的架構可以參考。MINI 是 3 缸或 4 缸引擎,他們的 `combustionBuffers(cylinders, ...)` 可以直接指定汽缸數。程式是 MIT,可以移植;音色好不好由 Cooper 試聽決定。
- 車流、行人目前不在我們的範圍內,不適用。

### 2.h 授權

見 §4。

### 2.i 「slop」是否暗示 AI 生成

**【事實】**
- README 只有 15 行,**沒有說明名稱由來,也沒有提到 AI**(`README.md:1-15`)。
- 42 個 commit 的作者都是「Mr.doob」,commit 訊息裡**沒有 AI 工具的署名或 Co-Authored-By**(`gh api .../commits?per_page=100`)。
- 首個 commit(2026-10-20)一次加入 41 個檔案、188,146 行(含約 14 MB 資料 JSON),之後 3 天內又有 41 個 commit。
- 在 repo 內搜尋 `claude|anthropic|openai|chatgpt|gpt-|gemini|codex|copilot|llm|AI|prompt|agent` 等字:**沒有任何與 AI 相關的文字**。唯一的命中是 `fullmap`、`cursor` 這類 CSS 與 HTML 識別字。
- `index.html:7` 的 meta description 寫著「Photorealistic GTA-style 3D Slop New York simulation … at 60 FPS」;`js/controllers.js:27` 寫「GTA 6-style」;`js/nyc-map.js:32` 寫「GTA 6-Style Live Radar Minimap」。
- 網路搜尋「mrdoob "slop new york"」沒有找到相關說明(2026-10-23)。

**【推論】**「slop」在英語圈常用來稱呼 AI 量產的內容。三天內產出約 3 萬行 JS、行銷味重的註解與 meta 描述,都符合 AI 輔助生成的特徵。但作者**沒有明說**,所以結論是 **not_stated**。不論是否為 AI 生成,我們若要借用程式碼,都應該自己讀懂並寫測試,不能整段照搬。

---

## 3. 對照表

| 項目 | 他們的做法 | 我們的現況 | 建議 | 理由 |
|---|---|---|---|---|
| 地圖資料來源 | NYC Open Data(CSCL 含路寬)為主,OSM 補充;一般建築不用真實 footprint | OSM 全量(道路、建築、地標),`0001-map-data-source.md` | 不適用 | 我們要真實 footprint;路寬已決定用臺中市政府道路寬度資料補 OSM(0001,尚未接上),不走 CSCL 那種「路緣到路緣」中心線資料 |
| 地圖資料格式 | 只存 2D(街廓、地塊、道路折線),座標取到 0.1 m,1.12 MB / gzip 386 KB 涵蓋全曼哈頓;runtime 生成幾何 | 建置時擠出成網格存進 map.bin(M0 1.33 MB;範圍 A 預估約 50 MB) | **參考概念** | 改成傳 footprint + 高度,在 client 端擠出,是解決 30 MB 預算最直接的方向;要在分塊實作時實測 |
| Overpass 下載 | 暫存檔 → `JSON.parse` 驗證並拒絕 `remark` → 原子 rename;3 端點 × 12 輪 | `tools/research/fetch_overpass.sh` 直接寫入目標檔,只檢查 `"osm3s"` | **直接借用** | 避免逾時的不完整資料蓋掉舊的好資料;改動小 |
| 投影 | 局部切平面 + 旋轉 29° 對齊街道 | TWD97(`src/map/projection.ts`) | 不適用 | TWD97 已是公尺平面座標;台中沒有單一主方向 |
| 街廓 / 人行道 | 道路依寬度畫進柵格,剩下的區域就是街廓;人行道依街廓內縮 | 主要道路兩側 2.5 m 色帶 | 參考 | 之後想要「街廓地面 + 人行道」時可用;要先處理寬度缺漏 |
| 建築幾何 | 軸對齊矩形聯集,單位方塊 InstancedMesh,每種材質一個 | earcut 擠出 + 圓角 + 女兒牆,合併網格 | 不適用(幾何) | 台中 footprint 不規則;圓角是我們的可愛化特色 |
| 窗戶 shader | box-local 窗格,窗數依牆寬取整、不跨轉角、牆種類由 instance 屬性決定、遠處依 `fwidth` 淡化 | 依高度畫水平窗帶,遠處淡化(`building-material.ts`) | **參考** | 建置時加「牆內距離、牆寬、牆種類」頂點屬性,就能畫整數窗格;風格強度要 Cooper 看樣張 |
| 細節物件 | 固定容量池 + 四叉樹,560 m 內串流,只上傳用到的範圍 | 沒有 | 參考(之後) | 之後加招牌、冷氣、遮雨棚時適用 |
| 地標 | 程式手工建模 → 貼到 OSM 外框 bbox → 縮放到真實高度 | 待做 | 參考 | 貼合流程可沿用;建模方式要逐一評估 |
| 道路 | 整島一片柏油 + 疊上街廓;標線由道路圖生成 | 道路帶狀網格(`tools/map-build/lib/roads.ts`) | 不適用 | 沒有街廓與路緣資料 |
| 車輛物理 | 自寫運動學,沒有輪胎模型 | Rapier raycast vehicle | 不適用 | 我們要真實懸吊與碰撞 |
| 車身視覺懸吊 | 車身節點的 pitch / roll / heave 彈簧,疊在行駛之外 | 沒有(姿態全由 Rapier 決定) | 參考 | 可強化 Q 版手感;幅度屬手感判斷,要 Cooper 試玩 |
| 追車相機 | 在車體座標系平滑,速度先平滑再拉遠 | 世界座標 lerp(`chase-camera.ts:56-57`),依速度改 FOV | **直接借用** | 改動小;可用逐幀「相機到車距離」變異數驗證 |
| 車子模型 | runtime 程式 loft(r186 的 CarGenerator 改寫):樣條 + 超橢圓 + 獨立玻璃艙 + shader 細節;遠景約 250 三角形 | Blender 腳本 loft,兩度退件;0008 待 Cooper 選路線 | 參考(只限路線 C) | 方法同類但更細;**仍是通用車型,解決不了 MINI 辨識度** |
| Renderer / shader | WebGPURenderer + TSL,three@dev CDN | WebGLRenderer + `onBeforeCompile`,r186 | 不適用(直接搬) | TSL 程式在 WebGLRenderer 上不能用;換 renderer 是另一個大決策 |
| 天空 / 光照 | SkyMesh + PMREM IBL + 2 cascade SunLight + 依天空色的空氣透視霧;4 組時段 | canvas 漸層天空 + Fog + 單一跟車陰影 | 參考(時段結構) | 要不要做時段變化由 Cooper 決定;寫實天空不符淡雅風格 |
| 後處理色調 | `LOOKS` 預設表:曝光、白平衡、對比、飽和、冷暖分離、暗角 + ACES | 沒有後處理 | 參考 | 集中調出低彩度感;數值要 Cooper 看樣張 |
| 效能 culling | instance 依格切塊 + 依尺寸決定消失距離 + 陰影替身 layer | 全部一次載入(M0 小區域) | **參考概念** | 直接對應分塊載入待辦 |
| 預編譯 shader | 載入畫面用 `compileAsync` 分批預熱 | 沒有 | 參考 | WebGL 端用 `renderer.compileAsync`(r186 有)可避免第一次轉頭卡頓;要實測 |
| 建置與測試 | 沒有打包工具;`node:test` + vm stub | Vite + TS + vitest + playwright e2e | 不適用 | 我們的工具鏈比較完整 |
| 路名 HUD | 地標 → 特殊區域 → 「大道 & 街道」優先序;紐約路牌樣式 | flatbush 查最近道路(`road-index.ts`) | 參考 | 借優先序;路牌樣式要依台灣路牌設計,問 Cooper |
| 小地圖 | Canvas 2D + 2 倍離屏快取 + 接近邊緣才重畫 + 路名沿線 | 待做 | **參考概念** | 實作成本低、效能好 |
| 音效 | 全程序合成(引擎、喇叭、撞擊、風),PannerNode + 遮擋 lowpass,只播最近的聲源 | 待做 | 參考(可移植部分程式) | 零音檔、零授權風險;音色由 Cooper 試聽 |
| 字型 | Google Fonts:Inter(UI)、Overpass(路牌) | 待做 | 參考 | 中文字型要另外選;授權要個別確認 |
| 地圖資料標示 | 只寫在 README 和原始碼註解;UI 內**找不到** OSM 標示字串 | HUD 已顯示「地圖資料 © OpenStreetMap contributors」(`src/ui/hud.ts:20`) | 不適用(我們做得比較完整) | ODbL 要求在使用處標示,保持現狀 |

---

## 4. 授權結論

**【事實】**
- 程式碼:**MIT**,Copyright (c) 2026 Mr.doob(`LICENSE:1-21`;`README.md:13`)。
- 部分程式移植自 three.js 官方範例(`LoftGeometry.js`、`CarGenerator.js`、`SkyscraperGenerator.js`,見 `js/actor-models.js:28-31`、`js/tsl-materials.js:70`、`:197-198`)。three.js 本身也是 MIT。
- 地理資料:README 寫「NYC Open Data and © OpenStreetMap contributors (ODbL). Third-party data and dependencies retain their respective licenses.」(`README.md:15`)。生成檔的檔頭也有同樣的來源標示(`js/nyc-geodata.js:5-6`)。
- 遊戲 UI 內沒有找到 OSM 或 NYC Open Data 的標示字串(`grep OpenStreetMap index.html js/main.js js/nyc-map.js` 只命中註解)。
- 沒有任何外部 3D 模型、貼圖、音檔(看板、車牌、貼花都是 canvas 程式生成,例如 `tsl-materials.js:1929` 的 `createBillboardCanvasTexture`、`controllers.js:95` 的 `createNYLicensePlateTexture`)。
- 外部執行期依賴:jsDelivr 上的 three.js dev 分支、Google Fonts(Inter、Overpass)(`index.html:11-20`、`:51-55`)。

**結論(能不能直接拿程式碼用)**
- **可以**。MIT 允許複製、修改、商用。條件是在「我們複製的程式碼所在的檔案或發行物中」**保留 MIT 授權全文與「Copyright (c) 2026 Mr.doob」**。如果移植的段落源自 three.js 範例,也要保留 three.js 的 MIT 標示(我們安裝的 r186.1 `3D_Racing/node_modules/three/LICENSE:3` 寫的是「Copyright © 2010-2026 three.js authors」)。
- 建議做法【推論】:移植的程式放在獨立檔案,檔頭註明來源 URL、commit hash 和 MIT 授權;另外在 `3D_Racing/THIRD_PARTY_NOTICES`(或 README 的授權段落)集中列出。這是決策,要寫進 `docs/decisions/`。
- **他們的 NYC 資料與我們無關**,我們不會用。我們的 OSM 標示已在 HUD 做到,保持即可。
- 實務上的限制:他們的 shader 都是 TSL,我們的 WebGLRenderer 不能直接用;能直接拿的主要是**純 JS 邏輯**,例如相機平滑、`driveSpeed` 類的數值積分、音效合成、小地圖快取、`overpass.sh` 的驗證流程、loft 幾何演算法。
- Google Fonts 的 Inter 與 Overpass:授權推論是 SIL OFL,**本次沒有查證**。我們不會沿用英文路牌字型,影響不大。

---

## 5. 未查到的項目(not_stated)

| 項目 | 說明 |
|---|---|
| 玩家車與一般車的完整三角形數 | 原始碼沒有寫;要算得執行它的程式,本次不執行。只有遠景 proxy 註明「約 250 三角形」(`actor-models.js:826`) |
| 實際 draw call 總數、fps、載入時間、記憶體 | repo 裡沒有量測紀錄 |
| 建築總棟數、總面數 | 由 runtime 生成,原始碼沒有寫(外圍行政區只寫「約 10 萬棟」,`boroughs.js:66`) |
| NYC Open Data 三個檔的下載方式 | `tools/fetch-geodata.sh` 有被引用,但 repo 裡沒有 |
| 測試執行指令 | 沒有 `package.json` 或文件說明 |
| 專案名稱「slop」的由來、是否由 AI 生成 | README 和 commit 都沒寫;§2.i 只有推論 |
| WebGPU 不支援時的備援行為 | 沒有找到明確的 fallback 程式或說明(推論:r186 的 WebGPURenderer 有 WebGL2 後端,但本次沒有驗證) |
| Inter / Overpass 字型授權 | 推論是 OFL,沒有查證 |
| 在不同硬體上的實際手感與畫質 | 依任務指示沒有實際遊玩 |

---

## 6. 重做本分析需要的東西(給接手者)

1. `git clone --depth 1 https://github.com/mrdoob/slop-newyork <新的空目錄>`,然後 `git -C <目錄> log -1` 確認 commit hash。
2. 結構與行數:`wc -l js/*.js tools/*.mjs tests/*`、`ls -la tools/data`、`du -sh .`。
3. repo 資訊:`gh api repos/mrdoob/slop-newyork`(授權、時間、星數)、`gh api "repos/mrdoob/slop-newyork/commits?per_page=100"`(commit 數與訊息)、`gh api repos/mrdoob/slop-newyork/commits/<首個 sha>`(首個 commit 規模)。
4. 地理資料統計:**不要 import 它的模組**。把 `js/nyc-geodata.js` 當文字讀,從 `export const GEO = ` 之後取出 JSON 再 `JSON.parse`,然後統計各 key 的大小、`blocks.length`,並用 zlib 算 gzip 大小。本次腳本在 scratchpad 的 `scripts/geo-stats.mjs`,邏輯就是這幾行,可以照著重寫。
5. 重點檔案的閱讀順序:`tools/geo-base.mjs`(投影)→ `tools/build-geodata.mjs`(輸出格式)→ `js/buildings.js` 的章節註解(`grep -n "^  // "`)→ `js/tsl-materials.js:370-500`、`:1073-1099`(窗戶與 instancing)→ `js/actor-models.js:191-580`(車模)→ `js/controllers.js:38-58`、`:1082-1150`(物理)→ `js/cameras.js:185-360`(相機)→ `js/scene-culling.js`(culling)→ `js/nyc-map.js:961-1060`(小地圖)→ `js/audio-synthesis.js:39-95`(引擎聲)。
6. 和我們對照的檔案:`3D_Racing/src/render/scene.ts`、`src/render/building-material.ts`、`src/camera/chase-camera.ts`、`tools/map-build/lib/buildings.ts`、`tools/research/fetch_overpass.sh`、`tools/models/mini_f55.py`、`docs/decisions/0008-mini-model-approach.md`、`docs/milestones/M1-progress.md`。
7. 確認 three r186 內建的生成器:`ls node_modules/three/examples/jsm/generators/city node_modules/three/examples/jsm/geometries/LoftGeometry.js`。

---

## 7. 驗收修正紀錄

驗收日期:2026-10-23。方式:fresh-context 回讀抽查(repo commit `039a327`,只讀未執行;數字用 `wc`、`du`、`ls -la`、Node `zlib`、`gh api` 重量)。原檔備份在 `docs/research/slop-newyork-analysis.md.bak`。

1. §0 `tools/`:原寫「7 個腳本」→ 實際 8 個檔(7 個 `.mjs` + `overpass.sh`),行數 1,761 正確。
2. §1 第 1 點、§3「地圖資料格式」:原寫「1.09 MB」→ 1,117,086 bytes 應為約 1.12 MB(1.09 是 KiB 除以 1000 的混用)。
3. §2.a 推論、§3「地圖資料來源」:原寫「台中沒有可對應 CSCL 的開放街道寬度資料(0001 已決定)」→ 0001:19 實際決定是用臺中市政府道路寬度開放資料補 OSM 路寬(M1-plan:19 項目 7);`data/overrides/road-width.json` 目前為空。同段補上 `roads.ts:44-57` 的實際寬度規則。
4. §2.a:`geo-base.mjs:39` → 註解實際在 `:35`。
5. §2.c:原寫「加速時 36」→ 36 是 `boostSpeed`(boost 極速),另有 `boostAcceleration` 21。
6. §2.d 第 7 項:原寫「只有輪胎和輪圈是另外的 LatheGeometry」→ 另有後照鏡、車頂行李架、計程車頂燈等獨立幾何,全部用 `mergeGeometries` 合成(`actor-models.js:739-824`)。
7. §4、§5:three.js LICENSE 年份原標「沒有查證」→ 本機可查,`node_modules/three/LICENSE:3` 為「Copyright © 2010-2026 three.js authors」;已從 §5 not_stated 表移除。

抽查無誤的部分:§0 其餘數字(js 30 檔 / 30,794 行 / 2,500,487 bytes、tests 1,955 行、css 1,452 行、tools/data 14,775,021 bytes、geodata gzip 385,732 / brotli 299,275、42 commits、193 星 / 52 fork、首個 commit 41 檔 / 188,146 行、du 21M / 4.4M);§1 八點的出處;§2.d 的 three.js 檔案(`node_modules/three/examples/jsm/geometries/LoftGeometry.js` 355 行、`.../generators/city/CarGenerator.js` 479 行、`SkyscraperGenerator.js` 1,757 行;CarGenerator 用 `MeshStandardNodeMaterial`);§4 MIT 結論與 `LICENSE`、`README.md:13-15` 一致;我們專案的 `chase-camera.ts:56-57`、`fetch_overpass.sh`、`scene.ts:10-11,33-43`、`building-material.ts`、`hud.ts:20`、`road-index.ts`、map.bin 1,327,676 bytes、M1-progress 的 50 MB 估算。
