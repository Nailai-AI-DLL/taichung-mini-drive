# 0025 行道樹、機車先移除

日期:2026-11-13
狀態:已實作

## 背景
Cooper:「場景中的摩托車、樹木先都移除。」(樹:Tripo 整組樹看起來還是怪,Cooper 會再找其他免費 GLB;0020 §8。)

## 決定
- 不刪資料、不刪程式:`src/config/furniture.ts` 加開關 `furnitureShow`,關掉時樹和機車的**畫面與碰撞**都不產生(`src/world/chunks.ts` 的 `buildFurniture`、`furnitureCollision`)。
- 遊戲預設都不顯示;網址 `?trees=on`、`?scooters=on` 可各自加回來。模組預設是顯示,單元測試不受影響(和 `?props=` 同一個做法)。
- 放棄:從 world.json 拿掉 — 之後換新樹模型還要用同一批位置;重建地圖也比較慢。

## 驗證
- 單元測試 `tests/unit/props.test.ts`「行道樹、機車先移除」2 項(網址預設、關掉後沒有畫面資料也沒有碰撞、路燈照舊)。
- e2e:原本「撞到行道樹會被擋下」改成「撞到路燈會被擋下」(樹沒了),通過。
