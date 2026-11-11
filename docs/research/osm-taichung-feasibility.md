# OSM 台中市區資料可行性調查(3D 開車遊戲用)

- 調查日期:2026-10-11(Overpass 抓取,UTC 13:25–13:31)/ 2026-10-12(外觀文字來源查閱、報告撰寫)
- OSM 資料快照:`timestamp_osm_base = 2026-10-11T13:27:05Z`(q01–q04 同一快照;q05 為 13:31 抓取)
- 授權:OSM 資料為 © OpenStreetMap contributors,ODbL。遊戲若內嵌 OSM 衍生地圖,需在遊戲內標示來源並遵守 ODbL 的 share-alike(衍生資料庫)條款。
- 本報告所有數字都可由 `tools/research/` 的腳本 + `data/osm/raw/` 的原始檔重現,見第 8 節。數字後方的【】標示來源檔:行號。

---

## 1. 結論摘要

| 項目 | 區域 A(核心) | 區域 B(擴大) | 判讀 |
|---|---:|---:|---|
| 可行駛道路總長 | 844.9 km / 6,055 way | 1,832.3 km / 11,649 way | 路網完整 |
| 路名覆蓋率(依長度,全部類型) | 91.3% | 84.8% | 未命名的主要是 service |
| 路名覆蓋率(不含 service) | **97.9%** | **95.8%** | trunk~tertiary 幾乎 100% |
| name:en 覆蓋率(不含 service) | 84.6% | 78.4% | 主幹道 97–100% |
| lanes 覆蓋率(全部類型) | 13.4% | 12.6% | 車道數多半要自己推估 |
| building 數 | 12,518 | 20,121 | 輪廓幾乎全有 |
| 有 height 或 building:levels | **60.0%** | **52.1%** | 幾乎全是 levels |
| 只有 height | 1.3% | 0.9% | 實際高度要用「樓層 × 層高」推估 |
| 有 name 的建物 | 1,742 (13.9%) | 2,840 (14.1%) | |

【area_stats.md:23-24, 46-47, 97-98】

- **地標:22 個全部能在 OSM 找到對應元素**(21 個指定地標 + 區域 B 最高建物)。其中 4 個的對應有瑕疵:宮原眼科只有 POI 點(輪廓是推論出來的)、科博館的館舍建物都沒有 name、臺中之鑽沒有 name 且仍標為 `building=construction`、一中街是街道(線)不是建物。
- **路名用字**:OSM 一律用「**臺灣大道**」(A、B 都是 0 筆「台灣大道」)。路名帶「段」(例:臺灣大道二段、文心路三段)。少數名稱用「台」,例如台中交流道、台中路、中台路。
- **地形**:臺中車站約 76–78 m,東海路思義教堂約 180 m(SRTM),**高差約 100 m**;區域 B 西緣的大肚山台地有水準點達 227.38 m(比車站高約 150 m)。

---

## 2. 查詢方法

| 查詢 | 查詢檔(tools/research/queries/) | 原始資料(data/osm/raw/) | 內容 |
|---|---|---|---|
| q01 | q01_roads_B.overpassql | q01_roads_B.json(8.0 MB) | 區域 B 所有可行駛 highway way + 完整幾何 |
| q02 | q02_buildings_B.overpassql | q02_buildings_B.json(4.2 MB) | 區域 B 的 building way/relation(標籤 + center),以及 building:part |
| q03 | q03_features_B.overpassql | q03_features_B.json(0.7 MB) | 水道、鐵路、鐵路 route relation、公園、水體、有 ele 標籤的 node |
| q04 | q04_landmarks_B.overpassql | q04_landmarks_B.json(6.2 MB) | name/alt_name/old_name/official_name 符合地標關鍵字的元素 + 幾何 |
| q05 | q05_landmark_followup.overpassql | q05_landmark_followup.json | 補查:臺中之鑽候選 way、宮原眼科 node 周邊建物、科博館園區內建物 |
| DEM | (elevation_check.py --print-url 產生 URL) | elev_opentopodata_srtm30m.json | OpenTopoData SRTM30m,1 次請求 29 個點 |

- **Overpass 用量**:共 8 次 HTTP 請求,在 12 次上限內。其中 3 次失敗:2 次 overpass-api.de 回 504(dispatcher timeout,伺服器忙),1 次 kumi.systems 回 500(整站故障)。把 `[timeout:180]` 降為 `[timeout:90][maxsize:134217728]` 之後就成功了。每次請求都記在 `data/osm/raw/fetch_log.tsv`。
- **區域 A 的計算方式**:只對區域 B 抓一次資料,A 由腳本裁切得到(A 完全在 B 內)。
  - 道路:每條線段先用 Liang-Barsky 在經緯度平面裁切到 bbox,再用 haversine(R = 6371008.8 m)算長度。
  - 建物與公園:以 Overpass 回傳的 center 是否落在 bbox 內決定歸屬區域。
- **比例的計算基準**:
  - 「name 比例」等:依**長度**計。
  - 「oneway 數量」:依 **way 數**計,分兩欄:「有 oneway 標籤」與「oneway ∈ yes/1/true/-1/reversible」。
