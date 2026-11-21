# 台中 MINI 開車遊戲:程式架構與工程品質審查

- 審查對象:`main` @ `02fb027`(git status 乾淨),重點為 `4d42ad4..HEAD` 的 16 個 commit(61 個 src/tools/tests 檔、+5817 / −650 行)
- 審查日期:2026-11-21
- 方式:只讀;實跑 `npx tsc --noEmit`、`npx vitest run`、`PERF_STRICT=1` 效能測試,並在 scratchpad 寫兩支量測腳本(`tile-apply-bench.ts`、`deps.py`)
- 標記:**[事實]** = 有檔案:行號、指令輸出或量測數字;**[推論]** = 從程式碼讀出來的風險,還沒實跑重現

---

## 1. 摘要

整體品質在個人或小團隊遊戲專案裡偏高。型別嚴格:`strict` 模式、src 沒有 `any`、tsc 0 錯誤。536 個單元測試全過,物理、串流、建置都有測試。這次重構把 main.ts 從 593 行降到 442 行,抽出 4 個子系統。分區串流(index.json + 1 km tile)的設計和測試都很扎實,包括「全部 tile 套用後與 world.json 100% 等價」的對拍測試。

主要風險集中在三處:

1. **資料與程式的版本沒有綁在一起。** map-data 是 force-push、沒有歷史的單一 commit,CI 一律拉最新一版,執行端也不檢查 `version`。
2. **串流的錯誤處理不一致。** 開場任一 tile 失敗,整個遊戲就載入失敗;執行中 tile 失敗則永久降級、不重試,而且沒有逾時。
3. **新功能缺少測試與文件。** 快速移動、WorldChunkManager、PickupSession 都沒有測試;README 還寫著「range A 已 commit」;16 個重構 commit 沒有新增任何 decisions 檔。

---

## 2. 優點

### P1. 型別與編譯紀律好 [事實]
- `tsconfig.json`:`strict: true`、`noUnusedLocals: true`,而且 include 涵蓋 `src`、`tools/map-build`、`tools/dev`、`tests`,建置端和測試也一起型別檢查
- `npx tsc --noEmit` 結束碼 0
- `src/` 與 `tools/map-build/` 中 `any` 出現 0 次,`ts-ignore`/`ts-expect-error` 0 次
- src 只有 2 處 `as unknown as`:`src/main.ts:386`(e2e 掛勾)、`src/debug/tuning-panel.ts:31`,都是邊界用途
- TODO/FIXME/HACK 0 個

### P2. 測試量大、跑得快、會打實際產物 [事實]
- `npx vitest run`:36 個檔案、536 個測試全過,耗時 28.5 s
- 測試涵蓋純邏輯,也直接驗證建置產物:
  - `tests/unit/map-tiles.test.ts:36`:index + 全部 tile 套用後,與 world.json 解碼的頂點數 100% 一致
  - `:96`:range-a 96 個 tile 的建築、樹、燈、號誌總數與 world.json 完全相等
  - `:127`:模擬 fetchWorld + TileStreamer 從出生點瞬移 4.9 km 的完整流程
- 有用到物理的測試:`soak.test.ts:15`(不卡死、不穿模、不出界)、`world-chunks.test.ts:187`(卸載後碰撞體一併移除)、`subsystems.test.ts:39`(車流運動學剛體)
- `tests/unit/surface-and-loader.test.ts:272` 也測了 map-data 分支的 push/pull 腳本(單一 commit、不殘留 .git)
- 效能門檻的設計有考慮實務:`world-chunks.test.ts:89-94` 全套平行跑用 150 ms、單獨跑用 50 ms,系統滿載時不比門檻。本次 `PERF_STRICT=1` 實測最密的一格為 **8.4 ms**

### P3. main.ts 拆分有效,子系統邊界清楚 [事實]
- main.ts:593 行 → 442 行(`git show 4d42ad4:src/main.ts | wc -l` 對照現行版本)
- 抽出的子系統:`WorldChunkManager`(`src/world/chunk-manager.ts`,139 行)、`TrafficSystem` / `TrafficPhysicsSync`(`src/traffic/traffic-system.ts`)、`PickupSession`(`src/game/pickup-session.ts`)、`PerfTracker`(`src/core/perf-tracker.ts`)
- `TrafficPhysicsSync` 和 `ChunkStreamer` 不依賴 three.js,可以直接在 Node 測試(`src/world/streamer.ts:2` 註解、`subsystems.test.ts`)
- 用 `scratchpad/review/deps.py` 統計頂層模組依賴:`physics`、`input`、`camera`、`core`、`config` 沒有往上依賴,屬於葉層

