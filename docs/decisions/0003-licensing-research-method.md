# 0003 授權調查的取證方法與判讀原則

- 日期:2026-10-12
- 狀態:已採用(純技術/研究方法決定,可逆;不涉及商業取捨)
- 相關文件:`docs/research/data-licensing.md`

## 決定

1. **只以一手來源下結論**:條款原文(Google Cloud / Google Developers / OSMF / Open Data Commons / data.gov.tw / 全國法規資料庫 / GitHub 上游 LICENSE)。二手文章只作線索,引用時標「二手」。
2. **Google 長頁面用 curl + pandoc 轉純文字後 grep**,不用 WebFetch(會截斷,讀不到 §3.2.3)。
3. **動態網站(國土測繪中心多維度平臺、TGOS)用瀏覽器讀取渲染後內容**,不猜測。
4. **能實測的就實測**:臺中市道路寬度 CSV 實際下載統計;TWD97 座標以自寫換算腳本(`tools/research/twd97_to_wgs84.py --selftest`)抽查落點。
5. **計費結論不估算**:Google 3D Tiles 計費單位官方文字不一致,只列價目表與驗證步驟,不寫成本數字(全域守則:涉及金額須附實跑驗證)。
6. **GLB/JSON 判為 Derivative Database(保守)**:OSMF 指引以「是否可抽回原始資料」區分,GLB 頂點可還原 footprint,故保守歸類。

## 放棄的方案

- **以 Google 街景/3D Tiles 作為建模參考的「灰色地帶」路線**:條款對「僅目視參考」無明文,但對描繪、重建 3D(含人工)有明文禁止;改建議以自有照片或開放授權照片當參考,成本低且無爭議。
- **把國土測繪中心 3D 建物模型列為開放資料來源**:平臺已公告改為收費供應、實體下載僅測試圖資,服務條款未明示可用於遊戲,故不列入主線。
- **對商標/著作權問題給明確可否結論**:屬法律意見,僅整理條文與常見做法,交由 Cooper 決定是否諮詢律師。

## 未決(交 Cooper)

見 `docs/research/data-licensing.md` §7.3。
