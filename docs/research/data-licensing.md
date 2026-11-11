# 資料與智財授權調查(台中 MINI 兜風)

- 版本:v0.1(2026-10-12)
- 調查範圍:地圖資料來源(Google、OSM、台灣政府開放資料)、車輛/建築/商場的智財、字型授權
- 查閱日期:除另註外,所有來源於 **2026-10-11 ~ 2026-10-12** 查閱
- 標記規則:`not_stated` = 查不到或來源未寫明;`推論` = 本文作者依來源所做的推論,非來源原文
- 英文引文每段 < 15 個英文單字,其餘為自行摘要;中文法條完整引用單一條文
- **本文件第 5 題(智慧財產)及所有涉及法律效果的描述皆「非法律意見」**,僅整理公開資訊與常見做法;公開發布前應由 Cooper 決定是否諮詢律師

---

## 0. 一頁結論

| # | 題目 | 結論(一句話) |
|---|---|---|
| 1 | Google Maps 條款 | GMP 條款 §3.2.3(a)(c) 明文禁止擷取、以 Google 內容「描繪/數位化」道路與建物輪廓;一般使用者條款 §2 禁止複製、大量下載、建立替代性地圖資料集。「只看圖、自行風格化建模」**沒有明文處理**(not_stated)。 |
| 2 | Photorealistic 3D Tiles | 可在 three.js 透過 3DTilesRendererJS 顯示,但需 API key + 綁定計費、必須顯示 Google Maps logo 與彙整後的資料來源字串;**禁止抽取/描繪幾何(含人工)、禁止離線使用**;以 shader 風格化外觀**無明文**(not_stated)。 |
| 3 | OSM / ODbL | 遊戲畫面屬 Produced Work → 公開時需「© OpenStreetMap contributors」+ ODbL 連結(遊戲可放 splash/選單/credits);遊戲內打包的 GLB/JSON 若可還原出原始資料,依 OSMF 指引屬 **Derivative Database → 公開時須以 ODbL 提供**。 |
| 4 | 台灣政府開放資料 | **臺中市道路寬度/道路中心線/建物圖、20m DTM** 皆為政府資料開放授權條款第 1 版(與 CC BY 4.0 相容)、可下載、涵蓋台中;**國土測繪中心 3D 建物模型已改為收費供應,非開放資料**;5m DEM 未在 data.gov.tw 開放。 |
| 5 | 智財(非法律意見) | MINI 名稱/logo 為 BMW AG 商標;公開發布時常見做法是「致敬造型、不用名稱與 logo」。著作權法 §58 允許以任何方法利用戶外長期展示的建築著作(4 款例外不含遊戲建模,推論),但 §64 要求**明示出處**。商場名稱/logo 常見改為虛構或通稱。 |
| 6 | jf open 粉圓 | SIL OFL 1.1,可隨遊戲嵌入與散布(含商業);須附版權聲明+授權全文;**若做 webfont 子集化即屬修改版,不得沿用保留字型名稱「open huninn / huninn」**。 |

---

## 1. Google Maps Platform 與 Google Maps/Earth 使用者條款

### 1.1 結論

1. **Google Maps Platform 服務條款(開發者/API 用戶)**明文禁止:擷取(scraping)、快取、以 Google Maps 內容「建立內容」(例:描繪/數位化道路與建物輪廓、由 45° 影像做 3D 建物模型、由 Elevation API 做地形模型)、以及重建 Google 產品功能。
2. **Google Maps / Google Earth 一般使用者附加條款**禁止:以 Google Maps 建立新產品、複製內容(除許可頁或合理使用外)、大量下載、用以建立或擴充「替代 Google Maps 的地圖資料集」。
3. **Google 地理產品使用規範(Geo Guidelines)**另明文:不得從街景影像「數位化或描繪」產生資料;不得以 Google Earth 輸出重建 3D 模型。
4. **「人工目視 Google Maps/街景照片,自行做風格化建模(不擷取幾何與座標)」:not_stated**——上述三份文件皆未有條文明確處理「僅作視覺參考、不取得幾何與座標」的情形。(只回報有無明文,不給法律意見。)

### 1.2 依據

