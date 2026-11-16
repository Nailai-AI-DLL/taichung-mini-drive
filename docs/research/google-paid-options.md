# Google 付費/企業方案能否提供「建物高度、車道配置」參考資料

- 版本:v0.1
- 查證日期:**2026-11-15**(所有網址皆於此日查閱;頁面自載日期另註)
- 範圍:台中車站↔七期(約 lat 24.130–24.175、lon 120.630–120.695)
- 方法:只讀 Google 公開說明頁、價目頁、條款頁;未登入、未建帳號、未呼叫任何 API、未下載任何資料。
- 標記:`not_stated` = 官方頁查不到;`推論` = 本文推論,非原文。英文引文每處 ≤ 15 字,其餘為轉述。
- **所有條款解讀皆非法律意見。**
- 前置:已讀 `docs/decisions/0001-map-data-source.md` 與 `docs/research/data-licensing.md` §1–§2,不重複列出 GMP ToS 一般條款與 3D Tiles 政策細節。

---

## 1. 摘要表

| # | 方案 | 提供什麼(與本需求有關) | 涵蓋台灣/台中? | 價格 | 條款允許「人工參考後自建模、公開於遊戲」? | 官方網址 |
|---|---|---|---|---|---|---|
| 1a | **Google Earth Professional Advanced**(Google Earth 新付費方案) | 「Building footprints」圖層:2D 建物輪廓,**並附建物高度**;來源 Google Maps | 表列 **Global**;台中實際有無高度值 not_stated | US$150/使用者/月(Professional US$75、Standard 免費) | **否(推論)**:Service Terms §8.2 禁止下載、匯出、**複製**圖層;GMP ToS §3.2.3(c) 禁止以 Google 內容建立內容。「只看不抄」無明文 → not_stated | developers.google.com/maps/documentation/earth/available-data-layers 、/earth-plans |
| 1b | Google Earth Pro(桌面版)/ Google Earth 網頁版免費層 | 3D 影像、可目視;無高度/樓層欄位 | 有影像 | 免費 | **否**:Geo Guidelines 禁止以 Earth 重建 3D 模型;Earth 附加條款 §2 禁複製、建替代資料集 | about.google/brand-resource-center/products-and-services/geo-guidelines/ |
| 1c | Google Earth Enterprise | 只是自架伺服器,**不含 Google 資料**;2023-01-09 已封存 | — | 開源 Apache-2.0 | 不適用 | github.com/google/earthenterprise |
| 2a | Earth Engine 商用授權 | 平台本身不附台灣建物高度;Google 自家建物資料集不涵蓋台灣(見 2b) | 平台全球 | Basic US$500/月、Professional US$2,000/月、Premium 報價 + EECU 用量 | 平台條款 §4.4:各資料集依自己授權 | cloud.google.com/earth-engine/pricing |
| 2b | Open Buildings v3 / 2.5D Temporal(GEE 目錄) | v3:輪廓,無高度;Temporal:`building_height` 0–100 m 柵格(4 m 有效解析度) | **否**:只列非洲、南亞、東南亞、拉美加勒比 | 資料免費 | 授權本身允許(CC BY 4.0 或 ODbL 擇一),**但台灣無資料** | developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1 |
| 3a | Photorealistic 3D Tiles(Map Tiles API) | 寫實 3D mesh(視覺上看得出高度) | 國家表 TW 有;台中品質 not_stated | 按量計費(見 data-licensing §2) | **否**:政策明文不得「by hand or machine」抽取/描繪;禁離線 | developers.google.com/maps/documentation/tile/policies |
| 3b | Aerial View API | 預錄空拍影片 | **否**:僅美國地址 | 按量 | 不適用 | developers.google.com/maps/documentation/aerial-view/overview |
| 3c | Solar API(Building Insights) | 屋頂面「海拔高度」(`planeHeightAtCenterMeters`),**無建物總高、無樓層** | Taiwan 覆蓋 not_stated(覆蓋頁只有互動地圖) | 按量 | **否**:Service Terms §20.1 限用於能源系統可行性/設計/提案 | developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest |
| 3d | Roads API | 吸附道路、速限;**無車道** | 有(Navigation 覆蓋表 TW 速限欄為 ---) | 按量 | 否:§17 不得與非 Google 地圖並用;只可快取座標 30 天 | cloud.google.com/maps-platform/terms/maps-service-terms §17 |
| 3e | Places API / Routes API | 無建物高度、無車道配置欄位(推論,依產品說明;未逐欄查證) | — | 按量 | 否:§3.2.3(a)(c) | cloud.google.com/maps-platform/terms |
| 3f | Navigation SDK 車道指引 | 下個轉彎處各車道 `Lane`/`LaneDirection`(`laneShape`、`isRecommended`) | Navigation 覆蓋表 TW 有行車導航;**車道指引在台灣是否提供 not_stated**(表無此欄) | 按量;是否限特定客戶:中文頁片段稱「僅供特定客戶」,英文 overview 未寫 → not_stated | **否**:§12.2 不得與非 Google 地圖並用、§12.3 只可快取座標 30 天、ToS §3.2.3(a)(c) | developers.google.com/maps/documentation/navigation/android-sdk/tbt-feed |
| 4a | Roads Management Insights(Analytics) | 近即時車速、旅行時間;**無車道** | 限「自己管轄的路網」 | 未查到公開價 | **否**:限公部門/基礎設施管理者,用途限道路安全與管理 | developers.google.com/maps/documentation/roads-management-insights/guidelines |
| 4b | Street View Insights(Analytics,BigQuery) | 電桿、路牌等設施位置;**無車道、無建物高度** | 稱 110+ 國;台灣 not_stated | not_stated | 推論:用途為基礎設施管理,不符遊戲用途 | developers.google.com/maps/documentation/imagery-insights |
| 4c | 「Google 地圖資料授權/買斷」 | **查無**此類公開方案 | — | — | not_stated | — |

