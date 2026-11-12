# 0022 對外試玩網址:GitHub Pages

日期:2026-11-12
狀態:已採用

## 背景
Cooper:「幫我開對外的網址，我可以分享給我朋友試玩」。repo 已公開(0021)。

## 決定
- 用 GitHub Pages(免費、跟 repo 同一處、純靜態檔就能跑)。網址:https://nailai-ai-dll.github.io/taichung-mini-drive/
- 部署方式:GitHub Actions(`.github/workflows/pages.yml`)。每次 push 到 main 自動:npm ci → npm test → 打包 → 發布。測試沒過就不發布。
- 網址在子路徑底下，所以 `vite.config.ts` 的 `base` 讀環境變數 `VITE_BASE`(workflow 設 `/taichung-mini-drive/`,本機開發不設 = `/`)。程式裡的資源路徑原本就都用 `import.meta.env.BASE_URL`,不用改。

## 放棄的方案
- 自己打包推到 gh-pages 分支:要把打包結果放進版控，且每次要手動做。
- Claude Artifact 頁面:單頁上限 16 MB,打包後 15 MB 太接近上限，且不是長期網址。
- Vercel / Netlify / Cloudflare Pages:要另開帳號，沒有比 Pages 多什麼好處。

## 驗證
- 本機 `VITE_BASE=/taichung-mini-drive/ npm run build` 後用 `vite preview --base /taichung-mini-drive/`(`.claude/launch.json` 的 pages-preview)開 http://localhost:5178/taichung-mini-drive/:地圖、車、路燈、小地圖都正常，沒有 4xx 的資源。
- 上線後實際開公開網址確認(見 commit 後的檢查)。

## 注意
- 打包後約 15 MB(JS 5.2 MB,gzip 後 1.9 MB),朋友第一次開要等幾秒。
- 目前只支援鍵盤，手機無法操作(not_stated:是否要做觸控，Cooper 決定)。
- 遊戲會跟著 main 更新：推上去的版本朋友就會看到。