| 條款 | 關鍵短句(原文 <15 字)/摘要 | 來源 |
|---|---|---|
| GMP ToS §3.2.3(a) No Scraping | "Customer will not export, extract, or otherwise scrape Google Maps Content"。例示含預取、儲存、批次下載圖磚與街景、複製商家名稱與地址。 | https://cloud.google.com/maps-platform/terms (Last modified 2026-08-26) |
| GMP ToS §3.2.3(b) No Caching | "Customer will not cache Google Maps Content",除 Service Specific Terms 明文允許者外。 | 同上 |
| GMP ToS §3.2.3(c) No Creating Content From Google Maps Content | "Customer will not create content based on Google Maps Content."例示 (i) "trace or digitize roadways, building outlines"(限定自 Maps JavaScript API 衛星底圖)、(ii) "create 3D building models from 45° Imagery"、(iii) 由 Elevation API 建地形模型、(v) 由街景影像建立樹木位置索引。 | 同上 |
| GMP ToS §3.2.3(d) No Re-Creating Google Products | 不得做出與 Google 產品實質相似或重建其功能的產品;須有獨立價值。 | 同上 |
| GMP ToS §3.2.3(e) No Use With Non-Google Maps | 不得在非 Google 地圖旁或一起使用 Google Maps 核心服務。 | 同上 |
| GMP ToS §20 定義 | "Google Maps Content" 指 "any content provided through the Services"(含地圖、地形、影像、地點資料)。 | 同上 |
| GMP ToS §3.2.1(c)(vi) | 不得用於依 COPPA 屬「針對兒童」的網站/服務。 | 同上 |
| GMP ToS §3.2.2(a)(i)、(b) | 應用程式的服務條款須告知含 Google Maps 功能並連結 Maps 附加條款與隱私權政策;須顯示 Google 提供的所有 attribution,不得修改或遮蔽。 | 同上 |
| Google Maps End User Additional Terms §2.1–2.4 | §2.1 不得 "create a new product or service based on Google Maps";§2.2 不得複製內容(除許可頁或合理使用);§2.3 不得 "mass download or create bulk feeds of the content";§2.4 不得 "create or augment any other mapping-related dataset"(限於作為 Google Maps 替代服務之用)。 | https://maps.google.com/help/terms_maps/ (Last Modified 2026-01-27) |
| Google Earth End User Additional Terms §2.1–2.4 | 與 Maps 版同結構、同禁止事項(對象改為 Google Earth)。 | https://maps.google.com/help/terms_maps-earth/ (Last Modified 2025-06-04) |
| Geo Guidelines – Street View「Additional restrictions」 | 禁止 "Creating data from Street View images, such as digitizing or tracing";禁止下載街景離線使用、拼接多張街景。 | https://about.google/brand-resource-center/products-and-services/geo-guidelines/(由 https://www.google.com/permissions/geoguidelines/ 301 轉址) |
| Geo Guidelines – Google Earth「Web and apps」 | 禁止以 Earth 輸出 "to reconstruct 3D models or create similar content";並指向 Google Maps Platform 的遊戲用服務。 | 同上 |
| Geo Guidelines – Personalizing your map | 截圖可加註,但 "must not significantly alter how Google Maps" 等產品的外觀。 | 同上 |
| OSMF Licence FAQ §2.1.5 | OSM 社群明確表示不可從 Google 複製資料(與本專案混用 OSM 時相關)。 | https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ |

### 1.3 對本遊戲的影響

| 做法 | 個人非公開 | 公開發布 |
|---|---|---|
| 爬取/下載 Google 圖磚、街景、地點資料存進遊戲 | 條款禁止(條款是使用授權條件,不分公開與否) | 同左,且散布後風險更高 |
| 在 Google 衛星圖/3D 上描繪道路、建物輪廓、取座標 | GMP §3.2.3(c)、Geo Guidelines 明文禁止(街景、Earth) | 同左 |
| 用 Google 內容擴充地圖資料集 | Maps 附加條款 §2.4 限制(條文限於替代 Google Maps 的用途;遊戲是否屬之:not_stated) | 同左 |
| 人工看照片/街景,自行以簡化幾何「致敬」建築外觀 | 無明文(not_stated) | 無明文(not_stated);建議由 Cooper 決定是否諮詢律師 |
| 路名、店名以 Google 為來源複製 | §3.2.3(a)(iii) 例示禁止複製商家名稱與地址 | 同左 → 路名改用 OSM/政府資料 |

### 1.4 not_stated

- 「僅目視參考、不擷取幾何與座標的人工風格化建模」是否屬 §3.2.3(c)「create content based on Google Maps Content」:not_stated。
- 遊戲是否屬 Maps 附加條款 §2.4 的「替代 Google Maps 的服務」:not_stated(推論:一般開車遊戲不是導航/地圖替代品,但條文未定義)。

---

## 2. Google Photorealistic 3D Tiles(Map Tiles API)於 three.js

### 2.1 結論

- **技術上可行**:3DTilesRendererJS(NASA-AMMOS,Apache-2.0,最新 v0.5.3 / 2026-09-18)提供 `GoogleCloudAuthPlugin`(處理 API key、session token、逐 tile attribution 收集、可選 logo),`TilesRenderer.getAttributions()` 回傳彙整後的 attribution,**但畫面上的顯示要自己做**(推論,依 API 文件描述)。
- **API key 與計費**:須啟用計費並在所有請求附 API key 或 OAuth token。SKU 為 Enterprise「Map Tiles API: Photorealistic 3D Tiles」:每月前 1,000 次計費事件免費,0–100,000 區間每 1,000 次 US$6.00(更高量階遞減至 US$2.40)。官方 SKU 頁的計費事件寫 "Request that returns a 3D tile";用量頁寫每日上限 "Maximum 10,000 root tileset queries per day",且一個 root 請求可支撐 "at least three hours of tile requests"。**計費單位究竟只算 root 請求或每個 tile:官方文字未一致(not_stated)**,社群普遍理解為按 root 請求計。
  - **驗證方式(未執行,需 Cooper 同意建立計費專案後才能做)**:建立測試專案 → Cloud Console 設每日 quota 上限(例:50 次 root)→ 以 3DTilesRendererJS 實跑固定 N 次載入、每次漫遊 10 分鐘 → 隔日比對 Billing 報表的 SKU 事件數 = N 或 = tile 數。在驗證前,任何成本估算都不得寫入規劃書作為結論。