**一句話:沒有任何 Google 付費方案能合法提供台中建物高度或車道配置給我們「參考後自建模並公開」。** 唯一真的有「建物高度」欄位且標 Global 的是 Google Earth Professional Advanced,但條款明文禁止複製其圖層。

---

## 2. 細節

### 2.1 Google Earth 付費方案(Standard / Professional / Professional Advanced)

- 方案與價格(earth-plans 頁):Standard US$0、Professional US$75、Professional Advanced US$150,皆「每使用者每月」,以 Cloud Billing 計費;頁面另述 2025-10-01 起依 Cloud Billing 週期。
  - 網址:https://developers.google.com/maps/documentation/earth/earth-plans
- 資料圖層(available-data-layers,頁面 Last updated 2026-11-10):
  - **Building footprints**:2D 輪廓,原文「Building height is also available.」;來源欄「Google Maps」;方案欄「Professional Advanced」;覆蓋欄「Global」。資料彙整自影像演算法偵測、人工繪製、第三方資料。
  - 道路類圖層:Speed limit signs、Stop signs、Traffic lights,皆 Professional Advanced、**僅 United States**。全頁無「lane」字樣 → 車道配置:**無**。
  - 網址:https://developers.google.com/maps/documentation/earth/available-data-layers
- 台灣可否購買 Earth 付費方案:not_stated(頁面無國家限制說明)。
- 台中範圍的 Building footprints 是否真有高度值、精度:not_stated(需登入實看,本次禁止)。
- 適用條款:Earth 方案受 Google Maps Platform 條款管轄;Service Specific Terms(頁面 Last modified 2026-10-28)第 8 節「Google Earth」:
  - **§8.2 Data Layers**:圖層可存入專案,但客戶「will not … download, export or copy Data layers」。
  - **§8.4.1**:Ask Google Earth 產出同樣不得下載、匯出、複製。
  - **§8.1.4 Customer Data**:由服務衍生、經「substantially transformed」到無法辨識源自 Google、無法還原、不能替代 Google 內容的資料,算客戶資料。
  - **§8.3.1**:用設計功能做的設計若屬 Customer Data,可下載為 KMZ/PNG。
  - GMP ToS §3.2.3(c)(頁面 Last modified 2026-08-26):「will not create content based on Google Maps Content」。
  - 網址:https://cloud.google.com/maps-platform/terms/maps-service-terms 、https://cloud.google.com/maps-platform/terms
