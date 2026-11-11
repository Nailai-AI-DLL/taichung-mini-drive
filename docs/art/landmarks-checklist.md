# 地標模型操作手冊

適用對象：要新增、修改或重做 P0 地標模型的人。設計依據見 `docs/decisions/0013-landmark-pipeline.md`,外觀與尺寸依據見 `docs/art/landmarks-reference.md`(§10、§11 是更正，以更正為準)。

## 0. 環境

- Blender 5.2(腳本在 5.2.0 LTS 實測)。`package.json` 寫死 macOS 路徑 `/Applications/Blender.app/Contents/MacOS/Blender`;其他系統請改 `models:landmarks` 與 `models:build` 這兩個指令的 Blender 路徑。
- Node 22。所有指令都在 repo 根目錄執行。

## 1. 檔案地圖

| 檔案 | 用途 |
|---|---|
| `data/landmarks/landmarks.json` | 地標 id、OSM 建築 id、模型路徑、驗收用參考座標;`height` 是查到的實際高度，出處寫在 `heightSrc` |
| `data/landmarks/footprints-range-a.json` | 建置時產生(勿手改)。外框座標:X 東、Y 北、原點 = 地標形心;`h` = 地標高度 |
| `tools/models/landmark_<id>.py` | 每棟一支 Blender 腳本，輸出 `public/models/landmarks/<id>.glb` 與預覽圖 `docs/art/landmarks/<id>-*.png` |
| `tools/models/common.py` | 共用函式:`load_footprint`、`min_area_rect`、`footprint_prism`、`boolean`(地標用 `solver='MANIFOLD'`)等 |
| `tools/models/landmark-gap.mjs` | 對位測試失敗時，列出離模型輪廓超過 2 m 的外框頂點 |
| `tests/unit/landmarks.test.ts` | 位置誤差 < 10 m、實際高度覆寫、碰撞量體高度 |
| `tests/unit/landmark-models.test.ts` | 模型與外框對位、沒有鏡像、高度、朝向(單側特徵) |

## 2. 改高度

1. 在 `landmarks.json` 修改 `height` 和 `heightSrc`。高度一定要有出處;查不到就不填，維持 OSM 值。
2. 同步修改 `tests/unit/landmarks.test.ts` 的 `REAL_H`。
3. `npm run map:build:range-a`:重建地圖與外框檔。
4. `npm run models:landmarks`:腳本會從外框檔讀總高，不需要改腳本。
5. `npx vitest run`。

## 3. 改模型或新增一棟

1. 先在 `landmarks-reference.md` 補齊這棟的資料：高度與出處、量體、正面方位、主色、「一定要有」的特徵。數字標明是事實、量測，還是推論。
2. 複製一支結構相近的腳本：
   - 方盒類：`landmark_city_hall.py`、`landmark_council.py`;
   - 坡頂類：`landmark_station_old.py`;
   - 曲面類：`landmark_station_new.py`。
   用 `min_area_rect` 取長軸，再用正面方位常數決定 +v 指向哪一側。總高一律讀外框檔的 `h`。
3. 單支執行:
   ```
   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
     -P tools/models/landmark_<id>.py -- "$PWD/public/models/landmarks" "$PWD/docs/art/landmarks" "$PWD/data/landmarks/footprints-range-a.json"
   ```
4. 看預覽圖。布林運算失敗時，物件會整個不見(見 0013 §4)。
5. 在 `tests/unit/landmark-models.test.ts` 的 `SIDE_FEATURES` 加一行：選一個只在某一側的特徵材質顏色，加上它應在的方位。
6. `npx vitest run`。對位失敗時跑 `node tools/models/landmark-gap.mjs <id>`,找出是哪個角。
   - 模型超出外框 > 3 m:通常是懸挑或分叉伸出外框。
   - 最高點不等於高度：被裁切的曲面可以參考新站的兩次建模修正。
7. 遊戲內確認：`npm run dev`,開頁面後在 console 執行 `__game.teleport(x, z, 車頭方位)`,從正面方向看過去並截圖。**頁面開著時才輸出的 GLB,要重新整理頁面**,因為「檔案不存在」的結果會被快取。
8. 把預覽圖給 Cooper 看，定稿後記進 `docs/milestones/M1-progress.md`。

## 4. 已知坑

- Blender 5.2 的 EXACT 布林會把擠出切割體整個切光，地標一律用 MANIFOLD。
- 兩個面重疊會閃爍(z-fighting),例如山牆板和屋頂端面。要讓其中一個凸出 0.1 m 以上。
- `render_previews` 的視角方位：從 +X(東)往 +Y(北)逆時針量。
- 碰撞一律用外框擠出的量體。挖空的川堂、洞口只有視覺效果，車子不能穿過。