### P4. 分區串流設計合理,而且考慮到單幀成本 [事實]
- 兩層串流:1 km tile 管資料(`src/map/tiles.ts:470`,載入半徑 1200 m、卸載 4500 m、同時最多 6 個請求),250 m chunk 管網格(`src/world/streamer.ts:27`,800 m / 950 m、每幀 4 ms)。卸載半徑大於載入半徑,形成遲滯,避免在邊界來回重建
- 分散單幀負擔的機制:
  - 每幀最多套用 1 個 tile(`tiles.ts:503-520`)
  - 套用 tile 的那一幀不生成網格(`chunk-manager.ts:97`)
  - 街道傢俱分兩段生成(`streamer.ts:128-141`)
- 高架與地形有骨架保底:tile 還沒到時,250 m 內有地形或高架橋的格子先用骨架建碰撞體,避免掉下去(`streamer.ts:71-73, 106`)
- 量測(`scratchpad/review/tile-apply-bench.ts`,Node 環境):96 個 tile 的 `applyWorldTile` 平均 1.39 ms,最慢 6.5 ms(`3_1.json`)

### P5. 渲染批次化做得到位 [事實]
- 每一格的建築、屋頂附加物、傢俱、高架橋面、護欄合成同一個 mesh、同一個材質(`src/render/scene.ts:259-263`)。傢俱第二段生成時接到同一個 geometry 後面,draw call 不增加(`scene.ts:310-330`)
- 機車、樹、路燈、AI 車都用共用的 InstancedMesh(`ScooterLayer`、`PropLayer`、`TrafficLayer`;src 內共 31 處 InstancedMesh)
- 建築窗格、店面、夜景用 `onBeforeCompile` 在 shader 裡程序化產生(`src/render/building-material.ts:126-171`),不用貼圖,省記憶體也省下載
- 卸載時會 dispose geometry,共用的地標模型以 `userData.shared` 略過(`scene.ts:353-363`)。Rapier 碰撞體隨 body 一起移除(`src/physics/world.ts:88`)

### P6. 載入來源有彈性,失敗訊息清楚 [事實]
- 地圖來源優先序:`?mapUrl=` → `VITE_MAP_URL` → `BASE_URL/map`(`src/map/load.ts:78-87`)。有測試(`surface-and-loader.test.ts:33`)
- 沒有 index.json 時退回單一 world.json(`load.ts:153-160`)。elevation.json 是選用的,缺了就退回平面模式(`load.ts:28-55`)
- 地標 GLB 載入失敗時改用外框量體;也處理了 Vite 對不存在的檔案回 index.html 的情況(`scene.ts:373`)
- clone 後沒拉地圖時,測試 helper 會給出明確指示(`tests/helpers/load-map.ts:14`)

### P7. CI 在部署前先跑測試和建置 [事實]
- `.github/workflows/pages.yml`:pull map-data → `npm ci` → `npm test` → `npm run build`(含 `tsc --noEmit`)→ 部署到 Pages。有 concurrency 群組和 npm cache

---

## 3. 缺點

### 高

#### H1. 地圖資料與程式碼沒有版本綁定,無法重現舊版 [事實 + 推論]
- **事實:**
  - `tools/map-build/sync-map-branch.sh:72` 用 `git push --force` 推上單一無歷史 commit,舊資料直接覆蓋
  - CI(`pages.yml`)固定拉 map-data 的最新一版,不對應 main 的 commit
  - 17 個單元測試檔讀 `public/map/range-a`
  - index.json 有 `version: 2`(`src/map/types.ts:139`),但 `src/map/load.ts` 從頭到尾不檢查 version
- **推論:**
  - 只要先推新 schema 的地圖、程式還沒合併(或反過來),CI 測試和線上部署就會壞
  - 想回滾到舊 commit 也拿不到當時的地圖
  - 執行端讀到不相容的 schema 時不會明確報錯,只會出現奇怪的渲染或物理行為
