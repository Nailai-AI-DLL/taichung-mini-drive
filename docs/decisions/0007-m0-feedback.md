# 0007 M0 試開回饋與 M1 建模工具提案

- 日期:2026-10-12
- 狀態:全部已決定(決策者:Cooper;第 5–7 項於 2026-10-12 第二次回覆確認)
- 相關:`production-plan.md` §10.1、`docs/milestones/M1-plan.md`

## 決定

| # | 題目 | 決定 | 取代 |
|---|---|---|---|
| 1 | fps 驗收硬體 | Cooper 的 M1 Pro;DPR 1 與 DPR 2 都要測(Claude 提案,Cooper 同意) | 規劃書 §6.3 的「M1 MacBook Air 等級」 |
| 2 | 手感 | M0 初版 OK:0–100 km/h 5.2 秒、100–0 煞車 33.1 m、20 km/h 迴轉半徑 5.2 m、60 km/h 甩尾 1 秒 72° | — |
| 3 | 配色 | 顏色接近真實,低彩度、淡雅舒適,不要厚重濃郁 | Q9 方案甲「粉彩奶油」 |
| 4 | 外型 | 可愛風格 | —(維持) |
| 6 | 手感回歸測試容許誤差 | Cooper 認可值 ±10%(Claude 提案,Cooper 同意) | M0 較寬的合理性範圍 |
| 7 | M1 範圍與方案丙配色方向 | 同意 `docs/milestones/M1-plan.md` §1 與 §3 | — |
| 5 | MINI、地標、道具的建模工具 | Blender 5.2 LTS 背景執行 Python 腳本 → GLB,自動算預覽圖 | 0002 的「以程式碼組合基本幾何體」 |

## 第 5 項的理由與放棄方案

見 `docs/milestones/M1-plan.md` §4。重點:Blender 的倒角、細分、布林運算能做出圓潤可愛的造型;腳本化後仍可版控、可一鍵重建,符合 0002 原本重視的「可重做」。

已實測(重現:`Blender -b --factory-startup -P tools/models/probe.py -- <glb> <png>`,再 `node tools/models/check-glb.mjs <glb>`):本機 Blender 5.2.0 LTS 在背景可做倒角、細分、布林、純色材質、輸出 GLB、Workbench 算預覽圖;three.js r186 可載入。

放棄:繼續用 three.js 基本幾何體(可愛感不足)、Blender 純手工(無法重建)、AI 生成 3D(風格與授權不可控)。