- **外觀文字來源**:以中文維基百科為主,不足時用英文維基、公開新聞或旅遊頁補充(第 5 節每條附 URL)。沒有下載、嵌入或轉存任何照片。

---

## 3. 區域統計

### 3.1 可行駛道路:區域 A(24.130,120.630,24.175,120.695)【area_stats.md:5-26】

| highway | way 數 | 長度 km | name% | name:en% | lanes% | 有 oneway 標籤 | oneway=yes/-1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| motorway | 3 | 0.28 | 100.0 | 100.0 | 100.0 | 3 | 3 |
| motorway_link | 19 | 1.89 | 100.0 | 9.2 | 36.4 | 19 | 19 |
| trunk | 6 | 2.35 | 100.0 | 100.0 | 100.0 | 6 | 6 |
| trunk_link | 15 | 1.72 | 100.0 | 0.0 | 35.3 | 15 | 15 |
| primary | 232 | 41.30 | 100.0 | 97.7 | 43.3 | 230 | 204 |
| primary_link | 20 | 1.26 | 6.4 | 0.0 | 18.4 | 20 | 20 |
| secondary | 471 | 91.82 | 100.0 | 99.6 | 44.1 | 456 | 323 |
| secondary_link | 29 | 1.40 | 25.9 | 23.1 | 0.0 | 29 | 29 |
| tertiary | 526 | 104.68 | 99.8 | 96.5 | 24.3 | 474 | 298 |
| tertiary_link | 18 | 1.27 | 45.6 | 40.8 | 0.0 | 16 | 14 |
| unclassified | 26 | 2.89 | 38.5 | 18.0 | 0.0 | 6 | 2 |
| residential | 2,233 | 394.53 | 97.9 | 78.3 | 6.0 | 1,265 | 227 |
| living_street | 3 | 0.43 | 80.0 | 52.9 | 0.0 | 1 | 1 |
| service | 2,454 | 199.07 | 69.9 | 20.6 | 0.6 | 446 | 182 |
| **合計** | **6,055** | **844.88** | **91.3** | **69.5** | **13.4** | 2,986 | 1,343 |
| 合計(不含 service) | 3,601 | 645.81 | 97.9 | 84.6 | 17.3 | 2,540 | 1,161 |

maxspeed 覆蓋 8.2%(依長度),width 覆蓋 0.2%。

### 3.2 可行駛道路:區域 B(24.130,120.590,24.200,120.700)【area_stats.md:28-49】

| highway | way 數 | 長度 km | name% | name:en% | lanes% | 有 oneway 標籤 | oneway=yes/-1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| motorway | 34 | 17.23 | 100.0 | 100.0 | 100.0 | 34 | 34 |
| motorway_link | 75 | 11.82 | 100.0 | 1.5 | 68.3 | 75 | 75 |
| trunk | 30 | 18.22 | 100.0 | 97.9 | 100.0 | 30 | 30 |
| trunk_link | 50 | 8.89 | 100.0 | 0.0 | 25.4 | 50 | 50 |
| primary | 342 | 69.30 | 100.0 | 98.5 | 31.3 | 340 | 314 |
| primary_link | 26 | 1.47 | 10.9 | 5.4 | 15.7 | 26 | 26 |
| secondary | 601 | 129.13 | 100.0 | 98.0 | 43.6 | 584 | 385 |
| secondary_link | 37 | 1.74 | 20.9 | 18.7 | 0.0 | 37 | 37 |
| tertiary | 1,176 | 282.76 | 99.6 | 94.7 | 23.8 | 1,069 | 788 |
| tertiary_link | 59 | 3.22 | 22.5 | 20.6 | 8.7 | 55 | 36 |
| unclassified | 103 | 26.16 | 67.3 | 46.9 | 14.0 | 31 | 13 |
| residential | 4,304 | 789.64 | 94.6 | 70.3 | 4.2 | 1,991 | 319 |
| living_street | 7 | 0.95 | 74.4 | 23.6 | 0.0 | 2 | 1 |
| service | 4,805 | 471.81 | 53.1 | 15.3 | 0.6 | 830 | 405 |
| **合計** | **11,649** | **1,832.33** | **84.8** | **62.1** | **12.6** | 5,154 | 2,513 |
| 合計(不含 service) | 6,844 | 1,360.53 | 95.8 | 78.4 | 16.8 | 4,324 | 2,108 |

maxspeed 覆蓋 10.2%,width 覆蓋 0.2%。

### 3.3 建物【area_stats.md:93-100】

| 區域 | building 數(way / relation) | 有 height 或 levels | 有 height | 有 levels | 有 name | roof:shape | building:colour | building:part(有 height) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| A | 12,518(12,450 / 68) | 7,510(60.0%) | 167(1.3%) | 7,494(59.9%) | 1,742(13.9%) | 31 | 22 | 187(4) |
| B | 20,121(20,020 / 101) | 10,475(52.1%) | 174(0.9%) | 10,459(52.0%) | 2,840(14.1%) | 36 | 22 | 288(4) |