- **建議:**
  1. map:push 時把內容 hash 寫進 `public/map/range-a/MANIFEST`,main 用一個小檔(例如 `map-data.lock`)記錄需要的 hash 或 commit,CI 依 lock 拉取並比對
  2. 改為保留歷史或加 tag,例如 `map-data-<日期>`,不再 force 覆蓋
  3. `fetchWorld` 檢查 `json.version`,不符合時顯示明確錯誤

#### H2. 開場載入沒有容錯:任一 tile 失敗就整個遊戲起不來 [事實]
- **事實:**
  - `load.ts:137-142` 用 `Promise.all` 一次抓出生點周圍 1500 m 內的 tile(range-a 約 16 個),任何一個 reject 都會冒到 `main.ts:438`,顯示「載入失敗」
  - 執行中 tile 失敗的處理卻是降級成只顯示道路骨架(`tiles.ts:542-546`),兩邊策略不一致
  - 所有 fetch 都沒有逾時(沒有 AbortController)
- **建議:**
  - 開場改用 `Promise.allSettled`,失敗的 tile 交給 TileStreamer 重試
  - 加上逾時,例如 15 s
  - 加一個測試:注入一個會失敗的 fetchFn,驗證遊戲仍能開場

#### H3. 執行中 tile 失敗後永久放棄,且沒有逾時 [事實 + 推論]
- **事實:**
  - `tiles.ts:545` 失敗時呼叫 `cat.available.delete(key)`,之後整場遊戲都不會再嘗試這個 1 km 區塊
  - fetch 沒有逾時,一個卡住的請求會一直佔住 `inFlight` 的名額(上限 6,`tiles.ts:456`)
  - 這條失敗路徑沒有單元測試
- **推論:** 手機或不穩的網路上,一次短暫斷線就會讓整個 1 km 區塊在這場遊戲裡只剩道路、沒有建築。這是玩家看得到的缺陷
- **建議:**
  - 改成指數退避重試,例如最多 3 次,間隔 2/4/8 s
  - fetch 加 AbortController 逾時
  - 補測試:第一次 reject、第二次成功時,這個 tile 最後要能套用

### 中

#### M1. 新功能缺測試:快速移動、WorldChunkManager、PickupSession [事實]
- **事實:**
  - 快速移動的整段邏輯(`startFastTravel`、`finishFastTravel`、`nearestGroundHit`、`describePoint`,`main.ts:157-211, 346-351`)寫在 main.ts 裡,沒有任何測試。bigmap.test.ts 只測座標換算(`:28`)
  - `grep` tests 中的 `chunk-manager|pickup-session|removeChunkMeshes|isAreaReady`:0 個檔案
  - e2e(`tests/e2e/run.mjs`)只測大地圖開關(`:266-268`),沒有點擊傳送,也沒有高架或地形檢查
- **建議:** 把快速移動抽成 `src/game/fast-travel.ts`,做成純函式加狀態機(pending、timeout、cancel),用假的 `isAreaReady` 測三種路徑。WorldChunkManager 可以注入 add/remove hooks,在 Node 測 tile 失效 → 重建時的成對呼叫

#### M2. 取消快速移動可能讓車子底下暫時沒有碰撞體 [推論,未重現]
- **依據:**
  - 預載期間每幀呼叫 `chunks.update(pendingTravel.x, …)`(`main.ts:348`),車子所在位置離目的地超過 950 m 時,周圍的 chunk(含地形和高架碰撞體)會被卸載
  - 按 Esc 取消後(`main.ts:250-253`)回到正常迴圈,但同一幀內物理步進(`main.ts:306-327`)排在 `chunks.update(p)`(`main.ts:360`)**之前**
  - 如果那一幀剛好套用了 tile,`allowGenerate=false`(`chunk-manager.ts:97`),網格和碰撞體還會再晚一幀才建
- 另外,5 秒逾時後即使目的地還沒就緒也會強制傳送(`main.ts:349`)
- **建議:** 取消時立即呼叫 `chunks.loadAll(車子位置)` 或等 `isAreaReady(車子位置)` 再恢復物理;或者預載期間不要卸載出發點 1 格半徑內的 chunk。用 e2e 驗證:開大地圖、點遠處、立刻按 Esc,觀察車子的 y 值