- **必須顯示的 attribution**:(1) Google Maps logo(高 16–19dp,留白規格見政策頁;空間不足時可用文字 "Google Maps");(2) 從每個 glTF tile 的 `asset.copyright` 收集資料來源,"You must aggregate, sort, and display in a line, all attributions",依出現次數排序,通常放畫面底部;(3) 第三方 renderer 的 logo 不得遮蓋 Google logo;(4) 混用自己的模型時,須讓使用者分得出哪部分來自 Google。
- **改變外觀/風格化**:以 shader 重新上色、卡通化:**not_stated**(Map Tiles API 政策與 Service Specific Terms 皆無條文)。GMP ToS §3.2.1(a) 有 "copy, modify, create a derivative work of" 的一般限制,是否涵蓋渲染端重新上色:not_stated。
- **抽取幾何:禁止**。政策頁「Geodata overlays」:自己的 3D 物件可疊在 3D Tiles 上,前提是物件 "aren't extracted, traced, or otherwise derived by hand or machine" 自 3D Tiles——**明文含「人工(by hand)」**。另「不得用於非視覺化用途」,列舉含 "Geodata extraction or resale"。
- **快取/離線:禁止**(除遵循 HTTP Cache-Control/ETag 標頭的正常瀏覽器快取)。政策頁列舉的禁止用途含 "Offline uses";Service Specific Terms 沒有 Map Tiles API 的快取許可條文,所以回到 GMP ToS §3.2.3(b) 不得快取。
- **涵蓋**:Google 覆蓋表中 Taiwan 的「Map Tiles 2D / 3D」欄為有;**台中市區是否有高解析攝影測量 mesh:not_stated**(覆蓋表只到國家層級,需實際載入確認)。

### 2.2 依據

| 項目 | 來源 |
|---|---|
| Map Tiles API Policies(快取、非視覺化用途、attribution、logo 規格、Geodata overlays、3D Tiles attribution) | https://developers.google.com/maps/documentation/tile/policies (Last updated 2026-10-08) |
| 必須用支援版權 attribution 的 renderer;root 請求 3 小時 | https://developers.google.com/maps/documentation/tile/3d-tiles |
| 自製 renderer 的 attribution 4 步驟(擷取、分號分隔、依次數排序、顯示) | https://developers.google.com/maps/documentation/tile/create-renderer |
| 需計費 + API key;配額(10,000 root/日、renderer 請求不限、12,000 QPM) | https://developers.google.com/maps/documentation/tile/usage-and-billing |
| SKU 計費事件、SKU ID C6E1-98B2-DBD0 | https://developers.google.com/maps/billing-and-pricing/sku-details |
| 價格表(Free Usage Cap 1,000;$6.00/$5.10/$4.20/$3.30/$2.40 per 1,000) | https://developers.google.com/maps/billing-and-pricing/pricing (Last updated 2026-10-08) |
| 國家覆蓋表(TW: Map Tiles 2D/3D 有) | https://developers.google.com/maps/coverage |
| GMP ToS §3.2.1(a)、§3.2.3(b) | https://cloud.google.com/maps-platform/terms |
| Service Specific Terms(無 Map Tiles API 專節;Last modified 2026-06-10) | https://cloud.google.com/maps-platform/terms/maps-service-terms |
| 3DTilesRendererJS README、`GoogleCloudAuthPlugin`、`getAttributions` | https://github.com/NASA-AMMOS/3DTilesRendererJS 、https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/core/plugins/API.md 、https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/core/renderer/API.md |

### 2.3 對本遊戲的影響

| 面向 | 個人非公開 | 公開發布 |
|---|---|---|
| 用途 | 可當「開發時對照參考」或背景遠景(需 key + 計費帳號) | 每位玩家載入都會產生 root 請求 → 成本隨玩家數線性成長(單位待驗證);API key 暴露在前端,需設 HTTP referrer 限制 |
| 與低多邊形風格 | 寫實 mesh 與 Q 版風格衝突;風格化 shader 無明文 | 同左;且混用自製模型時需在 UI 標示哪些來自 Google |
| 從 3D Tiles 描出建物做成自己的 GLB | **禁止**(含人工描繪) | **禁止** |
| 離線/打包進遊戲 | **禁止** | **禁止** |
| 目標族群若被認定「針對兒童」 | — | GMP §3.2.1(c)(vi) 禁止用於 COPPA 下針對兒童的服務(推論:可愛風格本身不等於針對兒童,但需注意定位) |

### 2.4 not_stated

- 計費事件究竟是 root 請求或每個 tile。
- shader 風格化/改色是否允許。
- 台中市區 3D mesh 實際品質與覆蓋範圍。

---

## 3. OpenStreetMap(ODbL 1.0)

### 3.1 結論

- **遊戲畫面 = Produced Work**(ODbL §1 定義:由資料庫實質部分產生的作品,例如影像、影音)。公開使用時須依 ODbL §4.3 附上告知;OSMF Attribution Guideline 的「Computer games and simulations」安全港:可放在**啟動 splash、遊戲畫面、遊玩中、credits 頁、選單**等位置,"attribution can be provided either by a splash screen on application startup";splash 上的文字須清楚可讀、停留夠久。
- **attribution 文字**:必須是 "OpenStreetMap",並讓人知道資料以 ODbL 提供——最簡做法是把「OpenStreetMap」連到 https://www.openstreetmap.org/copyright。可用「© OpenStreetMap contributors」;自行重繪風格時可寫「Map data from OpenStreetMap」。若初始 attribution 沒寫細節,須在合適位置(例如選單「資料授權」)提供詳細資訊與連結。
- **何時觸發 share-alike(§4.4)**:公開使用 **Derivative Database**(改寫、加工、或抽取/再利用實質部分到新資料庫)時,該衍生資料庫須以 ODbL(或相容授權)提供;且依 §4.4(c)/§4.6,**公開一個「由衍生資料庫產生的 Produced Work」也視為公開使用該衍生資料庫**,須向收到者提供整個衍生資料庫或「變更檔/演算法」的機器可讀版本,網路散布須免費。Produced Work 本身可用任何授權(§4.5(b))。
- **遊戲打包的處理後地圖資料(GLB/JSON)屬於哪種**:OSMF Produced Work 指引:成果若 "intended for the extraction of the original data, then it is a database"。推論:
  - 道路中心線 JSON、帶 OSM tag/名稱/座標的 JSON → **Derivative Database**(可直接抽回原始資料)。
  - 擠出(extrude)後的建物/道路 GLB → 介於兩者;因頂點座標可還原 footprint,保守視為 **Derivative Database**(推論,OSMF 指引無 3D/GLB 實例,not_stated)。
  - 執行時畫面、截圖、宣傳影片 → Produced Work。