- building 值前幾名(A):residential 3,739、house 2,624、apartments 1,989、yes 1,555、outbuilding 1,062。
- 統計時排除 `building=no`。

### 3.4 水系、公園、鐵路【area_stats.md:132-】

| 水系 | 區域 A 長度 | 區域 B 長度 | OSM 標記 |
|---|---:|---:|---|
| 柳川 | 7.30 km | 8.18 km | waterway=river,另有 waterway relation 12456802 |
| 綠川 | 2.60 km | 2.60 km | river,relation 12456807 |
| 梅川 | 5.32 km | 5.51 km | river/drain,relation 14614555 |
| 麻園頭溪 | 6.03 km | 6.48 km | river,relation 19063552 |
| 筏子溪 | 不在 A 範圍內 | 8.47 km | river,relation 10960648 |

- **公園**(leisure=park,以 center 判斷所屬區域):A 有 223 處(146 處有名);B 有 357 處(248 處有名)。natural=water:A 28 處,B 62 處。
- **鐵路**:
  - 台鐵:`railway=rail` 名稱「臺中線」,operator 為國營臺灣鐵路股份有限公司。在 A 內 5.72 km,在 B 內 11.35 km(高架段)。
  - 臺中捷運綠線:`railway=subway`,operator 為臺中捷運公司。A 內 17.57 km,B 內 19.74 km。只有 2 條 way,推論是上下行雙軌各畫一條,所以長度約為路線長的 2 倍。
  - 高鐵:B 內 16.03 km。
  - 舊線:「臺中綠空鐵道」標為 disused(4.54 km),「臺中線平面舊線」標為 abandoned(B 內 7.05 km)。
  - Route relation:捷運綠線雙向各 1 條、臺中線 1 條、台鐵班次若干、高鐵班次 171 條。

### 3.5 路名用字慣例【area_stats.md:88-91;area_stats.json → naming】

- **臺灣大道**:A、B 內所有以臺灣大道開頭的名稱都寫「臺」,寫「台灣大道」的有 **0 筆**。A 內臺灣大道系列(含巷弄)總長 27.95 km,B 內 50.62 km。
  - 英文名:例如「Taiwan Boulevard Section 2」、「Lane 179, Section 2, Taiwan Boulevard」。
- **含「臺」與含「台」的比較**:
  - 區域 A:含「臺」的路名 195 條 way(不重複名稱 53 個);含「台」的 33 條 way。
  - 區域 B:含「臺」298 條 way;含「台」75 條 way。
  - 含「台」的名稱:台中交流道(國道 1 號匝道)、台中路(東區)、中台路、富台街、電台街、台貿路等。這些是道路本身就叫這個名字或是交流道名稱,不代表「臺」「台」混用。
- **段**:A 內 1,482 條 way 的名稱含「X段」,其中 939 條以「段」結尾(例:臺灣大道二段)。其餘是「X段N巷/弄」。
- **巷弄**:巷弄有獨立命名,A 內 1,918 條 way 的名稱含巷或弄,例如「臺灣大道二段311巷1弄」。
- **name:zh**:A 內 2,963 條 way 另外帶 name:zh 標籤。
- **已知資料錯誤**:「臺灣大道一段81巷」的 name:en 寫成「Lane 43…」。這說明 name:en 不能全信。

---

## 4. 區域 A:trunk / primary / secondary 路名(依長度排序前 30)【area_stats.md:51-86】

去重方式是 name 完全相同才合併,所以同一條路的不同「段」分開列。區域 A 內一共有 68 個不同的主幹道路名;沒有 name 的 trunk/primary/secondary 長度為 0 km。

| # | name | 長度 km | 類型 | name:en |
|---:|---|---:|---|---|
| 1 | 臺灣大道二段 | 11.86 | primary | Taiwan Boulevard Section 2 |
| 2 | 五權路 | 7.56 | primary/secondary | Wuquan Road |
| 3 | 臺灣大道三段 | 6.87 | primary | Taiwan Boulevard Section 3 |
| 4 | 忠明南路 | 6.19 | secondary | Zhongming South Road |
| 5 | 五權西路二段 | 5.42 | secondary | Wuquan West Road Section 2 |
| 6 | 文心路三段 | 5.31 | secondary/primary | Wenxin Road Section 3 |
| 7 | 中清路一段 | 5.10 | primary | Zhongqing Road Section 1 |
| 8 | 文心路四段 | 4.85 | secondary/primary | Wenxin Road Section 4 |
| 9 | 公益路二段 | 4.69 | secondary | Gongyi Road Section 2 |
| 10 | 進化路 | 4.52 | primary | Jinhua Road |
| 11 | 文心路一段 | 3.91 | secondary | Wenxin Road Section 1 |
| 12 | 三民路三段 | 3.74 | secondary | Sanmin Road Section 3 |
| 13 | 進化北路 | 3.69 | secondary | Jinhua North Road |
| 14 | 忠明路 | 3.52 | secondary | Zhongming Road |
| 15 | 黎明路二段 | 3.26 | secondary | Liming Road Section 2 |
| 16 | 青海路二段 | 3.22 | secondary | Qinghai Road Section 2 |
| 17 | 英才路 | 3.12 | secondary | Yingcai Road |
| 18 | 崇德路一段 | 3.08 | secondary | Chongde Road Section 1 |
| 19 | 南屯路二段 | 2.41 | secondary | Nantun Road Section 2 |
| 20 | 民權路 | 2.35 | secondary | Minquan Road |
| 21 | 東西向快速公路 快官霧峰線 | 2.35 | trunk | Kuaiguan-Wufeng Expressway |
| 22 | 向上路一段 | 2.32 | secondary | Section 1, Xiangshang Road |
| 23 | 五權西路一段 | 2.18 | secondary | Wuquan West Road Section 1 |
| 24 | 建成路 | 2.18 | primary | Jiancheng Road |
| 25 | 文心路二段 | 1.84 | secondary | Wenxin Road Section 2 |
| 26 | 北屯路 | 1.84 | primary/secondary | Beitun Road |
| 27 | 公益路 | 1.84 | secondary | Gongyi Road |
| 28 | 文心南路 | 1.65 | secondary | Wenxin South Road |
| 29 | 臺灣大道一段 | 1.62 | primary | Taiwan Boulevard Section 1 |
| 30 | 崇德路二段 | 1.47 | secondary | Chongde Road Section 2 |

