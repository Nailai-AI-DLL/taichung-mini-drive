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
  tree: 'models/prop_pines.glb',
  light: 'models/prop_streetlight.glb',
} as const;

export const PROP_KIND = { Tree: 0, Light: 1 } as const;

/** 樹的大小隨機範圍(倍數,依位置雜湊) */
export const PROP_TREE_SCALE: [number, number] = [0.85, 1.15];
