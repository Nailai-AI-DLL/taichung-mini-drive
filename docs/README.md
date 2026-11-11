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
4. `decisions/` — 每個重要決策一檔,含放棄的方案與理由
   - `0001-map-data-source.md` 地圖資料來源(已決定)
   - `0002-tech-stack.md` 技術選型
   - `0003-licensing-research-method.md` 授權調查的方法與取捨
   - `0004-osm-feasibility-research-method.md` OSM 實查的方法與取捨
   - `0005-cooper-direction-v0.2.md` Cooper 對規劃書 14 題的拍板與放棄的選項
   - `0006-m0-implementation.md` M0 實作決定(與規劃書的差異)
   - `0007-m0-feedback.md` M0 試開回饋與 M1 建模工具提案
   - `0008-mini-model-approach.md` MINI 模型製作路線重新評估(提案,待 Cooper 決定)
   - `0009-slop-newyork-adoption.md` 參考 mrdoob/slop-newyork 的借用清單(技術項已定,品味項待 Cooper)
   - `0010-terrain-and-rail.md` 範圍 A 地形與高架鐵路處理(已決定:平面、鐵路先不做)
   - `0011-road-width-mapping.md` 政府路寬對應方式與換算(已決定)
   - `0012-world-data-v2.md` 地圖資料格式 v2(只傳 2D)與分塊生成(已決定、已實作)
   - `0013-landmark-pipeline.md` 地標管線(設定、挖掉原建築、Blender 外框、替代量體、碰撞)
   - `0014-minimap.md` 小地圖(Canvas 2D + 離屏快取;外觀 Cooper 已拍板)
   - `0015-street-visual-upgrade.md` 城市、馬路、街道畫面優化(方向 A 已定;第一、二批鋪到全區;第三批建築樣張完成，待 Cooper 看樣張)
5. `milestones/M0-report.md` — M0 驗收報告
   `milestones/M1-plan.md` — M1 實作計畫(待 Cooper 確認)
6. `art/m0-style-sample/` — 方案甲風格樣張截圖
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
- `data/osm/raw/` 的 OSM 原始資料 + `tools/research/` 的統計腳本 → 可重現所有資料統計
- `research/` 兩份調查的來源 URL → 可重新查證授權結論
- `decisions/` → 了解每個選擇為何如此、放棄了什麼

## 文件規則

- 修改 `docs/` 下既有規格檔前,先建立 `.bak` 副本。
- 決策與放棄的方案寫進 `decisions/`,編號遞增。
- 查不到的資料寫 not_stated,不腦補。
