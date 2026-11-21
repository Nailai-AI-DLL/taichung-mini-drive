# 0057 地圖下載的網路容錯與地圖版本綁定

日期:2026-11-21
狀態：已實作;第一個版本 `20261121-142853-b13ef99`(= 當時 map-data 分支 b13ef99)已建立

## 背景
- 2026-11-21 審查(`docs/reviews/2026-11-21-project-review.md`)建議順序第 3 項:
  - H6:開場任一分區失敗整個遊戲起不來(`Promise.all`);遊戲中分區失敗就永久放棄(從 `available` 刪掉);請求沒有逾時。
  - H5:map-data 分支每次 force-push 覆蓋,CI 一律拉最新,舊版無法重現;執行端不檢查格式版本。
- Cooper 原話:「接送模式不能快速移動沒問題，接著做第 3 項」。實作細節是純技術選擇，依守則自行決定並記錄於此。

## 決定:網路容錯(H6)
- 新增 `src/map/fetch-retry.ts`:
  - `fetchWithTimeout`:單一請求 15 秒逾時(AbortController)。
  - `fetchRetry`:網路錯誤、逾時、5xx 重試(預設再試 2 次,等待 1 s、2 s);4xx 直接丟 `HttpError`,不重試。
  - `retryBackoffMs`:串流分區失敗後等待 2 s、4 s、8 s…,上限 60 s。
- `src/map/load.ts`:
  - `index.json` 用 `fetchRetry`;只有 4xx(沒有分區版)才退回 `world.json`,網路失敗則丟出「網路不穩…請重新整理」,不再改抓 31 MB 的 world.json。
  - 開場分區改用 `Promise.allSettled`:失敗的分區不擋開場，留在 `available` 給串流重試。
  - 單一分區只做逾時，不在這裡重試(重試交給 TileStreamer,避免開場等太久)。
  - `elevation.json` 也加逾時與 1 次重試;world.json 逾時放寬到 120 秒。
  - `doFetch` 改成呼叫時才取全域 `fetch`,方便在瀏覽器裡替換 fetch 模擬斷線。
- `src/map/tiles.ts` `TileStreamer`:失敗不再刪除分區;記在 `failures`(次數、下次重試時間),依 `retryBackoffMs` 重試;只有 4xx 才永久放棄。
- 斷線期間玩家看到的：該區只有道路骨架(地形與道路碰撞照常),連線恢復後自動補上建築。

## 決定:地圖版本綁定(H5)
- `tools/map-build/sync-map-branch.sh`:
  - `push`:照舊覆蓋 `map-data` 分支，另外推一個**不覆蓋**的版本 ref `refs/map-versions/<UTC 時間>-<commit 前 7 碼>`,並寫入 main 根目錄的 `map-data.lock`(`id=`、`commit=`)。
  - `pull`:預設照 lock 拉 `refs/map-versions/<id>`,並核對 commit 與 lock 相同，不同就失敗;`--latest` 拉分支最新版;沒有 lock 時警告並拉最新版(相容舊流程)。
  - `lock`:把分支目前那版存成版本 ref 並寫 lock,不重新上傳(第一次建立用)。
- 新增 npm 指令:`map:pull:latest`、`map:lock`。CI(`pages.yml`)仍呼叫 `pull`,有 lock 後自動拉鎖定版。
- 執行端 `MAP_FORMAT_VERSION = 2`(`src/map/load.ts`):`index.json` / `world.json` 的 `version` 不符就丟出錯誤並提示 `npm run map:pull`。改地圖格式時兩邊要一起加 1。

## 放棄的方案
- 用 git tag 存版本：一般 clone 會連 tag 一起抓，舊地圖(每版約 30 MB 以上)會讓 clone 越來越大;自訂 `refs/map-versions/` 不會被一般 clone 抓。
- map-data 分支保留歷史(不 force-push):clone 時同樣會抓到全部歷史。
- 斷線時顯示畫面提示：這次只在 console 記錄;要不要加畫面提示屬體驗決策，未做。

## 代價與後續
- 每次 `map:push` 都會在 GitHub 多留一份地圖(只放在 `refs/map-versions/`,一般 clone 不會下載)。量大時可刪掉舊的 ref(`git push origin :refs/map-versions/<id>`)。
- 已知限制：除錯用的 `window.__game.teleport` 不等地圖就瞬移，斷線時車子可能穿過地面;玩家用的大地圖快速移動會先等地圖(最多 5 秒),實測沒有這個問題。

## 實作時踩到的問題
- 第一次 `npm run map:lock` 用了沒有推送權限的 gh 帳號，推送 403 失敗，但腳本仍寫出 lock。原因:macOS 內建 bash 3.2 的 `$( )` 不繼承 `set -e`(也不支援 `inherit_errexit`)。
- 修正:`lock` 改用子 shell `( … )` 執行並把結果寫檔;`lock` 也比照 `push` 自動切換到 Nailai-AI-DLL 帳號再切回。單元測試加了「推送失敗不可寫出 lock」。

## 驗證
- 2026-11-21 實際用 lock 從 GitHub 拉地圖到暫存資料夾:`index.json`、`elevation.json` 與本機相同,96 個分區檔齊全。
- 單元測試 `tests/unit/map-network.test.ts`(12 項):重試與 4xx 不重試、退避時間、逾時中止、TileStreamer 失敗→退避→成功套用、404 才放棄、開場部分失敗仍可進遊戲、index 網路失敗不退回 world.json、格式版本不符報錯、目前地圖格式 = 2。
- `tests/unit/surface-and-loader.test.ts` 同步腳本測試(本機 bare repo):push 兩次後舊 lock 仍拉得到第 1 版、`--latest` 拉第 2 版、版本 ref 有 2 個、lock commit 被改就拒絕、`lock` 指令寫入分支目前的 commit。
- 全部 550 個單元測試通過,`npx tsc --noEmit` 通過。
- 內建瀏覽器實跑(2026-11-21):
  - 遊戲中把分區請求全部改成失敗後瞬移到遠處:8 個分區在 7 秒內各試 2 次(退避);恢復連線後 12 秒內 8 個全部補載成功，畫面建築出現。
  - 斷線時用大地圖快速移動：等 5 秒後移動，車子停在路面(y ≈ 3.2),沒有掉下去;console 無錯誤。
