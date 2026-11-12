# 0024 路燈減半、每個路口放紅綠燈

日期:2026-11-12
狀態:已實作

## 背景
Cooper:「我想減少路燈的數量,然後在每個路口放上紅綠燈」。
原本:路燈主要道路每 32 m 一支(寬路兩側交錯),全區 6,446 支;紅綠燈只放在 OSM 標了 `crossing=traffic_signals` 的穿越道兩端,全區 578 支,很多路口沒有。

## 決定
- 路燈:`LIGHT_SPACING` 32 → 64 m。結果 3,221 支(約減半)。減多少 Cooper 沒指定(not_stated),先取減半,可再調。
- 紅綠燈:地圖建置畫停止線時記下「進入路口的方向」(`tools/map-build/lib/street.ts` 的 `approaches`)。
  `intersectionSignals`(`tools/map-build/lib/furniture.ts`)篩選:
  1. 這條路是「大路」:等級 trunk / primary / secondary / tertiary,**或**同名道路最寬處 ≥ 10 m(`SIGNAL_MIN_WIDTH`)。
  2. 60 m 內(`SIGNAL_PARTNER_R`)有另一條方向交叉(夾角 > 約 45°)、不同路名的大路也在畫停止線 → 這裡是路口。
  3. 立在停止線旁、行車方向右側路緣外 0.7 m、往後退 1 m,懸臂伸向車道(長 = 路面半寬 × 0.7,最多 5 m)。
  之後 OSM 標了號誌的穿越道,離已立的號誌 ≥ 12 m 才另外補(例如路段中間的行人號誌)。
  結果全區 2,027 支(原 578)。
- 第一版只看道路等級,只多了 236 支、出生點(七期惠來路)270 m 內都沒有:OSM 把七期很多寬馬路標成 residential(惠來路二段 12 m、市政北二路 12 m)。改成「等級或路寬」才涵蓋。
- 窄巷口不放(兩條路都要是大路):「每個路口」照字面連巷口都放會很怪;門檻 10 m 可調。

## 放棄的方案
- 用路口路面(junction patches)找路口:只有分隔島道路才有 patch,一般十字路口沒有。
- 每個路口四個角各放一支:不管有幾個進入方向都放四支,T 字路口會多出沒用的;依進入方向放,T 字路口自然是三支。

## 驗證
- 單元測試 `tests/unit/intersection-signals.test.ts` 5 項:十字路口四支且位置朝向正確、窄巷口不放、OSM residential 的寬路要放、分隔島單向車道看同名最寬、同路對向 / 孤立停止線不算路口、燈距 64。`tests/unit/furniture.test.ts` 的窄路路燈測試道路加長到 640 m(64 m 間距下 320 m 只放得下 5 支)。全部 252 項通過。
- 建置統計(`npm run map:build:range-a`):`signalApproaches` 3,895、`signalAtIntersections` 1,864、`furnitureSignals` 2,027、`furnitureLights` 3,221。
- 畫面:`docs/art/signals-every-intersection.jpg`(出生點旁 T 字路口,三個進入方向各一支)。
- e2e:通過兩次;第二次串流 p99 16.7 ms、0 幀超過 33 ms(第一次 p99 27.8 ms,重跑後正常,判定為雜訊)。