- 解讀(**非法律意見**,推論):
  - 把台中每棟樓的高度逐棟抄進我們的 overrides,屬「copy Data layers」與「create content based on Google Maps Content」,條款禁止。
  - §8.1.4 的「substantially transformed」理論上可能涵蓋「看過後大幅風格化」的成果,但條文沒定義門檻,也沒處理它與 §8.2、§3.2.3(c) 衝突時何者優先 → **not_stated**。「逐棟記下高度再轉成樓層」很難說是 substantially transformed(推論)。

### 2.2 Google Earth Pro / 免費 Google Earth / Earth Enterprise

- Earth Pro 與網頁版免費層:無高度/樓層欄位可讀;Geo Guidelines(Google Earth「Web and apps」)禁止用 Earth 輸出「to reconstruct 3D models or create similar content」;Earth 附加條款 §2.1–2.4 禁止複製、大量下載、建立替代資料集(詳見 data-licensing.md §1.2)。
  - 網址:https://about.google/brand-resource-center/products-and-services/geo-guidelines/ 、https://maps.google.com/help/terms_maps-earth/
- Earth Pro 桌面版是否將停止下載:只有第三方日本部落格說 2027-06-25,官方 release notes 未提 → not_stated。
- Google Earth Enterprise:GitHub repo 於 2023-01-09 封存;README 明言不提供 Google 影像的私有版本,只是讓你架自己的資料。→ 與需求無關。
  - 網址:https://github.com/google/earthenterprise

### 2.3 Google Earth Engine(商用)與 Open Buildings

- 商用價格(earth-engine/pricing):Limited(純用量)、Basic 月費 US$500、Professional 月費 US$2,000、Premium 報價;另計 EECU,隨需 US$0.40/EECU-hr 並有量折。
  - 網址:https://cloud.google.com/earth-engine/pricing
- 非商用條款(earthengine.google.com/terms,頁面 Last updated 2022-09-29):§2.1(c) 只限非商業或政府研究;§4.4 第三方資料集依其自身授權、衝突時以該授權為準;§4.2 Google Maps 內容受 Maps/Earth 附加條款拘束。
  - 網址:https://earthengine.google.com/terms/
- **Open Buildings v3 polygons**:覆蓋「Africa, Latin America, Caribbean, South Asia and Southeast Asia」;只有幾何、面積、信心值,無高度;授權 CC BY 4.0(GEE 頁)。
  - https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings_v3_polygons
- **Open Buildings 2.5D Temporal v1**:`building_height` 0–100 m(相對地面)、0.5 m 像素(有效 4 m)、Sentinel-2 推估、2016–2023 年;覆蓋同上(非洲、南亞、東南亞、拉美加勒比);授權 CC BY 4.0 或 ODbL 1.0「pick which」。
  - https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1
- 台灣是否涵蓋:**否**(兩頁區域列表皆不含東亞;推論:台灣不屬「東南亞」定義)。
- 若日後 Google 擴充到台灣:授權本身允許衍生與公開(CC BY 需標示;ODbL 有分享相同方式義務,與現行 OSM ODbL 相容 —推論)。
- 附記(非 Google 資料):GEE 目錄另有 JRC GHSL 等全球建物高度柵格,屬第三方資料,不在本題範圍,未查證。

### 2.4 Google Maps Platform 各 API