#### M3. 世界解碼邏輯重複兩份 [事實]
- `src/world/chunks.ts:243-293`(decodeWorld 的建築、傢俱解碼)和 `src/map/tiles.ts:309-394`(applyWorldTile)幾乎逐行相同:trees/signs/busStops/lights/signals/scooters 的量化還原、建築 `sharpFlags/placeWallRgb`、street 分格。空格判斷也有兩份(`chunks.ts:294` 的內嵌長條件 vs `tiles.ts` 的 `isChunkEmpty`)
- 目前有 `map-tiles.test.ts:36` 的對拍測試擋著,但每新增一種傢俱就要改兩處
- **建議:** 抽出 `decodeBuildings(list, at)`、`decodeFurniture(fu, at)`,兩邊共用

#### M4. 模組分層有雙向依賴,整合層放在 world/ 底下 [事實]
- `deps.py` 結果:`map ↔ world`、`render ↔ world` 都是雙向的值匯入
  - `src/map/tiles.ts:5-11` 從 `world/chunks` 匯入 `chunkKey/placeWallRgb/sharpFlags`;`src/map/load.ts:13-14` 匯入 `decodeWorld`、`GridElevationSampler`
  - `src/world/chunks.ts:4` 匯入 `map/elevated`;`src/world/streamer.ts:3` 匯入 `map/tiles`
  - `src/world/chunk-manager.ts:9-10` 直接匯入 `render/scene` 和 `physics/world`;`src/render/scene.ts:17` 又匯入 `world/gen/furniture`
- 目前沒有執行期循環問題(其中一邊是 type-only 或非頂層求值),但「資料層(map)/ 生成層(world/gen)/ 整合層」的界線很模糊
- **建議:**
  - 把 `chunkKey`、量化工具、`decodeWorld` 移到 `map/decode.ts`
  - 把 `chunk-manager.ts` 移到 `src/game/` 或新的 `src/runtime/`,當作唯一同時碰 render 和 physics 的整合層
  - 用 dependency-cruiser 或 eslint `import/no-cycle` 守住分層

#### M5. 執行端每幀可能有不受預算控制的主執行緒工作 [事實 + 推論]
- **事實:**
  - `applyWorldTile` 最慢 6.5 ms,同一個 tile 的 `JSON.parse` 7.3 ms(Node 量測,`tile-apply-bench.ts`)
  - `res.json()` 的解析發生在 fetch 回應那一刻,不在 4 ms 預算裡
  - 開場 `decodeWorld(index.json)` 66.6 ms,index 解析 14.9 ms
  - 高架傳送會呼叫 `chunks.loadAll`(`main.ts:142`),這是無上限的同步生成(`streamer.ts:147-149`,預算 Infinity)
  - 整個專案沒有 Web Worker(`grep "new Worker"` 0 筆)
- **推論:** 低階裝置或大 tile 抵達時,很可能突破 33 ms。e2e 有「高速穿越不超過 33 ms」的檢查(`run.mjs:142`),但只在本機 Chrome 上跑
- **建議:** 把 tile 解析和 `buildChunk`(純計算、輸出 TypedArray)移到 Worker,用 transferable 回傳;短期可以先把 `loadAll` 改成「只同步建 250 m 內」

#### M6. 資料記憶體幾乎不會釋放 [推論]
- **依據:** tile 卸載半徑 4500 m(`tiles.ts:455`),地圖範圍 8.2 × 8.0 km,中心到角落約 5.7 km。玩家在市區活動時,幾乎所有 tile 會累積留在 `world.chunks`(96 個 tile,JSON 共 31 MB,解碼後的物件更大)。網格層有在 950 m 卸載,但資料層沒有
- **建議:** 用 Chrome DevTools heap snapshot 量 10 分鐘巡迴後的 JS heap,再決定卸載半徑要不要降到 2500 m 左右(需要和重抓 tile 的成本權衡)

#### M7. 文件與實作脫節 [事實]
- README.md:55 寫「range A 已 commit,不需下載就能跑」,實際上已被 `.gitignore`(`public/map/range-*/`)排除。clone 後照 README 的 `npm install && npm run dev`,畫面會顯示「載入失敗」。README 完全沒有提到 `map:pull`、`map:tile`、`map:elevation`、`map:push`
- `git diff --stat 4d42ad4..HEAD -- docs`:16 個重構 commit 只新增了 `docs/research/map-expansion.md` 和美術圖。`docs/decisions/` 停在 0047,沒有記錄 orphan 分支、tile 串流、DTM、高架、快速移動的決策
- 程式碼註解也有過期的地方:
  - `load.ts:71` 寫預設 900 m,實際是 `load.ts:128` 的 1500
  - `map-tiles.test.ts:88` 測試名稱寫「index.json < 2 MB」,實際是 2,414,677 bytes,而且測試沒有斷言大小
  - `:127,:177` 寫「全區 48 區」,實際是 96 區
