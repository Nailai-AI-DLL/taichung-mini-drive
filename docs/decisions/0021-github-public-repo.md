# 0021 推上 GitHub 公開 repo、commit 改用英文

日期：2026-11-12
狀態：已完成

## Cooper 的決定

- Cooper 說：「可以把目前這個版本 commit 與 push 到我 Nailai-AI-DLL 這個帳號的 GitHub 嗎？然後所有資訊都是英文，不要放中文」。
- 英文的範圍，Cooper 選「GitHub 資訊 + commit」:
  - 改成英文：repo 名稱與描述、README、所有 commit 訊息(含既有的 8 個)。
  - 維持中文：程式註解、`docs/`、遊戲內的中文路名和 HUD。
- 公開程度：公開(Public)。
- repo 名稱：`taichung-mini-drive`。網址 https://github.com/Nailai-AI-DLL/taichung-mini-drive
- commit 作者：換成 Nailai-AI-DLL,使用 GitHub 的不公開信箱(`289869662+Nailai-AI-DLL@users.noreply.github.com`),個人 Gmail 不公開。

## 做法

1. 新增英文 README,`package.json` 的描述改成英文。
2. 用 `git filter-branch` 重寫全部歷史：
   - commit 訊息換成英文，依原 commit 對照。
   - 作者與提交者換成 Nailai-AI-DLL。
   - 從所有 commit 拿掉 `docs/art/mini-3view/overlay.png`。
3. 改寫前的歷史留在本機分支 `backup/pre-english-history`,不推上去。
4. 這個 repo 的本機 git 設定：
   - `user.name` / `user.email` 設為 Nailai-AI-DLL。
   - `credential.https://github.com.username` 設為 Nailai-AI-DLL。

   這樣之後 push 會用 Nailai-AI-DLL,不用切換 gh 目前使用中的帳號(目前使用中的仍是 Cooperfu615-Desinger)。

## 為什麼拿掉 overlay.png

`overlay.png` 是 Cooper 的 MINI 三視圖疊上量測框的圖，裡面有 MINI 商標。依照既有約定「Cooper 的照片和三視圖只留在本機」,這張圖改由 `.gitignore` 排除。

本機檔案還在。`profile.json` 是量測出來的數字，留在版控裡。

## 檢查結果

- 改寫後的檔案內容和改寫前完全相同：與 `backup/pre-english-history` 比較 `git diff`,沒有任何差異。
- main 分支的 commit 訊息裡，中文字數為 0。
- main 的歷史中已沒有 `overlay.png`。
- 推上去的 HEAD 和本機 main 一致。GitHub 上 `docs/art/mini-3view/` 只剩 `profile.json`。
- 推之前掃過歷史：沒有 API 金鑰或 token,也沒有 `mini60/`、`.env`。

## 影響

- 舊 commit 的雜湊全部改變。`docs/decisions/0016` 裡提到的舊雜湊(`94853b9` 等)現在只對得上備份分支。
- 這個專案之後的 commit 訊息一律用英文。這是 Cooper 對這個專案的指示，優先於全域「commit 用繁體中文」的規則。
- repo 沒有放授權檔(LICENSE),所以預設保留所有權利。要不要開源授權，由 Cooper 決定。
