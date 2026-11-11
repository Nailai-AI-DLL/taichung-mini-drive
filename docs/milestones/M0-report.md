# M0 技術驗證報告

- 日期:2026-10-12
- 範圍:臺中國家歌劇院周邊 1 km × 1 km(OSM 快照 2026-10-11T20:24:09Z)
- 驗收條件來源:`production-plan.md` §7 M0
- 實作決定與規劃書的差異:`docs/decisions/0006-m0-implementation.md`

## 驗收結果

| 驗收條件 | 結果 | 證據 / 重現方式 |
|---|---|---|
| 可連續開 5 分鐘無卡死 | **通過** | 瀏覽器:Chrome 實跑 300 秒,畫面凍結 0 次、行駛 3,515 m、0 個 console error(`npm run test:e2e -- --seconds 300`,報告 `tests/e2e/out/report-2026-10-11T20-46-44-610Z.json`;此 e2e 只能偵測整整 2 秒沒有新幀的凍結)。物理:5 分鐘模擬行駛 4.46 km,任 20 秒窗最短路程 275 m(門檻 > 60 m)、倒車脫困 0 次、翻車自動扶正 0 次(`tests/unit/soak.test.ts`) |
| 在 §6.3 指定硬體上平均 ≥ 58 fps | **指定硬體未驗證**(替代硬體達標) | 規劃書指定 M1 MacBook Air 等級,未實測(not_stated)。替代硬體 **Apple M1 Pro**、1920×1080:DPR 1 跑 300 秒平均 119.9 fps;**DPR 2(這台 Retina 實際的渲染解析度)** 跑 60 秒平均 120.0 fps、最長單幀 10.6 ms(`report-2026-10-11T20-54-50-584Z.json`)。兩者都被 120 Hz 螢幕鎖住,看不出真實餘裕,無法推估 M1 Air 的表現。因 Q4 是「只在自己電腦玩」,是否改以這台 M1 Pro 當驗收硬體,待 Cooper 決定 |
| 10 個測試點的路名牌與 OSM 一致 | **通過 10/10** | `tests/unit/road-name.test.ts`;測試點由 `tools/research/make_road_name_fixture.py` 直接從 OSM 原始資料產生,含臺灣大道三段、河南路三段、市政路、惠來路二段等;雙向道路反方向行駛也通過 |

其他檢查:

| 項目 | 結果 |
|---|---|
| 投影正確性(對照獨立的 Python 反算) | 5 點誤差皆 < 0.01 m |
| 路名防抖 0.5 秒 | 通過 |
| 可行駛路網最大連通分量 | 四捨五入後 100% 道路長度(共 3 個分量,另 2 個長度極短) |
| draw calls | 最多 19(預算 < 300) |
| 本機載入 | 320 ms(本機開發伺服器;「一般網路 < 10 秒」需部署後才能量,not_stated) |
| 單元測試 | 28/28 通過(`npm test`) |
| fps 取樣說明 | 「最差取樣」是每 2 秒讀一次的最近 600 幀平均(120 Hz 下約 5 秒),不是 10 秒窗 |
| 型別檢查 | 通過(`npx tsc --noEmit`) |

## 手感初版(Q7「輕快好甩好開」,待 Cooper 試開確認)

在空地上量測(`npx tsx tools/dev/handling-probe.ts`):

| 指標 | 初版數值 |
|---|---|
| 0–100 km/h | 5.2 秒 |
| 100–0 km/h 煞車距離 | 33.1 m |
| 20 km/h 最小迴轉半徑 | 5.2 m |
| 60 km/h 拉手煞車 + 滿舵 1 秒,車頭轉角 | 72° |
| 極速 | 130 km/h |

試開時按 ` 開啟調參面板即可即時調整,「複製目前參數」會把改過的數值複製下來。

## 風格樣張(方案甲「粉彩奶油」)

`docs/art/m0-style-sample/` 四張 1920×1080 截圖(`node tools/dev/screenshots.mjs` 可重拍):

1. `01-spawn-chase.png`:出生點,惠來路二段追尾視角
2. `02-opera-front.png`:歌劇院正面(目前是 OSM 輪廓擠出的方塊,正式地標模型在 M1)
3. `03-opera-near.png`:近距追尾視角
4. `04-top-view.png`:高空俯視,可看到道路、綠地、水道

## M0 地圖資料量

| 項目 | 數量 |
|---|---|
| 可行駛道路 | 145 條 way、20.6 km(有名稱 19.3 km) |
| 建築 | 155 棟(高度來自 height 11、樓層數 104、估計 40) |
| 綠地 / 水面 / 水道 | 13 / 1 / 6 |
| 建置產物 | map.bin 412 KB + map.json 約 28 KB(`public/map/m0/`) |

## 已知限制(留給 M1)

- 車是灰色方塊;MINI F55 正式模型、3 個 P0 地標模型都在 M1。
- 路寬尚未接入臺中市政府道路寬度資料(Q13),目前用預設寬度表。
- 沒有標線、路名牌模型、行道樹等道具。
- 地圖邊界是不可見的牆;柔性邊界在之後處理。
- 路名牌用系統字型;jf open 粉圓 在 M1 接入。
- fps 只在 M1 Pro 實測。
- 路名搜尋半徑已改為隨最寬道路自動放大(半寬 + 5 m,最少 15 m),避免 M1 接入政府路寬後在臺灣大道外側車道找不到路名。

## 過程中的返工(如實記錄)

- 車輪軸方向設反,油門讓車倒退;改為 (0,0,1) 後正常(0006 第 7 項)。
- 第一次 60 秒瀏覽器測試因缺 favicon 產生 404 console error 而失敗;加上內嵌 favicon 後通過。
- 獨立驗收指出 soak 測試的「卡住 < 10 秒」判定永遠不會失敗;已改成「任 20 秒窗路程 > 60 m」與「倒車脫困 ≤ 15 次」。
- 程式目錄結構與規劃書 §6.2 不同(M0 沒有 core/、world/、landmarks/、modes/、audio/,遊戲迴圈在 `src/main.ts`);M1 功能變多時再拆。

## 重做 M0 需要的檔案

- 資料:`data/osm/raw/m0/m0_area.json`(或 `npm run map:fetch:m0` 重抓)
- 管線:`tools/map-build/`
- 執行端:`src/`
- 測試:`tests/`、`tools/research/make_road_name_fixture.py`、`tools/research/twd97_to_wgs84.py`
- 決策:`docs/decisions/0006-m0-implementation.md`
