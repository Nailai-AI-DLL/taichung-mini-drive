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

/** 網址參數 → 模式;預設 tripo(Cooper 2026-11-12:「路燈跟樹都先幫我放到遊戲裡面，我想看看效果」) */
export function propsModeFromSearch(search: string): PropsMode {
  return new URLSearchParams(search).get('props') === 'gen' ? 'gen' : 'tripo';
}

/** 樣板檔(tools/models/prop_normalize.py 產生;單位公尺、原點在立地點、路燈懸臂朝 +x) */
export const PROP_MODELS = {
  // 整組樹(3 棵松樹 + 灌木,Tripo 原檔不拆;Cooper 2026-11-12:「把原本的 glb 直接放上去不用拆成三顆」)
  // 寬 9.1 m、深 6 m、高 7 m;原點在灌木那側的前緣中點,前緣朝 +z(遊戲端轉向最近的車道)
  tree: 'models/prop_tree_group.glb',
  light: 'models/prop_streetlight.glb',
} as const;

export const PROP_KIND = { Tree: 0, Light: 1 } as const;

/** 路燈改成單色卡通(不用 Tripo 貼圖;Cooper 2026-11-12:「還是可以改成單色？淡灰色就好」);null = 用原貼圖 */
/** 第二版 #9EA7B1(Cooper:「有點太淡了，顏色再深一些，但是不要變髒」→ 中灰、微偏冷，不帶黃褐) */
export const PROP_LIGHT_COLOR: string | null = '#9EA7B1';

/** 整組樹的整體大小(Cooper 2026-11-12:「樹的尺寸可以縮小約30%」→ 0.7;整組約寬 6.4 m、深 4.2 m、高 4.9 m) */
export const PROP_TREE_SIZE = 0.7;
/** 樹的大小隨機範圍(倍數,依位置雜湊;已乘上 PROP_TREE_SIZE) */
export const PROP_TREE_SCALE: [number, number] = [0.9 * PROP_TREE_SIZE, 1.05 * PROP_TREE_SIZE];