- **混用其他資料**:OSMF Collective Database 指引——同一「資料類型」在同一地區「全部來自 OSM 或全部非 OSM」、且互不參照,即為 Collective Database,非 OSM 部分不受 share-alike;若用 OSM 補齊非 OSM 同類資料(例如政府建物不足處用 OSM 建物補),則會觸發 share-alike。
- **門檻**:OSMF Substantial 指引——少於 100 個 feature、或約 1,000 人口範圍內的一次性抽取屬「非實質」;台中市區遠超過此門檻(推論)。
- **ODbL 的「Publicly」**:指給「你自己或你控制之外的人」;只自己用不算公開。

### 3.2 依據

| 條文/指引 | 摘要 | 來源 |
|---|---|---|
| ODbL §1 定義 Derivative Database / Produced Work / Publicly / Substantial / Collective Database | 見上 | https://opendatacommons.org/licenses/odbl/1-0/ |
| ODbL §4.3 Notice for using output | 公開使用 Produced Work 時須附合理告知;範例文字 "Contains information from DATABASE NAME…" | 同上 |
| ODbL §4.4(a)(b)(c) Share alike | 公開使用的衍生資料庫須為 ODbL/相容授權;由衍生資料庫產生的 Produced Work 被公開即視為公開使用該資料庫 | 同上 |
| ODbL §4.5(a)(b)(c) | Collective Database 不須整體 ODbL;做 Produced Work 本身不構成衍生資料庫;組織內部使用非公開 | 同上 |
| ODbL §4.6 | 公開使用衍生資料庫或其 Produced Work 時,須提供整個衍生資料庫或變更檔/方法;網路散布免費 | 同上 |
| OSM Copyright 頁 | 兩件事:標示 OpenStreetMap、讓人知道是 ODbL;可連到 /copyright | https://www.openstreetmap.org/copyright |
| OSMF Attribution Guideline(2021-06-25 理事會通過;頁面 2026-09-10 編輯)「Attribution text」「Computer games and simulations」「Interactive maps」 | 見上 | https://osmfoundation.org/wiki/Licence/Attribution_Guidelines |
| OSMF Produced Work Guideline(2014-06-06) | 以「是否為了抽取原始資料」區分 | https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline |
| OSMF Collective Database Guideline(2016-06-17) | 同類資料全 OSM 或全非 OSM 才算獨立 | https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline |
| OSMF Horizontal Map Layers Guideline | 同 Feature Type 混用即觸發 share-alike | https://osmfoundation.org/wiki/Licence/Community_Guidelines/Horizontal_Map_Layers_-_Guideline |
| OSMF Substantial Guideline | <100 features 等為非實質 | https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline |
| OSMF Licence FAQ §1.7、§1.7.1 | Produced Work 收到者可要求取得使用的資料與衍生資料庫;未修改可直接指回 openstreetmap.org | https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ |

### 3.3 對本遊戲的影響

| 面向 | 個人非公開 | 公開發布 |
|---|---|---|
| attribution | 不需要(非 Publicly;Attribution Guideline 明言只在 Produced Work 公開使用時需要) | 必須:splash 或選單/credits 放「© OpenStreetMap contributors」+ 連到 openstreetmap.org/copyright;遊戲內「資料授權」頁寫細節 |
| 打包的 GLB/JSON | 無義務 | 視為 Derivative Database → 須以 ODbL 授權該資料檔,並在網站/遊戲內提供下載(或提供「OSM extract 日期 + 轉換腳本」作為 §4.6(b) 的變更方法,推論) |
| 遊戲程式碼、美術、音效 | 無義務 | 不受 ODbL 影響(Produced Work 可任意授權;推論:程式碼不是資料庫內容) |
| 自製資料(手調的道路寬度、地標位置) | 無義務 | 若與 OSM 同類資料混在同一資料檔 → 會被 share-alike;若獨立成另一類資料、不參照 OSM 元素 → 可不公開(依 Collective Database 指引) |
| 注意 | 「非公開」= 只有自己用;分享給朋友即屬 Publicly(推論,依定義) | — |

### 3.4 not_stated

- OSMF 對「3D 模型/GLB/遊戲資產」屬 Produced Work 或資料庫,無明文實例。
- 公開發布時 ODbL 下載點的最低形式(網頁連結即可?):指引只說須「offer」機器可讀版本,具體形式 not_stated。

---

## 4. 台灣政府開放資料

### 4.1 逐項結論