- **建議:** 補 README 的快速上手(第一步加 `npm run map:pull`)、補 0048 起的 decisions 檔、修正上述註解,並在測試中真正斷言 index.json 的大小

### 低

#### L1. 有檔案超過 600 行,其中一個函式有 757 行 [事實]
- 超過 600 行的檔:
  - `tools/map-build/build.ts` 953 行,其中 `main()` 從第 111 行到第 868 行,約 757 行
  - `tools/map-build/lib/street.ts` 693 行
  - `src/world/chunks.ts` 622 行
- src 其他檔都在 557 行以下
- **建議:** 把 build.ts 的 main 拆成 fetch → roads → buildings → street → furniture → write 幾個階段,每個階段一個函式

#### L2. 建置流程有「就地改寫產物」的步驟 [事實]
- `tools/map-build/tile.ts:16-21` 會計算高架資料並**改寫 world.json**,再切 tile。`elevation.py` 又讀 index.json。步驟順序有隱含依賴,README 沒寫
- **建議:** 加一個 `map:all:range-a` 腳本固定執行順序;tile.ts 改成只讀 world.json,不再寫回

#### L3. 設定值分散 [事實]
- `src/config/` 有 9 個檔(buildings/furniture/look/palette/pickup/props/street/traffic/viaduct),但下列數值不在裡面:
  - 串流參數:`streamer.ts:27`、`tiles.ts:453`、`load.ts:128`
  - 快速移動參數:`main.ts:204,348,349` 的 350 m / 24 ms / 5000 ms
  - 物理摩擦係數:`physics/world.ts:56,64,80`
- **建議:** 新增 `src/config/streaming.ts`、`src/config/physics.ts`

#### L4. shader 用字串替換注入,沒有守護測試 [事實 + 推論]
- `building-material.ts:149-170` 用 `.replace('#include <color_fragment>', …)` 改寫 three 內建 shader。`package.json` 中 `three` 是 `^0.186.1`,允許小版本升級
- 如果 three 改了 chunk 名稱,`replace` 會靜默失效,外觀退化或編譯錯誤。`building-material.test.ts` 沒檢查替換有沒有命中
- **建議:** 鎖定 three 的精確版本;或在測試中呼叫 onBeforeCompile,斷言替換後的字串包含 `vWall`

#### L5. 產物和依賴的小問題 [事實]
- dist 只有一個 JS chunk:`index-stpiE5rZ.js` 5,314,448 bytes,gzip 後 1,945,917 bytes。沒有 `manualChunks` 拆出 rapier/three,lil-gui 除錯面板也一起打包(`grep` 命中 52 處)
- dist 建於 10:31,HEAD commit 在 10:57,所以 dist 不是最新版,數字只能當量級參考
- `dist/map/range-a` 有 66 MB,其中 32 MB 的 world.json 只在 `?tiles=off` 或 index 失敗時才會用到,卻每次都部署
- `earcut` 在執行端使用(`src/world/gen/mesh.ts:3`),卻放在 devDependencies
- 沒有 ESLint 或 Prettier 設定
- **建議:**
  - `lil-gui` 改成 `?debug` 時才 `import()`
  - 用 manualChunks 把 rapier 拆出來,方便快取
  - 評估部署時排除 world.json,或改成只在本機使用
  - 把 earcut 移到 dependencies
  - 加上 eslint(至少 `import/no-cycle` 和 `no-floating-promises`)

#### L6. 全域可變狀態與生產環境的測試掛勾 [事實]
- `render/scene.ts:197-201` 有模組層級的單例(`groundMat/buildingMat/scooters/props`),不利於多世界或測試隔離
- `window.__game`(`main.ts:386`)在正式站也會暴露 teleport 等功能。單人遊戲影響不大,但建議用 `import.meta.env.DEV || ?e2e` 控制
- src 有 10 處 addEventListener、0 處 removeEventListener。目前是單頁、不重建,影響不大

#### L7. 隨機性不可重現 [事實]
- `Math.random` 直接注入 Traffic 和 PickupGame(`traffic-system.ts:56`、`pickup-session.ts:56-59`)。單元測試可以自行注入,但 e2e 和實機回報的問題無法用同一個 seed 重現
- **建議:** 支援 `?seed=`,改用可設定種子的 PRNG