| API | 有無建物高度 | 有無車道 | 台灣 | 關鍵條款 | 網址 |
|---|---|---|---|---|---|
| Photorealistic 3D Tiles | 只有寫實 mesh,無欄位 | 無 | 國家表 TW 有(data-licensing §2) | 政策:不得「extracted, traced, or otherwise derived by hand or machine」;非視覺化用途含「Offline uses」皆不允許 | https://developers.google.com/maps/documentation/tile/policies |
| Aerial View API | 影片 | 無 | **否**,「only supports postal addresses in the United States」 | — | https://developers.google.com/maps/documentation/aerial-view/overview |
| Solar API | `planeHeightAtCenterMeters` = 屋頂面中心點**海拔**,`boundingBox` 只有經緯度;無建物總高、無樓層 | 無 | 覆蓋頁只有互動地圖與 GeoJSON,文字無國家清單 → not_stated(搜尋摘要稱 release notes 曾列 Taiwan 為 BASE 品質,未能直接讀到原文) | §20.1 只能用於能源系統可行性、設計、或 Downstream Transaction;§20.2 快取 30 天;政策頁重申 §3.2.3(c) | https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest 、https://developers.google.com/maps/documentation/solar/policies 、https://developers.google.com/maps/documentation/solar/coverage |
| Roads API | 無 | 無(速限;台灣速限欄 ---) | 有 | §17.2 不得與非 Google 地圖並用;§17.3 座標快取 30 天 | Service Terms §17 |
| Places / Routes API | 無(推論,未逐欄查) | 無車道配置(推論) | 有 | ToS §3.2.3(a)(iii) 禁複製商家名稱地址 | https://cloud.google.com/maps-platform/terms |
| Navigation SDK | 無 | **有**:`StepInfo` 內 `Lane`/`LaneDirection`(`laneShape` 如 STRAIGHT、SLIGHT_LEFT;`isRecommended`),只描述導航中下一步驟的車道 | 覆蓋表 TW:Traffic、Driving、Walking、Two-wheeled、Biking 皆 ⬤;Speed Limits、Traffic Lights 為 ---;**無車道指引欄** → 台灣車道資料 not_stated | §12.2「must not use … in conjunction with a non-Google map」;§12.3 只能快取座標 30 天;ToS §3.2.3(a) 不得 export/extract | https://developers.google.com/maps/documentation/navigation/android-sdk/tbt-feed 、https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk |

解讀(**非法律意見**,推論):Navigation SDK 的車道資料只在「實際導航時」逐路口吐出,要拿來建全區車道表,勢必要大量呼叫並儲存 → 違反 §3.2.3(a)、§12.3;我們的遊戲畫面是自繪地圖,也觸及 §12.2「非 Google 地圖」。

### 2.5 Google 企業資料方案

- Google Maps Platform Analytics Services Summary(Last modified 2025-12-04)只列三項:**Street View Insights、Places Insights、Road Management Insights**。
  - https://cloud.google.com/terms/maps-platform/maps-analytics-services
- Roads Management Insights:對象為公部門與基礎設施管理者;只能取「officially managed territory」路網(可申請最多約 20 km 緩衝);資料是近即時車速與 ETA;未提車道。
  - https://developers.google.com/maps/documentation/roads-management-insights/guidelines
- Street View Insights:由街景萃取電桿、路牌等設施位置與狀況,BigQuery 交付;無建物高度、無車道(依搜尋摘要與文件說明;台灣覆蓋 not_stated)。
  - https://developers.google.com/maps/documentation/imagery-insights
- Places Insights:地點統計,與建物高度/車道無關(推論,未細查)。
- 「向 Google 購買/授權地圖向量資料(含高度或車道)」的公開方案:**查無** → not_stated(可能只有私下洽談,未見公開資訊)。

### 2.6 條款中對「人工參考(看著畫)」「衍生作品」的明文

