// 臺中市行道樹分佈圖(data.gov.tw 109853;decisions/0042)→ 遊戲的樹形與大小。只在建置端使用。
import { TREE_REF_HEIGHT, TREE_SCALE_RANGE, TREE_SPECIES } from '../../../src/config/furniture';

/** 推論:樹種名 → 遊戲的樹形(0 球形、1 層狀、2 叢生、3 椰子、4 尖塔、5 分枝;0045 加分枝) */
export function speciesKind(sp: string): number {
  if (/椰|棕|蒲葵|海棗|檳榔/.test(sp)) return TREE_SPECIES.Palm;
  if (/落羽松|龍柏|柏|杉|松/.test(sp)) return TREE_SPECIES.Cone;
  if (/小葉欖仁|黑板樹|欖仁/.test(sp)) return TREE_SPECIES.Tiered;
  if (/榕|雨豆|鳳凰木/.test(sp)) return TREE_SPECIES.Cluster;
  // 0045 低多邊形樹多一種「分枝散葉」
  if (/茄苳|黃連木|印度紫檀/.test(sp)) return TREE_SPECIES.Branchy;
  return TREE_SPECIES.Round;
}

/** 樹高(公尺;0 = 未標)→ 大小倍率 */
export function treeScale(h: number): number {
  if (!(h > 0)) return 1;
  return Math.min(TREE_SCALE_RANGE[1], Math.max(TREE_SCALE_RANGE[0], h / TREE_REF_HEIGHT));
}