這裡的長度是雙向分隔道路兩側 way 長度的加總,所以會大於道路的實際中線長度(推論)。例如臺灣大道二段在 A 內的實際里程比 11.86 km 短得多,原因是它由 70 條 way 組成,含雙向分隔車道。

---

## 5. 地標表

### 5.1 OSM 對照【landmarks.md:1-25;完整標籤見 landmarks.json】

中心點的算法:多邊形用面積加權形心,多個元素就合併加權,街道取線段中點。面積是投影後用鞋帶公式算出的約略值。「h」= OSM height 標籤,「lv」= building:levels 標籤,「-」代表沒有這個標籤。

| # | 地標 | 有無 | OSM type/id | OSM name | 中心 lat,lon | 面積約 m² | height / levels |
|---:|---|---|---|---|---|---:|---|
| 1 | 臺中國家歌劇院 | 有 | way 222636759 | 臺中國家歌劇院 | 24.16293,120.64052 | 8,732 | h - / lv 6 |
| 2 | 臺中車站(新站) | 有 | way 442234244 | 臺中車站 | 24.13722,120.68677 | 16,790 | **h 37** / lv 3 |
| 3 | 臺中驛(舊站紅磚站房) | 有 | way 223056023 | 臺中驛 | 24.13692,120.68527 | 853 | h - / lv 2(roof:shape=hipped) |
| 4 | 臺中市政府(臺灣大道市政大樓) | 有 | way 222413435 | 臺中市政府臺灣大道市政大樓 | 24.16172,120.64684 | 13,254 | h - / lv 10 |
| 5 | 臺中市議會 | 有 | way 222636758 | 臺中市議會 | 24.15858,120.64479 | 3,407 | h - / lv 14 |
| 6 | 國立自然科學博物館 | 有(園區) | way 219414222(leisure=park) | 國立自然科學博物館 | 24.15766,120.66684 | 140,567(園區) | 園區無;館舍見註 |
| 7 | 國立臺灣美術館 | 有 | way 240137720 | 國立臺灣美術館 | 24.14156,120.66342 | 16,620(館舍) | 無 |
| 8 | 臺中公園(湖心亭) | 有 | relation 10093212;湖心亭 way 322820685 | 臺中公園 / 湖心亭 | 24.14435,120.68427(湖心亭 24.14365,120.68421) | 84,411(湖心亭 186) | 無 |
| 9 | 秋紅谷景觀生態公園 | 有 | way 224961782 | 秋紅谷廣場 | 24.16726,120.63909 | 28,307 | 無(不適用) |
| 10 | 草悟道 | 有(7 段) | way 219484140/141/142/629/630/631、326740477 | 草悟道 | 24.14926,120.66440 | 61,228(合計) | 無(不適用) |
| 11 | 勤美誠品綠園道 | 有 | way 238733789 | 勤美誠品綠園道 | 24.15130,120.66389 | 4,460 | h - / lv 14 |
| 12 | 新光三越台中中港店 | 有 | way 148849083 | 新光三越(name 沒有店名) | 24.16478,120.64345 | 6,867 | h - / lv 14 |
| 13 | 大遠百 Top City | 有 | way 224955652 | Top City台中大遠百 | 24.16417,120.64448 | 7,936 | h - / lv 14 |
| 14 | 宮原眼科 | 部分 | node 3124088457(POI);推論輪廓 way 654378518 | 宮原眼科(建物本身無 name) | 24.13785,120.68357(node) | 312(推論輪廓) | 無 |
| 15 | 第二市場 | 有 | way 271452260 | 第二市場 | 24.14236,120.67874 | 8,245 | 無 |
| 16 | 審計新村 | 有 | way 560332944(tourism=attraction) | 審計新村 | 24.14462,120.66267 | 5,168 | 無 |
| 17 | 一中街 | 有(街道) | way 212313525、262805714、648358687(highway) | 一中街 | 24.15027,120.68544 | 不適用(線,共 960 m) | 不適用 |
| 18 | 逢甲夜市 | 有 | way 450771065(marketplace 範圍) | 逢甲夜市 | 24.17806,120.64596 | 13,750 | 不適用 |
| 19 | 東海大學路思義教堂 | 有 | way 227101621 | 路思義教堂 | 24.17889,120.60055 | 284 | 無 |
| 20 | 臺中洲際棒球場 | 有 | relation 9106109(building=stadium) | 台中市洲際棒球場 | 24.19963,120.68468 | 15,789(看台建物);園區 way 224591705 為 90,660 | 無 |
| 21 | 中友百貨 | 有 | relation 7347107;A/B/C 棟 way 223053792/223053791/223053794 | 中友百貨 | 24.15235,120.68470 | 6,709 | A/B/C 各 lv 15,building:colour=blue |
| 22 | 區域 B 最高建物:臺中之鑽 | 有(推論) | way 1529973208 | 無 name(building=construction) | 24.16132,120.63614 | 2,384 | **h 182** / lv 36,roof:shape=skillion |