| 文件 | 條文 | 內容(轉述 + ≤15 字引用) |
|---|---|---|
| GMP ToS §3.2.3(c) | 衍生內容 | 「will not create content based on Google Maps Content」;例示描繪道路/建物輪廓(限 Maps JS 衛星底圖)、由 45° 影像建 3D 建物 |
| Map Tiles policies(3D Tiles) | 人工 | 唯一明文涵蓋「人工」:不得「traced, or otherwise derived by hand or machine」 |
| Service Terms §8.2(Earth) | 複製 | 圖層不得「download, export or copy」 |
| Service Terms §8.1.4(Earth) | 衍生物 | 「substantially transformed」的衍生資料算 Customer Data(門檻未定義) |
| Geo Guidelines(Earth) | 3D 重建 | 禁止「reconstruct 3D models or create similar content」 |
| Geo Guidelines(Street View) | 描繪 | 禁止「Creating data from Street View images」 |
| Open Buildings | 衍生 | CC BY 4.0 / ODbL 1.0 允許衍生(但台灣無資料) |
| **「只看、不抄座標與數值,自行憑印象建模」** | — | **not_stated**(所有文件皆無明文) |

---

## 3. 結論

1. **建物高度**:Google 唯一明確提供「建物高度」且標示 Global 覆蓋的付費產品是 **Google Earth Professional Advanced(US$150/人/月)的 Building footprints 圖層**。但 Service Terms §8.2 明文禁止複製圖層,GMP ToS §3.2.3(c) 禁止以 Google 內容建立內容 → 把高度抄進我們的資料再公開,**不被允許**(非法律意見)。Google 自家開放授權的 Open Buildings(含 2.5D 高度)**不涵蓋台灣**。
2. **車道配置**:Google 付費產品中只有 **Navigation SDK** 在導航時給下一路口的車道;台灣是否有車道指引 not_stated,且條款禁止匯出、長期快取、與非 Google 地圖並用 → **不可用作建模來源**。其他 API/企業方案均無車道資料。
3. **總結論**:**目前沒有任何 Google 付費或企業方案,能合法提供台中建物高度或車道配置,作為我們「參考後自建模並公開於遊戲」的依據。** 「只用眼睛看、不抄數值」在所有條款中都沒有明文(not_stated),屬灰色地帶;0001 號決定已選擇避開 Google 灰色地帶,本調查沒有發現推翻該決定的新方案。
4. 合法替代方向(推論,未在本次查證範圍):政府資料(臺中市建物圖屬性欄、國土測繪中心 3D 建物收費供應)、自行實地拍照記錄車道、OSM 社群補登。

### 需要 Cooper 決定的事

- (A)是否接受「Google 無合法付費途徑」結論,維持 0001 號決定(Google 不進資料管線)。
- (B)是否要我另案調查非 Google 的付費來源(國土測繪中心 3D 建物收費價格與授權、臺中市建物圖的樓層欄位、商業圖資商如 HERE/TomTom 的車道資料授權)。
- (C)若仍想試 Google Earth Professional Advanced 只做「目視比對」:這是灰色地帶(not_stated),需 Cooper 決定是否承擔、是否先諮詢律師;且會產生每月 US$150 費用。

---

## 4. not_stated 清單

1. Google Earth 付費方案是否可在台灣購買。
2. Earth Building footprints 圖層在台中範圍是否真有高度值、資料精度與年份。
3. Earth Service Terms §8.1.4「substantially transformed」的判斷門檻,以及與 §8.2、ToS §3.2.3(c) 衝突時的優先順序。
4. 「僅目視、不抄數值的人工風格化建模」是否構成 §3.2.3(c)「create content based on」——所有 Google 文件皆未明文。
5. Solar API 是否涵蓋台灣(覆蓋頁只有互動地圖;搜尋摘要稱 release notes 列有 Taiwan BASE 品質,未讀到原文)。
6. Navigation SDK 在台灣是否提供車道指引(覆蓋表無此欄)。
7. Navigation SDK 是否仍限特定客戶(中文頁片段有此說法,英文 overview 未寫)。
8. Street View Insights 是否涵蓋台灣、價格。
9. Roads Management Insights 價格與是否開放台灣單位。
10. Google 是否有未公開的地圖向量資料授權/銷售方案。
11. Google Earth Pro 桌面版停止下載日期(僅第三方來源)。
12. Places / Routes API 回應中是否有任何車道相關欄位(未逐欄查,推論為無)。
13. Photorealistic 3D Tiles 台中實際 mesh 品質(沿用 data-licensing §2.4)。