---

## 4. 建議優先順序

| 順序 | 項目 | 理由 | 預估工作量 |
|---|---|---|---|
| 1 | H1 地圖資料版本鎖 + 執行端 version 檢查 | 影響 CI、部署、回滾,改動小 | 0.5–1 天 |
| 2 | H2 + H3 tile 載入容錯(allSettled、重試、逾時)+ 測試 | 玩家看得到的缺陷,單一檔案就能改完 | 0.5 天 |
| 3 | M7 README 快速上手 + 補 decisions 檔 + 修過期註解 | 新人或較弱的模型照文件做會直接失敗 | 0.5 天 |
| 4 | M1 + M2 抽出 fast-travel 模組 + 測試;修取消時的碰撞體空窗 | 最新功能沒有防護網 | 1 天 |
| 5 | M3 去除重複的解碼程式 | 降低新增圖層時漏改的風險 | 0.5 天 |
| 6 | M5 Worker 化 tile 解析和 buildChunk | 效能天花板,工作量最大 | 2–4 天 |
| 7 | M4 / M6 / L 系列 | 長期維護 | 視情況 |

工作量為推論,僅供排程參考;實際優先順序由 Cooper 決定。

---

## 5. 附錄:數字

| 項目 | 數值 | 來源 |
|---|---|---|
| tsc | 結束碼 0 | `npx tsc --noEmit; echo $?` |
| vitest | 36 檔、536 測試全過、28.48 s | `npx vitest run` |
| 最密的一格生成(嚴格模式) | 8.4 ms(門檻 50 ms) | `PERF_STRICT=1 npx vitest run tests/unit/world-chunks.test.ts -t 最密的一格` |
| src 檔案數 / 總行數 | 61 檔 / 11,209 行 | `find src -name '*.ts' \| xargs wc -l` |
| main.ts 行數 | 593 → 442 | `git show 4d42ad4:src/main.ts \| wc -l` |
| 超過 600 行的檔 | build.ts 953、street.ts 693、chunks.ts 622 | `wc -l` |
| `any` / ts-ignore / TODO | 0 / 0 / 0(src、tools/map-build) | grep |
| `as unknown as`(src) | 2 | grep |
| 頂層模組雙向依賴 | map↔world、render↔world | `scratchpad/review/deps.py` |
| range-a 地圖 | world.json 32 MB、index.json 2.41 MB、96 個 tile 共 31 MB(平均 332 KB、最大 825 KB)、elevation.json 184 KB | `du`、`ls -l` |
| index.json 解析 / decodeWorld | 14.9 ms / 66.6 ms(Node) | `scratchpad/review/tile-apply-bench.ts` |
| applyWorldTile | 平均 1.39 ms、最慢 6.5 ms(JSON.parse 另計 7.3 ms) | 同上 |
| range-a 格子數 | 1,120 個 250 m chunk | 同上 |
| 打包 JS | 5,314,448 B / gzip 1,945,917 B,單一 chunk | `dist/assets`(較 HEAD 舊 26 分鐘) |
| dist 總大小 | 77 MB(map 66 MB、models 5.1 MB) | `du -sh dist/*` |
| 依賴 | three 0.186.1、rapier3d-compat 0.21.0、flatbush 4.6.2、lil-gui 0.21.0;TypeScript 7.0.2、Vite 8.3.4、Vitest 5.0.3 | `npm ls --depth=0` |
| e2e | 約 20 項檢查(載入 < 10 s、fps ≥ 58、draw calls < 300、穿越無 > 33 ms 卡頓、小地圖、大地圖暫停、路燈碰撞、接送流程、無 console error);需要有畫面的 Chrome,不在 CI | `tests/e2e/run.mjs` |
| CI | pages.yml:pull map → npm ci → test → build → deploy;沒有 lint,沒有 e2e | `.github/workflows/pages.yml` |
| 遠端 map-data 分支 | `b13ef99`;與本機 public/map 是否一致:not_stated(依規定不下載,未比對) | `git ls-remote` |

### 量測腳本(可重跑)
- `(審查暫存資料夾)/tile-apply-bench.ts`:`npx tsx <path>`,量 index 解碼和各 tile 套用的耗時
- `(審查暫存資料夾)/deps.py`:`python3 -I <path> <repo>`,輸出頂層模組依賴與雙向依賴
