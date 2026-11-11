# 台中 MINI 兜風(工作名稱)

three.js 網頁開車遊戲:開 Q 版 MINI Cooper F55 在依 OpenStreetMap 資料生成的台中市區兜風。
規劃與決策文件見 [docs/README.md](docs/README.md)。

目前進度:**M0 技術驗證**(臺中國家歌劇院周邊 1 km²,灰色方塊車)。結果見 [docs/milestones/M0-report.md](docs/milestones/M0-report.md)。

## 開始

需求:Node.js 22、Python 3、Google Chrome(瀏覽器測試用)。

```bash
npm install
npm run dev
```

開啟 http://localhost:5173 ,按任意鍵開始。

| 按鍵 | 動作 |
|---|---|
| W / ↑ | 油門 |
| S / ↓ | 煞車,停住後倒車 |
| A D / ← → | 轉向 |
| 空白鍵 | 手煞車(甩尾) |
| R | 回到最近的路面 |
| C | 切換視角(追尾 / 近距追尾 / 高空俯視) |
| ` | 手感調參面板 |
| Esc | 暫停 |

網址加 `?fps` 會顯示幀率。

## 地圖資料

```bash
npm run map:fetch:m0   # 從 Overpass 下載 OSM 原始資料(只在要更新資料時執行)
npm run map:build:m0   # 轉成 public/map/m0/map.json + map.bin
```

地圖資料 © OpenStreetMap contributors(ODbL)。

## 測試

```bash
npm test               # 單元測試:投影、路名查詢、建置檢查、車輛手感、5 分鐘物理模擬
npm run test:e2e       # 瀏覽器冒煙 + 60 秒效能(會開 Chrome 視窗)
```

```bash
npm run test:e2e -- --seconds 300
```

## 目錄

| 路徑 | 內容 |
|---|---|
| `src/` | 遊戲執行端(地圖、物理、車輛、鏡頭、HUD) |
| `tools/map-build/` | 地圖建置管線 |
| `tools/research/` | 資料調查與測試點產生腳本(Python) |
| `tools/dev/` | 手感量測、截圖等開發工具 |
| `data/osm/raw/` | OSM 原始資料(不打包進遊戲) |
| `data/overrides/` | 人工覆寫(路寬等) |
| `tests/` | 單元測試與瀏覽器測試 |
| `docs/` | 規劃書、研究、決策、里程碑報告 |