| 資料 | 開放下載? | 涵蓋台中市區? | 格式 | 座標系 | 授權 | 入口 |
|---|---|---|---|---|---|---|
| **國土測繪中心 全國三維建物模型**(LOD1 近似化建物,部分分棟精進) | **否(非開放資料)**。平臺公告:三維建物圖資「收費供應機制上線」,實體圖資下載僅提供「測試用圖資」;114 年成果「歡迎各界申購」。另有免申請的 OGC I3S / 3D Tiles **介接服務**(台中服務代碼 `1`:`https://3dtiles.nlsc.gov.tw/building/tiles3d/1/tileset.json`) | 是(111 年成果分布圖含臺中市) | 實體:KMZ、I3S、3D Tiles(111 年說明);服務:OGC I3S、3D Tiles | 服務發布時以 20m DEM 做地形貼合(絕對高程);平面座標系 not_stated | **未適用政府資料開放授權條款**;介接服務適用平臺「服務使用條款」:第五點「本服務是不可移轉的…」、第六點不得移除版權聲明;是否允許用於遊戲/散布:**not_stated**。平臺上 22 個「知名地標 LOD3 模型」為**民間數位授權、僅供本平臺展示** | https://3dmaps.nlsc.gov.tw |
| **臺中市 3D 城市模型** | 部分:data.gov.tw 僅見 2 筆無人機實景模型(帝國糖廠、大里區),非全市城市模型 | 否(僅單點/大里區) | 3MX/OBJ(ContextCapture),連結至 Google Drive | TWD97 | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/176024 、https://data.gov.tw/dataset/176023 |
| **臺中市建物圖(113 年版,至戶切割)**(2D 建物輪廓,非 3D) | 是 | 是(113 年為 19 個行政區) | SHP(CSV 索引內附 Google Drive 下載連結) | 屬性/高度/樓層欄位:not_stated(需下載 SHP 檢查) | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/152106 |
| **內政部 20m 網格 DTM/DSM**(2026 年版) | 是 | 是(有「分幅_臺中市20MDEM(2026)」) | ZIP(CSV 索引連到 TGOS 下載);每點記錄平面坐標與高程 | 「TWD97(N、E、H)」;推論為 TM2 121 分帶 = EPSG:3826 | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/178729 (DTM)、https://data.gov.tw/dataset/178728 (DSM) |
| **5m DEM** | **未見於 data.gov.tw**(關鍵字「5公尺網格」「DEM」「DTM」查詢只有 20m、100m);其他取得管道 not_stated(推論:需向主管機關申購) | not_stated | not_stated | not_stated | not_stated | — |
| **臺中市道路中心線(111 年版)** | 是 | 原臺中市 | SHP / JSON / XML | TWD97 | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/162898 |
| **臺中市各類道路圖(114 年成果,千分之一)** | 是 | 是 | SHP(道路面、中心線、特殊道路面、交叉點、道路代碼) | not_stated(推論 TWD97) | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/177459 、https://data.gov.tw/dataset/162899 |
| **臺中市道路寬度**(含路名、速限、路寬、起訖點) | 是(**已實際下載驗證**:129,871 列,涵蓋全市 29 區,中區~西屯區等 7 個市中心區有 1,365 個不重複路名,含臺灣大道一~三段、市政北二路、惠來路二段) | 是 | CSV | 欄位名「TM2度分帶97X/Y坐標」;以 `tools/research/twd97_to_wgs84.py --selftest` 換算抽樣點落在北區(24.16N, 120.69E)→ 確認為 EPSG:3826 | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/83822 |
| **臺灣通用電子地圖**(國土測繪中心) | 是(圖磚封裝檔、MBTiles、WMTS) | 是 | 圖磚(影像,非向量) | not_stated | 政府資料開放授權條款第 1 版 | https://data.gov.tw/dataset/24888 、https://data.gov.tw/dataset/33384 |
| **TGOS**(內政地理資訊圖資雲整合服務平台) | 是「平台」,不是單一資料集;20m DEM 檔即放在 TGOS 下載。網站「政府網站資料開放宣告」:網站刊載資料以無償、非專屬、可再授權方式提供,須註明出處;各流通產品另有取用條件(not_stated,需逐項查) | — | — | — | 網站宣告(見左);TGOS MAP API Lite 在 data.gov.tw 標示政府資料開放授權條款第 1 版 | https://www.tgos.tw/tgos/Announce 、https://data.gov.tw/dataset/31960 |

### 4.2 授權條款:政府資料開放授權條款-第 1 版(104-07-27 訂定)

- **授權範圍(第二點)**:不限目的、時間及地域、非專屬、不可撤回、免授權金;可重製、散布、公開傳輸、改作、開發衍生物;**使用者得再轉授權他人**;**不含專利權及商標權**。
- **義務(第三點)**:利用開放資料及其衍生物,須依附件「顯名聲明」標示原提供機關;「未盡顯名標示義務者,視為自始未取得開放資料之授權」。
- **相容性(第四點(二))**:與 CC BY 4.0 相容;依 CC BY 4.0 方式利用視為符合本條款。
- **顯名聲明格式(附件)**:「提供機關/單位 [年份] [開放資料釋出名稱與版本號]」+ 依政府資料開放授權條款釋出 + https://data.gov.tw/license。
- 推論:因第二點(二)允許再轉授權,政府開放資料可放進以 ODbL 授權的遊戲資料檔;但若與 OSM 同類資料混用,政府資料也會被 ODbL share-alike 涵蓋(見第 3 題)。
- 來源:https://data.gov.tw/license

### 4.3 對本遊戲的影響