補充說明:

- **科博館**:q05 在園區內查到 8 棟 `tourism=museum` 無名建物(way 936530136–936530143),合計約 18,600 m²,最大一棟 5,011 m²;另有熱帶雨林溫室(way 219476253,2,564 m²,lv 2)。都沒有 height 標籤。
- **園區面積和維基不一致**:OSM 園區多邊形 14.06 ha,維基寫館區約 8.9 公頃。推論是 OSM 的多邊形把植物園也包進去了。
- **秋紅谷**:OSM 面積 28,307 m²,維基寫 3 公頃,兩者相符。
- **臺中之鑽的辨識依據**(推論):
  - 位置:OSM way 1529973208 在市政路(58 m)與河南路三段(78 m)之間,與中文維基記載的地址「河南路、市政路口」吻合。
  - 高度:height=182 和中文維基寫的「頂樓 182 公尺」一致。
  - 英文維基的座標(24.16444, 120.63806)離這個位置約 400 m,而且那個座標上的建物是老虎城,所以判斷英文維基座標不精確。
- **高度標籤和維基的比對**:
  - 歌劇院:維基寫 37.7 m、地上 6 層,和 OSM lv 6 吻合。
  - 臺中車站:維基寫頂樓 37 m,和 OSM h 37 吻合。
  - 市政大樓:維基寫地上 10 層、屋頂 43.2 m,和 OSM lv 10 吻合。
  - 勤美誠品:維基寫地上 15 層,OSM 寫 lv 14,**不一致**。
  - 這些比對只在報告中列出,沒有修改 OSM。

### 5.2 區域 B 最高建物

依 OSM height 排序【area_stats.md:102-115】:

| 名次 | 建物 | OSM height | 註 |
|---:|---|---:|---|
| 1 | way 1529973208(臺中之鑽,推論) | 182 m | building=construction |
| 2 | 李方艾美酒店的 building:part(way 1469800971) | 164 m | 部件都無 name;主建物 way 253356949「李方艾美酒店」lv 27 |
| 3 | 富宇東方之冠(way 793914491) | 140 m | |

- OSM height 只有 174 棟有標(0.9%),所以**OSM 不能單獨用來判定誰最高**。
- 依 building:levels 排序,第 1 名是「國泰金融大樓」(lv 47,無 height)。
- 公開資料:英文維基〈List of tallest buildings in Taichung〉主表第 1 名是 Taichung Commercial Bank Headquarters(臺中之鑽),225 m、38 層、位於西屯區。中文維基〈臺中之鑽〉寫的是:天線/尖頂 225 m、屋頂 191 m、頂樓 182 m、地上 38 層、地下 10 層,狀態為已封頂。
- 英文列表在其他段落另寫了「最高為 The Landmark(聯聚中雍大廈)」,條目內部前後矛盾。以主表與專條為準。
- 結論:區域 B 最高建物是**臺中之鑽**,尖頂 225 m、屋頂 191 m(依維基);OSM 標 182 m。是否已正式竣工啟用:not_stated。
- 來源:https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Taichung 、https://zh.wikipedia.org/zh-tw/臺中之鑽 、https://en.wikipedia.org/wiki/Taichung_Commercial_Bank_Headquarters

### 5.3 外觀特徵(供低多邊形、極簡可愛風格建模參考)

以下內容是對來源文字的改寫摘要。標「not_stated」的項目代表文字來源沒寫;這類項目建模時要另外看照片判斷,但照片不可下載或轉存。

1. **臺中國家歌劇院**
   - 由伊東豊雄設計,以「洞窟、樹屋」為概念,全館由 580 面曲牆構成,內部牆面全是曲面,和一般方盒劇場完全不同。
   - 高 37.7 m,地上 6 層、地下 2 層,6 樓有空中花園。
   - 外牆顏色與材質:not_stated(維基未寫)。
   - 來源:https://zh.wikipedia.org/zh-tw/臺中國家歌劇院
