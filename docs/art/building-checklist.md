# 建築變化操作手冊(細分類、窗格、店面、廟宇、屋頂附加物)

決策與理由見 `docs/decisions/0015-street-visual-upgrade.md` §10。

## 檔案地圖

| 要改什麼 | 檔案 |
|---|---|
| 細分類的門檻(透天 / 大樓的樓層與面積)、窗格尺寸、店面判定距離、附加物機率與尺寸、廟宇屋頂 | `src/config/buildings.ts` |
| 各細分類的牆色與屋頂色、玻璃明暗、店面深色、鐵皮與水塔顏色 | `src/config/palette.ts` 的 `buildingKinds` `glassDark` `glassLight` `shopfront` `roofShed` `roofTank` |
| 哪個 OSM 標籤算哪一類、哪些 amenity 算商店、臨大路判定 | `tools/map-build/lib/buildings.ts` 的 `buildingKind` `hasShopTags` `nearWideRoad` |
| 窗格、店面、牆腳壓暗怎麼畫(著色器) | `src/render/building-material.ts` |
| 屋頂附加物、廟宇屋頂的幾何與擺放 | `src/world/gen/roof-props.ts` |
| 建築代碼(細分類 + 店面 + 種子)的打包 | `src/world/gen/mesh.ts` 的 `packBuildingCode`;廟宇一律柱廊的規則在 `src/world/chunks.ts` 的 `buildingCode` |

## 改了之後要做什麼

| 改的是 | 要重新建置地圖? | 檢查 |
|---|---|---|
| 顏色、窗格尺寸、店面高度 / 柱距、附加物機率與尺寸、廟宇屋頂 | 不用(執行端) | 重新整理頁面 → 拍照對照 |
| 細分類門檻、OSM 標籤對應、店面判定距離(`SHOP_REACH` `SHOP_ROAD_MIN`) | 要:`npm run map:build:range-a` 與 `npm run map:build:m0` | 看終端的 `buildingKind_*`、`buildingShopfront` |

每次都跑:

1. `npx vitest run`(`tests/unit/buildings.test.ts` 有類別分佈、店面比例 10–50%、附加物不出屋頂的實際資料檢查)。
2. `npm run test:e2e`(fps ≥ 58、draw call < 300、高速穿越無 > 33 ms 卡頓)。
3. `node tools/shots/street-shots.mjs docs/art/building-sample/<新資料夾> buildings`,和 `docs/art/building-sample/after/` 比。機位:b01–b04 街景、b05 舊城區俯瞰、b06 七期、b07 廟宇、b08 學校、b09 透天屋頂。
4. 要看別處:`node tools/shots/peek.mjs x y z lx lz out.png`(世界座標,北 = -z)。

## 加一個細分類

1. `src/config/buildings.ts`:`KIND` 加一項,`KIND_COUNT` 加 1,`WINDOW_STYLE` 加一列。
2. `src/config/palette.ts`:`buildingKinds` 照順序加一組 `{ walls, roof }`。
3. 建築代碼的細分類只有 3 位元(0–7);超過 8 類要改 `packBuildingCode` 與著色器裡的 `mod(code, 8.0)`、`code / 8.0`、`code / 16.0`。
4. `tools/map-build/lib/buildings.ts` 的 `buildingKind` 加對應規則,`tests/unit/buildings.test.ts` 加一條。

## 常見問題

| 現象 | 原因 / 處理 |
|---|---|
| 某面牆的窗擠成一團或拉得很寬 | 沿牆距離 u 不連續;`extrude.ts` 的 `addWalls` 要有收尾頂點(測試「沿外牆一路累加到周長」) |
| 遠處建築閃爍、出現波紋 | 窗格週期太小;調 `building-material.ts` 裡 `blurU` / `blurY` 的門檻(0.12–0.3) |
| 屋頂附加物飄在半空或超出屋頂 | 看 `roof-props.ts` 的 `fit()`(四角在內 + 四邊不和外框相交);測試「附加物頂點都在所屬建築外框的範圍內」會量到 |
| 透天屋頂上什麼都沒有 | 檢查擺放位置的邊距(`EDGE`);曾經因為邊距多扣一次全部放不下(0015 §10.3) |
| 從地面長到屋頂的灰色量體 | OSM building=roof 疊在大樓上、沒有起始高度;資料問題,可在 `buildingKind` 之前排除或改用 `min_height` |
| 連棟透天之間有星形破洞 | 相接轉角沒標出:看建置終端的 `buildingsTouching`、`TOUCH_DIST`(`src/config/buildings.ts`);測試「兩棟共用的外框頂點 100% 標成不做圓角」|
| 改了 `chunks.ts` 之後 Node 測試報 three.js 錯 | `src/world/` 不能引入 `src/render/`;共用常數放 `src/config/` |