| 面向 | 個人非公開 | 公開發布 |
|---|---|---|
| 臺中市道路寬度/道路圖/建物圖、20m DTM | 可自由使用 | 可使用;遊戲內 credits/資料授權頁須放顯名聲明(每個資料集一條) |
| 國土測繪中心 3D 建物 3D Tiles 介接 | 服務條款未明示可否用於遊戲(not_stated);技術上可在 three.js 載入 | **不建議**在授權未確認前使用或打包;實體資料須申購且授權條件 not_stated |
| 平臺上的知名地標 LOD3 模型 | 不可取用(民間授權僅限平臺展示) | 同左 |
| 無人機實景模型(帝國糖廠) | 可用,但寫實風格不符 | 可用(顯名) |

### 4.4 not_stated

- 國土測繪中心三維建物模型的收費標準、申購後的使用/再散布條件。
- 臺中市建物圖 SHP 是否含樓層數/高度(決定能否直接擠出建物高度)。
- 5m DEM 是否有開放管道。
- 道路圖 114 年版、通用電子地圖的座標系明文。

---

## 5. 智慧財產(**非法律意見**)

### 5.a 「MINI Cooper」名稱與可辨識車型外觀

**公開資訊**
- BMW Group 網站法律聲明:網站上的商標受 BMW AG 商標權保護,範圍 "including marks, model names, logos, and emblems";並聲明網站未授予任何智財使用 "no license to use the intellectual property"。來源:https://www.bmwgroup.com/en/general/legal-disclaimer.html
- 「MINI」「Cooper」在台灣的註冊號、MINI 車身 3D 立體商標、台灣設計專利:**not_stated**(未查 TIPO 商標/專利檢索系統;建議公開發布前由 Cooper 決定是否查證)。
- 商標法 §5(使用以「為行銷之目的」為要件)、§36(合理使用)、§68(侵權)、§70(著名商標減損,不以同類商品為限)。全文:

> **商標法第 5 條**:商標之使用,指為行銷之目的,而有下列情形之一,並足以使相關消費者認識其為商標:一、將商標用於商品或其包裝容器。二、持有、陳列、販賣、輸出或輸入前款之商品。三、將商標用於與提供服務有關之物品。四、將商標用於與商品或服務有關之商業文書或廣告。前項各款情形,以數位影音、電子媒體、網路或其他媒介物方式為之者,亦同。
> 來源:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070001&flno=5 (商標法 112-05-24 修正)

> **商標法第 70 條**:未得商標權人同意,有下列情形之一,視為侵害商標權:一、明知為他人著名之註冊商標,而使用相同或近似之商標,有致減損該商標之識別性或信譽之虞者。二、明知為他人著名之註冊商標,而以該著名商標中之文字作為自己公司、商號、團體、網域或其他表彰營業主體之名稱,有致相關消費者混淆誤認之虞或減損該商標之識別性或信譽之虞者。
> 來源:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070001&flno=70