2. **臺中車站(新站)**
   - 2016 年啟用的高架站,地上 3 層、地下 1 層,頂高 37 m。
   - 屋頂形狀像蝴蝶展翅,屋頂鋪太陽能板,採自然通風與採光。
   - 立面顏色:not_stated。
   - 來源:https://zh.wikipedia.org/zh-tw/臺中車站
3. **臺中驛(舊站)**
   - 1917 年完工的辰野式(後期文藝復興)紅磚站房,屋頂是洋式木構造,月台是鑄鐵構造。
   - 外緣有木造迴廊;基座、柱頭、梁接頭有裝飾,入口有雙柱。
   - OSM 記為 2 層、四坡屋頂(hipped)。
   - 鐘塔:not_stated。
   - 來源:https://zh.wikipedia.org/zh-tw/臺中車站
4. **臺中市政府(臺灣大道市政大樓)**
   - 地上 10 層、屋頂 43.2 m,外覆玻璃帷幕,在光線下呈淡藍色晶亮感。
   - 中央下方挖空形成川堂,把建物分為東側的文心樓與西側的惠中樓,前方是府前廣場,後方是市政公園。
   - 由瑞士 Weber + Hofer 設計。
   - 來源:https://zh.wikipedia.org/zh-tw/臺灣大道市政大樓 、https://filmtaichung.org.tw/index.php/scenesContent/156 、https://www.mirrormedia.mg/story/20220308mkt001
5. **臺中市議會**
   - 和市政大樓同屬新市政中心,同樣由 Weber + Hofer 設計,背面緊鄰市政公園,頂樓有空中花園。
   - 形體、顏色、材質:not_stated(維基與查到的報導都沒寫)。OSM 記 lv 14。
   - 來源:https://zh.wikipedia.org/zh-tw/臺中市議會 、https://www.mirrormedia.mg/story/20220308mkt001
6. **國立自然科學博物館**
   - 館區由科學中心、生命科學廳、人類文化廳、地球環境廳 4 館,加上太空劇場與立體劇場組成,佔地約 8.9 ha。
   - 太空劇場內部是傾斜 30 度、直徑 23 m 的半球。生命科學廳內有機械暴龍。
   - 另有熱帶雨林溫室(植物園,1999 年)。
   - 建物外觀、顏色、材質:not_stated。
   - 來源:https://zh.wikipedia.org/zh-tw/國立自然科學博物館
7. **國立臺灣美術館**
   - 主館是東西向的長條形建築,地上 3 層、地下 2 層。
   - 園區約 10 ha,有下凹庭園、空中走廊、約 48 件戶外雕塑,東側有碑林廣場。
   - 外觀顏色與材質:not_stated。
   - 來源:https://zh.wikipedia.org/zh-tw/國立臺灣美術館
8. **臺中公園(湖心亭)**
   - 湖心亭是雙併式尖頂涼亭:兩座亭子用中央通廊相連,屋頂四條屋脊以弧線收束在尖端。
   - 配色為朱紅屋簷、白色亭牆,屋頂是銅瓦(2007 年恢復)。
   - 位在日月湖中的小島上,以拱橋連到岸邊,是臺中市徽與市旗上的圖案。
   - 來源:https://zh.wikipedia.org/zh-tw/湖心亭_(臺中市)
9. **秋紅谷景觀生態公園**
   - 前身是停工建案留下的大型地基,改建成全台唯一的下凹式景觀公園。
   - 中央是兼具滯洪功能的人工湖,周圍被七期高樓群包圍。面積 3 ha。
   - 下凹深度:not_stated。
   - 來源:https://zh.wikipedia.org/zh-tw/秋紅谷廣場
10. **草悟道**
    - 全長約 3.6 km 的帶狀綠園道,從科博館經市民廣場到國美館,分經國園道與美術園道兩段,設計概念取自行草書法的流動感。
    - 自行車道是紅色鋪面,沿線有草坪廣場與阿薩斯青銅像。
    - 來源:https://zh.wikipedia.org/zh-tw/草悟道
11. **勤美誠品綠園道**
    - 面向公益路與經國園道的兩側外牆是大面積植生綠牆,約 11.8 萬株植栽,條目稱當時是亞洲最大。
    - 中庭有一面約 20 m 高的室內植生牆。地上 15 層、地下 2 層,中段樓層是停車場。
    - 外牆其他材質:not_stated。
    - 來源:https://zh.wikipedia.org/zh-tw/勤美誠品綠園道
12. **新光三越台中中港店**
    - 外觀:not_stated(找不到描述外觀的條目)。
    - 2025 年 2 月發生氣爆後停業;2025-09-22 的報導說最快 9 月底復業,整修內容包括外部 LED 燈牆。實際復業日期在本次調查中 not_stated(沒有直接核實)。
    - OSM 記 lv 14,name:en 標註「(suspended)」,這筆資料可能已過時。
    - 來源:https://uanalyze.com.tw/articles/9514433756
13. **大遠百 Top City**
    - 2011 年開幕,地上 14 層、地下 2 層,開幕時是台中最大的購物中心。
    - 外觀形體與顏色:not_stated(英文維基沒寫)。有旅遊網站說設計發想是「巨型帆船」,但只是單一非權威來源,這裡不採用。
    - 來源:https://en.wikipedia.org/wiki/Top_City
