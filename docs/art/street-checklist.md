# 街道細節操作手冊(標線、穿越道、分隔島、路緣)

決策與理由見 `docs/decisions/0015-street-visual-upgrade.md` §7;法規數值見 `docs/research/road-markings-tw.md`。

## 檔案地圖

| 要改什麼 | 檔案 |
|---|---|
| 線寬、虛線長度、停止線淨距、枕木紋尺寸、「哪條路畫哪種線」的門檻 | `src/config/street.ts` |
| 標線怎麼排(lanePlan)、路口範圍、穿越道、分隔島配對 | `tools/map-build/lib/street.ts` |
| 範圍(樣張區 / 全區) | `tools/map-build/build.ts` 的 `AREAS[...].detail` |
| 顏色(標線米白 / 淡黃、路緣、分隔島綠) | `src/config/palette.ts` 的 `markWhite` `markYellow` `curb` `median` |
| 圖層高度、執行端展開(虛線切段、枕木紋、分隔島四邊形) | `src/world/chunks.ts` 的 `Y_*`、`decodeStreet` |
| 圖層前後的深度偏移 | `src/render/scene.ts` 的 `GROUND_DEPTH_BIAS` |

## 擴大到整個範圍 A

1. `tools/map-build/build.ts`:把 `detail: { center: OPERA_HOUSE, half: 500 }` 改成涵蓋全區(例:`half: 3400`),或拿掉範圍限制。
2. `npm run map:build:range-a`,看終端的 `streetStrips` / `streetCrosswalks` / `streetMedians`,以及 world.json 的 gzip 大小(上限見 `tests/unit/world-chunks.test.ts`,目前 < 3 MB)。
3. `tests/unit/street.test.ts` 的「樣張區」測試會自動改測新範圍;比例門檻(標線 < 1%、分隔島 < 2%)若超過,先看是哪幾條路(測試裡的 `onSurfaces` 可以印出路名),不要直接放寬門檻。
4. `npx vitest run`、`npm run test:e2e`(fps ≥ 58、draw call < 300、高速穿越無 > 33 ms 卡頓)。
5. 拍照對照:`node tools/shots/street-shots.mjs docs/art/street-sample/<新資料夾>`,機位在腳本的 `SHOTS`;要看別處就加一筆 `{ name, view: { x, y, z, lx, lz } }`(世界座標,北 = -z)。

## 改標線規則後的檢查

- 新規則先在 `tests/unit/street.test.ts` 的合成資料(十字路口、對向單行道)加一條測試。
- 停止線要在**右半邊**(台灣靠右):往 +x 行駛時右手邊是 +z。
- 單行道的折線在建置時已轉成行車方向(`oneway=-1` 會反轉)。

## 常見問題

| 現象 | 原因 / 處理 |
|---|---|
| 某段路沒標線 | 路寬 < 5.5 m,或雙向 < 8 m(`MARK_MIN_W`、`CENTER_MIN_W`);路寬來源見 0011 |
| 分隔島蓋到車道 | 同名平行 way 超過 2 條(例:臺灣大道);`medians()` 會檢查中間有沒有別條路,檢查失效時「分隔島不壓路面」測試會失敗 |
| 標線穿過路口 | 兩條路沒有共用 OSM node(立體交叉或資料錯誤);「標線不畫在橫交道路上」測試會量到比例 |
| 直路中間突然斷標線、多一條停止線 | 換段改名或過橋被當成路口:延續判定見 `CONTINUE_SIN` 的說明(同名,或只有兩條路頭尾相接) |
| 修了一個路口規則後別處變怪 | 先用實際資料量化前後差異(缺標線長度、多出的停止線數),不要只看合成測試 |
| 遠處標線閃爍 | 深度偏移不夠;調大 `GROUND_DEPTH_BIAS`,注意太大會讓遠處建築牆腳被路面蓋住 |
| 路口中央露出淺色帶 | 平行 way 之間的空隙沒鋪到:用 `node tools/shots/peek.mjs x y z lx lz out.png` 近拍;鋪面只補「同名平行單行道之間、被同一條橫交道路穿過」的空隙(`junctionPatches`) |
| 偶爾卡一下 | `node tools/perf/frame-spikes.mjs 90` 看最慢 5 幀與前一幀分項;分項加總很小 = 時間在 GC / GPU / 合成器 |
| 截圖全是舊畫面 | 內建瀏覽器面板被隱藏時頁面停止繪製;改用 `tools/shots/street-shots.mjs`(自己開 Chrome 視窗) |
