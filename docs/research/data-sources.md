# 地圖資料來源總表(重建地圖用)

日期:2026-11-21(由 `data/` 底下各 SOURCE.md、fetch_log.tsv、決策文件匯整;原始資料本身不進版控)
用途：換電腦時照這份重新下載，就能從頭重建 `public/map/range-a/`(建置順序見 README「Map data」)。
注意:2026-11-21 時這些政府資料都還是**手動下載**;下載腳本尚未建立(見 `docs/reviews/2026-11-21-project-review.md` H8)。

## 總表
| # | 資料 | 提供者 / 資料集 | 授權 | 取得方式 | 本地路徑(gitignored) | 檔案與 sha256 | 處理腳本 | 決策 |
|---|---|---|---|---|---|---|---|---|
| 1 | OSM 道路、建築、綠地、水系、捷運、公車站 | OpenStreetMap(Overpass) | ODbL 1.0 | `npm run map:fetch:range-a`;`bash tools/map-build/fetch-range-a-nodes.sh`;捷運:`tools/map-build/queries/range_a_rail.overpassql` | `data/osm/raw/range-a/` | 下載紀錄 `data/osm/raw/fetch_log.tsv`(腳本自動寫) | `tools/map-build/build.ts` | 0001、0012、0030 |
| 2 | OSM 號誌點 | OpenStreetMap(Overpass) | ODbL 1.0 | `bash tools/research/fetch_overpass.sh tools/map-build/queries/range_a_signals.overpassql data/osm/raw/range-a/range-a_signals.json` | `data/osm/raw/range-a/range-a_signals.json` | 2026-11-16 抓,3,045 點 | `build.ts`(`osmSignals`) | 0047 |
| 3 | 道路寬度 | 臺中市政府，data.gov.tw [83822](https://data.gov.tw/dataset/83822) | 政府資料開放授權第 1 版 | 直接下載:`https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c807c4ef-1942-4341-abbc-883fde09f8b2` | `data/gov/road-width/road_width_raw.csv` | 14,256,600 bytes;`0dcf6735f5ef8ae76a1c988faed81fc131726b5a08df46694132a56b745bd2b6` | `npm run map:widths:range-a` | 0011 |
| 4 | 千分之一道路圖 114 年版(中心線、道路面、特殊道路面、交叉路口、代碼說明) | 臺中市政府，data.gov.tw [162899](https://data.gov.tw/dataset/162899) | 政府資料開放授權第 1 版 | 索引 CSV(`rid=a6d0f454-1a01-4e8d-a742-9326335fe41e`)裡的 5 個 Google Drive 連結(Cooper 2026-11-16 同意經 Google Drive 下載政府資料);7z 用 `bsdtar -xf` 解壓 | `data/gov/roads/raw/`、`shp/` | 中心線 `be6b807b…c6d1`、道路面 `c295e76e…3e`、特殊道路面 `33fa125d…7a`、交叉路口 `f85d7be4…82`、代碼說明 PDF `0b671930…d1` | `tools/research/gov_road_centerline_csv.py` → `npm run map:lanes:range-a`;號誌檢查 `tools/research/signal_check.py` | 0046、0047 |
| 5 | 建物圖 114 年版(輪廓、地上樓層、房屋型態、結構) | 臺中市政府，data.gov.tw [158889](https://data.gov.tw/dataset/158889) | 政府資料開放授權第 1 版 | 索引 CSV(`rid=26a83c09-e67d-428e-bcd7-0af7a3f37ca2`)裡的 Google Drive 連結;`bsdtar -xf raw/buildings-114.7z -C shp`,檔名改成 `shp/01-SHP/b114.*` | `data/gov/buildings/` | 78,138,067 bytes;`950e5d06e6cd6296fd1d7d22b0cc3b13f5dbd12a203004775d049c462f4f508e` | `build.ts`(`govBuildings`,`tools/map-build/lib/gov-buildings.ts`) | 0039、0041 |
| 6 | 行道樹分佈圖(2020 版,KMZ) | 臺中市政府，data.gov.tw [109853](https://data.gov.tw/dataset/109853) | 政府資料開放授權第 1 版 | 索引 CSV(`rid=ee08e2b4-d538-4f76-a4a2-cdf3a0722858`)裡的 Google Drive 連結;`bsdtar -xf` 解出 `kmz/doc.kml` | `data/gov/trees/` | KMZ `0b76c209d244634901dcb2e0a19b1dfb26152cf12ee3e2ebdb4dfb9386a34076` | `python3 -I tools/map-build/gov_trees.py data/gov/trees/kmz/doc.kml data/gov/trees/trees-range-a.json <minE> <minN> <maxE> <maxN>`(範圍擴大後外框要跟著改) | 0042、0045 |
| 7 | 主要道路喬木植栽(2018,只做比對、沒採用) | 臺中市政府，data.gov.tw [108167](https://data.gov.tw/dataset/108167) | 政府資料開放授權第 1 版 | 直接下載 CSV(`rid=56fa93c4-0c2c-4210-9f6a-3c4033e91c23`) | `data/gov/trees/trees-108167.csv` | `4e6f2fd673147a4e8d320d35da8974463cc4e756fc4a976df8b9a26fcb184560` | — | 0042 |
| 8 | 20 m 數值地形模型(DTM) | 內政部，TGOS | 政府資料開放授權第 1 版 | `https://www.tgos.tw/MDE/VirtualDir_TC/Product/0f403233-b545-4e04-bcb1-0cbab476323f/分幅_臺中市DEM.zip` | `data/elevation/moi_dtm20_taichung/taichung_dem20.zip` | 30,528,530 bytes;`4032a0903878dc4223e4627cfe19e99fe5e6ace98dc3f3789c50876767b8f8ed`(`data/elevation/fetch_log.tsv`) | `npm run map:elevation:range-a`、`npm run map:skyline:range-a` | 0010、0019、0053 |
| 9 | 地標、知名地點 | 手寫設定 | — | 已在版控 | `data/landmarks/landmarks.json`、`places.json` | — | `build.ts`、`tools/models/landmark_*.py` | 0013、0031–0036、0054 |
| 10 | 手動覆寫(路寬) | 手寫 | — | 已在版控 | `data/overrides/road-width.json` | — | `build.ts` | 0011 |

## 下載紀錄(原本只在本機的部分)
- 建物圖:下載 2026-11-16,解壓後 `b114.dbf` 等 PolygonZ Shapefile;全市 1,263,194 筆。詳細欄位見 0039。
- 道路圖、行道樹 KMZ:下載 2026-11-16(Google Drive),sha256 如上表。
- 道路寬度：下載 2026-10-24,詮釋資料更新時間 2026-03-18。
- DTM:下載 2026-10-24,另有索引 `data/elevation/moi_dtm20_index/moi_dtm20_index.csv`(`1d62e354…dd0`)。

## 尚未解決
- 政府資料沒有下載腳本(要手動照上表下載、解壓、改名)。
- Google Drive 連結可能隨市府更新而改變;以 data.gov.tw 的詮釋資料 API(`https://data.gov.tw/api/v2/rest/dataset/<id>`)重新取得索引 CSV。