14. **宮原眼科**
    - 1927 年建,二層連續磚拱街屋,沿街寬 9 個店面、立面有 7 個拱門。
    - 921 地震後屋架與外牆坍塌,只剩沿街立面;2010 年後改建,保留騎樓與立面。
    - 室內有直通四樓的木造書櫃,常被比喻成霍格華茲大廳。
    - 來源:https://zh.wikipedia.org/zh-tw/宮原眼科 、https://www.gvm.com.tw/article/17029
15. **第二市場**
    - 1917 年開設,平面是三翼放射狀,中央有一座六角主樓當核心。
    - 主體建築佔地 324 坪,整個市場佔地 2,388 坪。
    - 材質與顏色:not_stated。
    - 來源:https://zh.wikipedia.org/zh-tw/臺中市公有第二零售市場
16. **審計新村**
    - 1969 年竣工的省府宿舍群,都是二層樓的矮建築,牆面是淡鵝黃色。
    - 現在是 368 文創園區,地址在民生路 368 巷。
    - 來源:https://zh.wikipedia.org/zh-tw/審計新村
17. **一中街**
    - 以臺中一中旁的一中街為主軸,商圈延伸到三民路、太平路、育才街。
    - 由多條同類型商店聚集的街道組成,例如育才街的「眼鏡街」;商圈入口在育才南街與雙十路口,有一中街標示牌。
    - 招牌樣式:not_stated。OSM 中的一中街共 960 m(tertiary 802 m、pedestrian 136 m、residential 22 m)。
    - 來源:https://zh.wikipedia.org/zh-tw/一中街
18. **逢甲夜市**
    - 核心是福星路與文華路形成的徒步夜市,延伸到慶和街、逢甲路 20 巷(俗稱便當街)、西屯路等處。
    - 平日約 3 萬人次,假日超過 10 萬人次,條目稱是全台最大的夜市。
    - 攤位與招牌形式:not_stated。
    - 來源:https://zh.wikipedia.org/zh-tw/逢甲夜市
19. **東海大學路思義教堂**
    - 由貝聿銘與陳其寬設計,由 4 片彼此分離的雙曲面薄殼組成,上窄下寬,外形像倒過來的船底。
    - 屋脊斷開成一道玻璃天窗(「一線天」),外牆貼菱形面磚。
    - 尺寸 19.8 m × 30.48 m,立面朝西。高度與磚色:not_stated。
    - 來源:https://zh.wikipedia.org/zh-tw/路思義教堂
20. **臺中洲際棒球場**
    - 共 19,321 席,其中內野 14,321 席、外野 5,000 席。內野有遮雨棚,遮棚與「縫線造型體」上裝了 LED 光廊。
    - 外野是天然草皮,尺寸 325 / 400 / 325 ft;2016 年整修時改成藏青色座椅。旁邊有多功能運動中心「迷你蛋」。
    - 來源:https://zh.wikipedia.org/zh-tw/臺中市洲際棒球場
21. **中友百貨**
    - 由 A、B、C 三棟並列組成,每層以空橋相連,地上 15 層。10–11 樓外側做成英式環型圖書館樣式(誠品)。
    - 外牆顏色在文字來源中 not_stated;OSM 對三棟都標 `building:colour=blue`(OSM 資料,不是文字來源)。
    - 來源:https://zh.wikipedia.org/zh-tw/中友百貨公司
22. **臺中之鑽(區域 B 最高)**
    - 兩座分離的塔樓,中間懸置一系列「漂浮」的透明玻璃盒子;整體造型取自臺中商銀標誌上的「中」字,呈水晶感。
    - 地上 38 層,尖頂 225 m。
    - 立面材質與顏色:not_stated。
    - OSM 註記頂部是斜屋頂(roof:shape=skillion)。
    - 來源:https://zh.wikipedia.org/zh-tw/臺中之鑽 、https://en.wikipedia.org/wiki/Taichung_Commercial_Bank_Headquarters

---

## 6. 海拔:大肚山台地(東海)與臺中車站【elevation.md:1-79】

| 點 | 依據 | 海拔 |
|---|---|---:|
| 臺中車站(新站中心) | SRTM30m | 78 m |
| 臺中車站附近 | OSM 內政部水準點 3096(距車站約 1 km 東) | 76.09 m |
| 路思義教堂 | SRTM30m | 180 m |
| 東海一帶(台地西緣) | OSM 內政部水準點 8095(24.18379,120.59174,距教堂約 1.05 km) | 227.38 m |

- **結論**:路思義教堂比臺中車站高約 **100 m**(SRTM:180 − 78 = 102 m)。區域 B 內大肚山台地的已知最高水準點(227.38 m)比車站水準點(76.09 m)高約 **151 m**。
- **怎麼驗證的**:拿 OSM 中 27 個有 ele 標籤的測量點,與 SRTM 同點位的值比對。
  - 全部 27 點:平均偏差 −1.3 m,平均絕對誤差 8.6 m。
  - 只看 9 個「水準點」:SRTM 一律偏高 0.9 至 10.8 m。推論原因是 SRTM 量的是地表(含建物、樹木)高度。
  - 部分導線點、衛星點差距達 20–44 m。推論這些點可能是樓頂點,或用的是不同的高程基準。
