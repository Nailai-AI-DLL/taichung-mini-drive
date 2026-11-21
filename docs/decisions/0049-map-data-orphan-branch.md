# 0049 地圖資料移到 orphan map-data 分支

日期:2026-11-19
狀態：已實作(補記於 2026-11-21;commit 5d2b2db)

## 背景
- 決策者與原話:not_stated(commit message 只有標題，找不到當時的對話紀錄)。
- 相關文件:`docs/research/map-expansion.md`「伺服器」段(2026-11-17):
  - 「不建議繼續把地圖檔 commit 進 git:world.json 已經進版控 18 次，`.git` 已 274 MB」。
  - 建議「先用 GitHub Pages + 地圖檔另一個分支(不用新帳號),流量或容量不夠再搬 R2」;建議順序第 2 步是「地圖檔移出 main 分支」。
- Cooper 對這個建議的回覆:not_stated。

## 決定
- 地圖建置產物 `public/map/range-*/` 不進 main(`.gitignore:20-21`);main 只留 m0 小地圖(`.gitignore:20` 註解寫 51 KB)。commit 同時從 main 刪掉 `public/map/range-a/world.json`、`skyline.json`。
- 同步腳本 `tools/map-build/sync-map-branch.sh`:
  - 預設遠端 `origin`、分支 `map-data`、目錄 `public/map`(`sync-map-branch.sh:15-17`),可用 `--remote` / `--branch` / `--dir` 改(`:19-26`)。
  - `push`:先檢查 `range-a/world.json` 存在(`:40-43`);複製到暫存目錄、`git init`、單一 commit、`git push --force` 到 `refs/heads/map-data`(`:59-69`)。每次整個覆蓋，分支永遠只有 1 個沒有歷史的 commit。
  - `push` 時遠端是 `Nailai-AI-DLL/` 的 repo,會暫時把 gh 帳號切到 Nailai-AI-DLL,結束切回(`:44-57`)。
  - `pull`:`git fetch --depth=1` 後用 `git archive | tar -x` 解到 `public/map`(`:71-80`),不留 `.git`。
- npm 指令:`npm run map:push`、`npm run map:pull`(`package.json:21-22`)。
- CI:`.github/workflows/pages.yml:23-24` 在 checkout 之後先 `sync-map-branch.sh pull`,再 `npm ci` → `npm test` → `npm run build`(`:29-33`)。
- 測試輔助:`tests/helpers/load-map.ts` 找不到地圖檔時，錯誤訊息提示先跑 `npm run map:pull`。
- 現況(2026-11-21 查):`git ls-remote origin` 有 `refs/heads/map-data`(b13ef99);本機沒有 map-data 分支。`du -sh .git` = 235 MB(舊的 world.json 歷史沒有改寫，仍在 main 的歷史裡)。

## 驗證
- `tests/unit/surface-and-loader.test.ts:272`「push 多次仍維持單一無歷史 commit(整個覆蓋),且 pull 可完整還原地圖檔而不殘留 .git」。
- 截圖:not_stated(不適用)。

## 放棄的方案
- not_stated。
- 參考(研究文件列的選項，不確定當時是否逐一考慮):Cloudflare R2(要開帳號)、GitHub Releases 附檔(不適合幾千個小檔)。
- 推論：沒有改寫 main 的舊歷史(`git filter-repo` 之類),所以 clone 仍會下載舊 world.json(依 `.git` 235 MB 推得;是否刻意不改寫:not_stated)。

## 待 Cooper
- 是否要改寫 main 歷史、刪掉舊的 world.json blob(會改變所有 commit hash,影響已 clone 的副本)。
- map-data 是 force-push 單一 commit、CI 一律拉最新版，地圖資料和程式版本沒有綁定(`docs/reviews/2026-11-21/architecture.md:16`、`:80-89` 的建議)。要不要加版本鎖定，請 Cooper 決定。
- README 的地圖資料說明已過時(`docs/reviews/2026-11-21/data-process.md:44`),本份不改 README。