- 商標法 §36、§68:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070001&flno=36 、https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070001&flno=68
- 公平交易法 §22:禁止以著名之他人商品「外觀或其他顯示他人商品之表徵」為相同或近似使用致混淆(已註冊商標者除外)。https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0150002&flno=22
- 專利法 §136:設計專利權人專有排除他人實施該設計或近似設計之權。https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070007&flno=136 ;遊戲中的數位車模是否構成對「車輛」設計的實施:not_stated。
- 國外參考(非台灣法):美國 AM General v. Activision(Humvee 出現在《決勝時刻》)一審於 2020 年以 Rogers test 判遊戲方勝訴(二手整理:https://moellerip.com/the-moeller-blog/trademark-infringement-am-general-vs-activision-blizzard/ ;被告簡易判決聲請狀:https://archive.org/download/6129463-Activision-Humvee/6129463-Activision-Humvee.pdf )。但美國最高法院 2023-06-08 Jack Daniel's v. VIP 判決限縮 Rogers test:被告把他人商標當作自己的來源標識時不適用 Rogers(https://www.supremecourt.gov/opinions/22pdf/22-148_3e04.pdf )。台灣法沒有 Rogers test 的對應明文(推論)。

| 情境 | 個人非公開 | 公開發布 |
|---|---|---|
| 用「MINI Cooper」名稱 + MINI logo + 寫實外觀 | 推論:不在市場行銷,較難構成商標法 §5 的「使用」,風險低 | 推論:遊戲標題/宣傳使用「MINI」名稱屬行銷用途,MINI 若為著名商標還有 §70 減損風險;**常見做法是取得原廠授權或不用** |
| 致敬造型(圓燈、短車身、雙色車頂)但不用名稱與 logo、改水箱罩與燈形 | 低 | 推論:業界常見替代做法;仍需避免外觀「足以混淆」(公平法 §22 的「表徵」) |
| 標題寫「開 MINI 在台中兜風」 | 低 | 推論:標題是最明顯的商標使用位置,建議改用自創車名 |

### 5.b 真實建築外觀:著作權法第 58 條

> **著作權法第 58 條**:於街道、公園、建築物之外壁或其他向公眾開放之戶外場所長期展示之美術著作或建築著作,除下列情形外,得以任何方法利用之︰一、以建築方式重製建築物。二、以雕塑方式重製雕塑物。三、為於本條規定之場所長期展示目的所為之重製。四、專門以販賣美術著作重製物為目的所為之重製。
> 來源:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070017&flno=58 (著作權法 111-06-15 修正)

> **著作權法第 64 條**:依第四十四條至第四十七條、第四十八條之一至第五十條、第五十二條、第五十三條、第五十五條、第五十七條、第五十八條、第六十條至第六十三條規定利用他人著作者,應明示其出處。前項明示出處,就著作人之姓名或名稱,除不具名著作或著作人不明者外,應以合理之方式為之。
> 來源:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070017&flno=64

- 著作權法 §65(合理使用四款判斷基準)亦適用:https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070017&flno=65
- 推論:遊戲中以低多邊形模型重現建築外觀,不屬於 §58 四款例外(非「以建築方式」重製),落在「得以任何方法利用」範圍;但依 §64 須**明示出處**(例如 credits 列「國家歌劇院/建築設計:伊東豊雄」——人名為示例,實際須逐棟查證)。
- 只涵蓋「戶外長期展示」部分;室內、臨時裝置不在內(推論,依條文文字)。
- 智慧財產局針對「遊戲/3D 建模」適用 §58 的函釋:**not_stated**(未查到)。

| 情境 | 個人非公開 | 公開發布 |
|---|---|---|
| 地標建築風格化建模 | 低風險 | 依 §58 推論可利用;**credits 明示建物名稱與建築師** |
| 建物上的招牌/logo | 見 5.c(商標問題,§58 只處理著作權) | 見 5.c |

### 5.c 商場名稱與 logo(例:新光三越、大遠百)

- 「新光三越」「大遠百/遠東百貨」商標註冊狀態:**not_stated**(未查 TIPO)。
- 依法條推論:商標法 §68 侵權以「同一或類似商品/服務」為要件,遊戲與百貨零售不同類;但若為著名商標,§70 的減損條款不以類似商品為限;公平法 §22 處理表徵混淆。§36(一) 允許以誠實方法「表示…說明」而非作為商標使用,例如地名指示(推論,遊戲中標示「這裡是某百貨」是否屬之:not_stated)。
- 商標授權範圍不在政府資料開放授權條款內(該條款第二點(四)明文排除商標權),所以即使店名來自政府開放資料,也不代表可用其 logo。
- 常見處理方式(推論,業界慣例,未找到台灣主管機關明文):
  1. 改為虛構或諧音名稱、改 logo(例:GTA 系列式的戲仿品牌)。
  2. 只用通稱(「百貨公司」「購物中心」)+ 保留建築量體輪廓。
  3. 取得品牌授權(置入合作)。
  4. 個人非公開版可保留真名;公開版切換到 1 或 2(建議做成資料層開關)。

| 情境 | 個人非公開 | 公開發布 |
|---|---|---|
| 真實店名 + 真實 logo | 推論:非行銷用途,低風險 | 推論:有 §70 減損/公平法 §22 疑慮;建議改虛構或通稱,或取得授權 |
| 真實店名、不用 logo | 低 | 中(推論);not_stated |
| 虛構名稱、保留建築輪廓 | 低 | 低(推論) |

### 5.d not_stated

- MINI、新光三越、大遠百在台灣的商標註冊號與是否被認定為著名商標。
- MINI 車身是否在台灣有立體商標或有效設計專利。
- 智慧財產局對遊戲建模適用 §58 的函釋。
- 台灣法院對「電玩遊戲中出現真實商標」的判決。

---

## 6. 字型:jf open 粉圓(jf open huninn)

### 6.1 結論

- **授權**:SIL Open Font License 1.1(OFL-1.1)。LICENSE 檔版權聲明:漢字部分衍生自 MOTOYA 的 Kosugi Maru(Apache-2.0),拉丁字母來自 Varela Round;保留字型名稱(Reserved Font Names)為 **'open huninn' 與 'huninn'**(Varela Round 另保留 'Varela' 與 'Varela Round')。最新版 v2.1(2024-09-19)。
- **可否嵌入網頁遊戲並隨遊戲散布:可以**,含商業發布。OFL 條件 2:"may be bundled, redistributed and/or sold with any software";OFL FAQ 1.4 明列 "games and entertainment software"。唯一限制是字型本身不得單獨販售(條件 1)。
- **須附的聲明**:隨每份拷貝附上**版權聲明 + OFL 授權全文**(可為獨立文字檔,或放在字型檔 metadata 中)。最簡做法:遊戲發布目錄放 `fonts/jf-openhuninn/OFL.txt`(直接複製上游 LICENSE),credits 列「字型:jf open 粉圓(justfont),SIL Open Font License 1.1」。
  - 注意:上游 README 寫 "with no requirement to notify or credit us"(不需通知或標名 justfont),但 OFL 條件 2 仍要求**隨字型附版權聲明與授權文字**——兩者不衝突:不必在畫面上致謝,但檔案要附授權。
- **子集化(subsetting)= 修改版**:OFL FAQ 2.6 "Is subsetting a webfont considered modification? Yes." 中文字型完整檔很大,網頁遊戲通常會子集化;子集後的字型**不得以「open huninn / huninn」作為主要字型名稱**(條件 3),須改名(例:`TaichungDriveRound`),並仍以 OFL 釋出該子集檔(條件 5)。
- **嵌入文件例外**:OFL FAQ 1.11–1.12 允許把字型(全部或子集)「嵌入文件」而不受修改/再散布限制;遊戲把字形烘焙成貼圖(MSDF atlas)是否算「文件嵌入」:not_stated(推論:保守起見仍附 OFL.txt 並改名)。

### 6.2 依據

| 項目 | 來源 |
|---|---|
| README(OFL 1.1、可商用、不得單獨販售、衍生須 OFL) | https://github.com/justfont/open-huninn-font/blob/master/README.md |
| LICENSE(版權聲明、Reserved Font Names、OFL 全文) | https://github.com/justfont/open-huninn-font/blob/master/LICENSE |
| 官方介紹頁 | https://justfont.com/huninn/ (本次未讀取內容,僅列入口) |
| OFL FAQ 1.4、1.10–1.12、2.6 | https://openfontlicense.org/ofl-faq/ |

### 6.3 對本遊戲的影響

| 面向 | 個人非公開 | 公開發布 |
|---|---|---|
| 原檔直接載入 | 可 | 可;附 OFL.txt |
| 子集化 webfont | 可(未散布無義務) | 可;**改字型名稱** + 附 OFL.txt + 保留原版權聲明 |
| 烘成 MSDF/貼圖 | 可 | 推論可;保守附 OFL.txt |

### 6.4 not_stated

- 字形烘焙成貼圖是否屬 OFL「文件嵌入」。

---

## 7. 對地圖資料管線的建議

> 以下是給 Cooper 拍板的選項與建議,不是決定。

### 7.1 建議主線(公開發布也安全的路徑)

1. **道路幾何與路名**:以 OSM(ODbL)或「臺中市道路寬度 + 臺中市道路圖 114 年版」(政府開放資料)為主。後者已實測含路名、路寬、速限、TM2 坐標,**路寬是 OSM 常缺的欄位**,對生成道路寬度很有價值。
   - 建議:同一類資料只取一個來源(道路全用政府或全用 OSM),依 OSMF Collective Database 指引可避免政府資料被 ODbL share-alike 綁住;若要互補(例如 OSM 道路 + 政府路寬參照到 OSM way),則整份道路資料要以 ODbL 公開。
2. **建物**:OSM building footprint 或「臺中市建物圖 113 年版」(需先下載確認是否有樓層/高度欄位)→ 程式擠出低多邊形量體。**不要**使用國土測繪中心 3D 建物(收費、授權未明)與平臺上的地標 LOD3 模型。
3. **地形**:20m DTM(臺中市分幅,開放授權)。台中市區平坦,足夠遊戲用。
4. **地標建築外觀**:人工以基本幾何「風格化致敬」;**參考資料用自己拍的照片或開放授權照片**(例:維基共享資源上授權相容者),避免以 Google 街景/衛星作為建模依據——Google 條款雖未明文處理「僅目視參考」,但對街景與 Earth 的「描繪/重建 3D」有明文禁止,以自有照片可完全避開這個灰色地帶。
5. **Google 產品**:**不進入資料管線**。3D Tiles 只考慮作為開發期對照工具(需計費帳號),不打包、不描繪、不在公開版使用。
6. **商標層**:車名、店名、logo 做成「資料層開關」:個人版可用真名,公開版切換成虛構名/通稱。
7. **座標**:政府資料統一由 EPSG:3826 轉換(`tools/research/twd97_to_wgs84.py` 可抽查),OSM 為 WGS84;管線內統一投影到以台中火車站附近為原點的局部公尺座標(推論,技術選型屬可逆決定)。

### 7.2 公開發布時必做清單(checklist)

- [ ] 啟動 splash 或主選單:`© OpenStreetMap contributors`,連結 https://www.openstreetmap.org/copyright
- [ ] 「資料授權」頁:OSM(ODbL)+ 每個政府資料集的顯名聲明(機關、年份、資料集名稱與版本、政府資料開放授權條款連結)
- [ ] 提供遊戲內 OSM 衍生資料檔(GLB/JSON)的 ODbL 下載點,或 OSM extract 日期 + 轉換腳本
- [ ] credits 列出依著作權法 §58 利用的地標建築名稱與建築師(§64 明示出處)
- [ ] `OFL.txt` 隨字型散布;子集化字型改名
- [ ] 車名/店名/logo 切換為公開版(虛構或通稱)
- [ ] 確認遊戲未包含任何來自 Google Maps/Earth/街景/3D Tiles 的幾何、座標、商家名稱

### 7.3 待 Cooper 拍板

1. 公開或不公開(決定第 3、5 題義務是否觸發)。
2. 道路/建物用 OSM 還是政府資料為主(影響 share-alike 範圍)。
3. 公開版車名與商場名稱的處理方式(虛構/通稱/洽授權)。
4. 是否需要律師就第 1 題「目視參考」與第 5 題商標問題出具意見。
5. 是否同意建立 Google 計費測試專案以驗證 3D Tiles 計費單位(只在決定使用 3D Tiles 時才需要)。

---

## 附錄 A:本次調查的重做方法

- Google 條款頁面以 `curl` 下載後用 `pandoc -t plain` 轉純文字再 grep(WebFetch 會因頁面過長截斷)。
- data.gov.tw 搜尋:`POST https://data.gov.tw/api/front/dataset/list`,body `{"bool":[{"fulltext":{"value":"關鍵字"}}],"filter":[],"page_num":1,"page_limit":20,"tids":[],"sort":"_score_desc"}`;單一資料集詮釋資料:`GET https://data.gov.tw/api/v2/rest/dataset/{id}`。
- 國土測繪中心多維度平臺為前端動態載入,服務使用條款與介接說明需用瀏覽器開啟 https://3dmaps.nlsc.gov.tw/NLSC/Entrance 點選選單讀取。
- 臺中市道路寬度實測:下載 https://data.gov.tw/dataset/83822 的 CSV,以 Python csv 模組統計「地區」欄與路名;座標抽查:`python3 tools/research/twd97_to_wgs84.py --selftest`。