- **給遊戲的估計**:建議以「東海台地比市中心高約 100–150 m」當地形尺度。精細地形要用內政部 20 m DEM 這類官方資料,本次沒有取得:not_stated。

---

## 7. 資料缺口與對遊戲製作的影響

| # | 缺口 | 量化 | 對遊戲的影響 | 建議 |
|---:|---|---|---|---|
| 1 | **建物高度幾乎只有樓層、沒有實際高度** | height 只有 0.9–1.3%;levels 有 52–60%;還有約 40–48% 的建物兩者皆無 | 天際線要靠推估 | 用 levels × 3.2 m 換算;沒有 levels 的依 building 類型給預設層數(house = 2–3、residential = 4–5);地標另外手工建模。層高與預設值是品味/節奏參數,由 Cooper 決定 |
| 2 | **車道數覆蓋率低** | lanes 只有 12.6–13.4%(primary/secondary 約 31–44%,residential 4–6%) | 路寬無法直接由資料生成 | 依 highway 等級給預設車道數;雙向分隔道路要合併左右兩條 way(臺灣大道等主幹道都分兩條畫) |
| 3 | **地標資料品質不一** | 22 個中 4 個有瑕疵(宮原眼科只有點、科博館館舍無名、臺中之鑽無名且仍標 construction、一中街是線) | 自動生成無法辨識這些地標 | 維護一份「地標覆寫表」(OSM id → 自製模型),landmarks.json 可以當初版 |
| 4 | **捷運與高架鐵路的 3D 關係** | 綠線是雙軌兩條 way,台鐵為高架段 | 需要高架橋、橋墩,也要決定路面交會處怎麼處理 | 用 bridge/layer 標籤生成高架;這次沒統計:not_stated |
| 5 | service 道路命名少 | name 覆蓋 53–70% | 停車場、巷內通道沒有路名 | 遊戲 UI 只顯示有名道路 |
| 6 | name:en 部分有錯 | 已發現 1 筆錯誤樣本 | 英文介面可能顯示錯路名 | 英文名以中文名為準重新產生,或只做中文 |
| 7 | 地形 | OSM 沒有 DEM | 東海一帶高約 100–150 m 的坡度要另外處理 | 另找 DEM(授權待查:not_stated) |
| 8 | 授權 | ODbL | 衍生地圖要標示來源;衍生資料庫須 share-alike | 規劃書寫入授權合規項目 |

---

## 8. 重現步驟

所有指令都可以從任何目錄執行,資料檔一律用絕對路徑傳入,Python 用 `-I`。

```bash
P=/Users/cooperfu/Projects/3D_Racing
# (可選)重抓 Overpass:資料會隨時間變動,重抓後數字會和本報告不同。本報告數字以 raw/ 現存檔為準。
# 每支查詢之間請 sleep 數秒,總數 ≤ 12。第 3 參數 only-primary 代表只打 overpass-api.de。
bash $P/tools/research/fetch_overpass.sh $P/tools/research/queries/q01_roads_B.overpassql $P/data/osm/raw/q01_roads_B.json only-primary
#   …q02–q05 同理

# 1) 區域統計(第 3、4 節)
python3 -I $P/tools/research/osm_area_stats.py --roads $P/data/osm/raw/q01_roads_B.json \
  --buildings $P/data/osm/raw/q02_buildings_B.json --features $P/data/osm/raw/q03_features_B.json \
  --out-json $P/data/osm/derived/area_stats.json > $P/data/osm/derived/area_stats.md
# 2) 地標(第 5.1 節)
python3 -I $P/tools/research/osm_landmarks.py --landmarks $P/data/osm/raw/q04_landmarks_B.json \
  --followup $P/data/osm/raw/q05_landmark_followup.json --out-json $P/data/osm/derived/landmarks.json \
  > $P/data/osm/derived/landmarks.md
# 3) 海拔(第 6 節):先 --print-url,把印出的 URL 用 curl 存成 raw/elev_opentopodata_srtm30m.json,再執行:
python3 -I $P/tools/research/elevation_check.py --features $P/data/osm/raw/q03_features_B.json \
  --landmarks $P/data/osm/derived/landmarks.json --dem $P/data/osm/raw/elev_opentopodata_srtm30m.json \
  > $P/data/osm/derived/elevation.md
# 4) 幾何函式自我檢查(haversine、裁切、面積、multipolygon、點在多邊形內)
python3 -I $P/tools/research/test_geo.py   # 預期輸出 ALL OK
```

- 地標與 OSM 元素的對應寫在 `osm_landmarks.py` 的 `LANDMARKS` 清單裡(人工判定)。要新增地標,先在 q04 結果中找到候選元素,再把它加進清單。
- 外觀描述(第 5.3 節)是人工閱讀來源網頁後改寫的,沒有腳本;重現方式是重新閱讀所附 URL。
