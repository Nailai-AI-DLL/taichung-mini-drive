// Tripo 街道物件(decisions/0020):行道樹、路燈改用 Tripo 模型(GLB 樣板 + InstancedMesh)。
// 網址 ?props=gen 換回程式生成的樹與路燈(對照用)。模組預設 'gen',讓單元測試不受影響;main.ts 依網址設定。

export type PropsMode = 'tripo' | 'gen';

let mode: PropsMode = 'gen';

export function propsMode(): PropsMode {
  return mode;
}

export function setPropsMode(m: PropsMode) {
  mode = m;
}

/**
 * 網址參數 → 模式。2026-11-12 起預設 tripo;2026-11-16 Cooper 選程式生成的 5 種樹形(「先用B」,decisions/0044)→ 預設 gen,
 * 網址 ?props=tripo 換回 Tripo 模型
 */
export function propsModeFromSearch(search: string): PropsMode {
  return new URLSearchParams(search).get('props') === 'tripo' ? 'tripo' : 'gen';
}

/** 樣板檔(tools/models/prop_normalize.py 產生;單位公尺、原點在立地點、路燈懸臂朝 +x) */
export const PROP_MODELS = {
  // 整組樹(3 棵松樹 + 灌木,Tripo 原檔不拆;Cooper 2026-11-12:「把原本的 glb 直接放上去不用拆成三顆」)
  // 寬 9.1 m、深 6 m、高 7 m;原點在灌木那側的前緣中點,前緣朝 +z(遊戲端轉向最近的車道)
  tree: 'models/prop_tree_group.glb',
  light: 'models/prop_streetlight.glb',
} as const;

export const PROP_KIND = { Tree: 0, Light: 1 } as const;

/**
 * 路燈卡通造型(方案 A,Cooper 2026-11-12 選定;decisions/0020 §9):
 * 燈桿深石板藍、燈頭下方發光面暖白、外加和車子同一套的深色描邊。不用 Tripo 貼圖。
 * 先前試過淡灰 #C8CDD3、中灰 #9EA7B1,Cooper:「感覺用灰色反而變成很像是沒有材質的灰模」。
 */
export const PROP_LIGHT_STYLE = {
  pole: '#3A4658',
  lens: '#FFF1D2',
  /** 描邊粗細(公尺;車子 0.022,路燈 8 m 高、燈桿細，稍粗一點遠處才看得到) */
  outline: 0.035,
  /** 燈罩判定：高度在最高點的這個比例以上、離燈桿(局部 x)超過 lensMinX 公尺、面朝下(法向量 y < lensNormalY) */
  lensMinH: 0.8,
  lensMinX: 1.1,
  lensNormalY: -0.6,
};

/** 整組樹的整體大小(Cooper 2026-11-12:「樹的尺寸可以縮小約30%」→ 0.7;整組約寬 6.4 m、深 4.2 m、高 4.9 m) */
export const PROP_TREE_SIZE = 0.7;
/** 樹的大小隨機範圍(倍數,依位置雜湊;已乘上 PROP_TREE_SIZE) */
export const PROP_TREE_SCALE: [number, number] = [0.9 * PROP_TREE_SIZE, 1.05 * PROP_TREE_SIZE];
