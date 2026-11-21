// 配色。
// 方案丙「真實淡雅」:色相照真實,彩度壓低、明度提高(Cooper 2026-10-12 確認方向;docs/milestones/M1-plan.md §3)
// 方案甲「粉彩奶油」(Q9 原決定)保留在 PALETTE_A 作紀錄。
export const PALETTE_C = {
  road: '#9A9DA1',
  sidewalk: '#DCD6CB',
  ground: '#D9D3C3',
  park: '#B9CBA8',
  pitch: '#AFC4A0',
  water: '#AFC9CB',
  /**
   * 建築細分類的外牆與屋頂色(decisions/0015 第三批,src/config/buildings.ts 的 KIND 順序)。
   * 第三批之前只有住宅 residential ['#EFEBE3', '#E5DDD0', '#DAD7D0', '#E2D2C6']、商辦 commercial ['#CDD5DB', '#D8DADB', '#E3DCCE']
   * 兩組,屋頂 #C7C2B8,窗帶 #8C96A0。一般建築沿用 residential、商辦沿用 commercial;透天外牆磁磚色較多樣;學校磚紅淡化;廟宇淡朱紅牆、陶土色屋頂;低矮建築是鐵皮灰。
   */
  buildingKinds: [
    { walls: ['#EFEBE3', '#E5DDD0', '#DAD7D0', '#E2D2C6'], roof: '#C7C2B8' },
    { walls: ['#EFE6DA', '#E6D9CF', '#DCE0D8', '#E9DFC8', '#E2D6D8', '#D8DCE0'], roof: '#C7C2B8' },
    { walls: ['#E3DED6', '#D8D4CC', '#DED6CA', '#CFD3D3'], roof: '#C2BEB6' },
    { walls: ['#CDD5DB', '#D8DADB', '#E3DCCE'], roof: '#C2C4C4' },
    { walls: ['#E6D2BF', '#DCC8B4', '#E8DCCB'], roof: '#C8BBAA' },
    { walls: ['#E4C9BC', '#E6D0BC'], roof: '#C49C86' },
    { walls: ['#C9CFD2', '#BFC8CC', '#D3CFC6'], roof: '#B9C0C3' },
    { walls: ['#E0DDD5', '#D5D9D6', '#DCD8CE'], roof: '#C4C2BC' },
  ],
  /** 窗戶玻璃:暗(室內、窗簾)與亮(反射天空)兩端,每扇窗在中間取一個明暗 */
  glassDark: '#6F7A84',
  glassLight: '#B4C2CC',
  /** 窗戶畫多深(0–1)、窗框色(null = 不畫窗框);方案丁才有窗框(0016 §9) */
  windowStrength: 0.55,
  windowFrame: null as string | null,
  /** 一樓店面(騎樓內側)的深色(原 #968F86,Cooper 2026-11-01 要亮一點) */
  shopfront: '#ADA79E',
  /** 屋頂鐵皮加蓋的牆色(屋頂色再暗一點)與不鏽鋼水塔 */
  roofShed: ['#B7C3CC', '#D6D0C3', '#BFC6BE', '#C9C3BB'],
  roofTank: '#CDD1D4',
  /** 街道傢俱(0015 第四批):樹冠(M1-plan.md §3 的 #97B08F 為主,另兩色做變化)、樹幹、路燈 / 號誌桿、燈頭、號誌燈箱與紅黃綠燈 */
  treeCrown: ['#97B08F', '#A4B98F', '#8BA78C'],
  /** 樹種的樹冠色(依 TREE_SPECIES 順序:球形、層狀、叢生、椰子、尖塔)與椰子樹幹 */
  treeSpeciesCrown: ['#97B08F', '#A6BC8E', '#88A58A', '#9DB37F', '#7F9E83'],
  palmTrunk: '#C2B9A8',
  /** 直式招牌底色(低彩度紅、黃、藍、白、綠、橘)與字塊色(白底用深紅字,其他用白字) */
  signBoards: ['#C9776C', '#D9B862', '#6F8FB0', '#EEEAE0', '#7FA27E', '#CB8D5C'],
  signText: '#F7F4EC',
  signTextOnWhite: '#A65A4F',
  /** 公車站:站牌藍、候車亭頂、背板(淺灰藍,像玻璃) */
  busBlue: '#5E86AE',
  busRoof: '#6E8EAD',
  busGlass: '#C3D3DA',
  treeTrunk: '#A08C78',
  pole: '#B3B7BA',
  lampHead: '#ECE9E0',
  signalBox: '#6E7377',
  signalLamps: ['#D98E7E', '#E3C77A', '#8DBFA3'],
  /** 機車車身(白、銀、淡藍、淡紅、深灰、奶黃)與座墊 / 輪胎 / 把手 */
  scooterBody: ['#EDEBE6', '#C9CDD0', '#A9BCCB', '#D3A39A', '#6F7377', '#E6D8B0'],
  scooterDark: '#4B4F53',
  skyTop: '#CFE0EA',
  skyBottom: '#EAEDEE',
  /** 標線米白 / 黃(黃線原為 M1-plan.md §3 的 #E2D3A0,俯瞰偏淡,Cooper 2026-10-31 要求調深);路緣石;分隔島植栽(同綠地) */
  markWhite: '#F4F2EC',
  markYellow: '#D9BF6F',
  curb: '#ECE9E2',
  median: '#B9CBA8',
} as const;

type Widen<T> = T extends string ? string : T extends number ? number : T extends null ? null : T extends readonly (infer U)[] ? readonly Widen<U>[] : T extends object ? { readonly [K in keyof T]: Widen<T[K]> } : T;
export type Palette = Widen<typeof PALETTE_C>;

/**
 * 方案丁「明亮遊戲感」(Cooper 2026-11-11 給參考圖《Six Stars》,要那種風格但「更明亮、不要髒」;decisions/0016 §9)。
 * 參考圖的特徵:建築是飽和的色塊、深色玻璃配淺色窗框、深色柏油配亮白標線與鮮綠草地;
 * 和參考圖不同的地方:改成明亮的金黃午後(參考圖是偏暗的黃昏),整體明度提高、飽和但乾淨。數值都是品味項,樣張給 Cooper 看。
 */
export const PALETTE_D: Palette = {
  road: '#4C5464',
  sidewalk: '#C9CFD7',
  /** 空地:Cooper 2026-11-11 要灰色(原米色 #DCD8CC);比人行道 #C9CFD7 略深,人行道才分得出來 */
  ground: '#BDC1C6',
  park: '#86CC48',
  pitch: '#74C040',
  water: '#58B2DD',
  buildingKinds: [
    { walls: ['#F4ECDD', '#EED8B6', '#BCD5EA', '#F2CBA6'], roof: '#D3D6DA' },
    { walls: ['#F7E8CF', '#F3D2B0', '#CDE4D0', '#F5E3A2', '#EBC6C4', '#C6DCEE'], roof: '#D7D3CC' },
    { walls: ['#EDE8DE', '#C4D6EA', '#F2DEBE', '#6F8EB4'], roof: '#CDD2D8' },
    { walls: ['#5E7FAA', '#4E6E99', '#E9EFF4', '#A9C4E0'], roof: '#C8CED6' },
    { walls: ['#F0AC86', '#E99C78', '#F5D8B2'], roof: '#D9C7B4' },
    { walls: ['#E4573E', '#EA6E4A'], roof: '#E27A36' },
    { walls: ['#E6E1D8', '#D9D5CC', '#C9D3DA', '#E3D9C8'], roof: '#C6C8C9' },
    { walls: ['#F4F0E8', '#D6E3EE', '#EFE3CC'], roof: '#D0D3D6' },
  ],
  glassDark: '#1D2A40',
  glassLight: '#4A6890',
  windowStrength: 0.92,
  windowFrame: '#F7F5EF',
  shopfront: '#2D3B52',
  roofShed: ['#9DB4C8', '#E3D9C6', '#A9C2AE', '#D4C9BA'],
  roofTank: '#E4E8EB',
  treeCrown: ['#78C23E', '#8BCD48', '#66B23A'],
  treeSpeciesCrown: ['#78C23E', '#92D04A', '#5EAA3C', '#86C440', '#4E9E48'],
  palmTrunk: '#B59C79',
  signBoards: ['#E4473A', '#F3B52E', '#3C7ED2', '#FFFFFF', '#3BAA5C', '#F27C2A'],
  signText: '#FFFFFF',
  signTextOnWhite: '#D0352B',
  busBlue: '#2F6FD0',
  busRoof: '#2D5DA8',
  busGlass: '#A8D2EA',
  treeTrunk: '#8C5E3C',
  pole: '#3E4552',
  lampHead: '#F6F3E8',
  signalBox: '#2A2F39',
  signalLamps: ['#FF4A3D', '#FFC83C', '#3DDE88'],
  scooterBody: ['#FFFFFF', '#C9D0D6', '#5FA8E0', '#E5584C', '#3E4450', '#F4D27A'],
  scooterDark: '#2F333B',
  skyTop: '#4FA3E8',
  skyBottom: '#FFE2C2',
  markWhite: '#FFFFFF',
  markYellow: '#F3C232',
  curb: '#E6E8EA',
  median: '#86CC48',
};

export const PALETTE_A = {
  road: '#B9B4C7',
  sidewalk: '#F3E9D2',
  ground: '#F3E9D2',
  park: '#B8E0C2',
  pitch: '#A9D8B4',
  water: '#9ED8E6',
  residential: ['#F6D6C3', '#FBE8A6'],
  commercial: ['#C9DDF2', '#E3D7F4'],
  roof: '#F6D6C3',
  window: '#C9DDF2',
  skyTop: '#BFE3F5',
  skyBottom: '#FFF4E0',
} as const;

/**
 * 目前用的配色:預設方案丁(0016 §9);網址 ?look=c 換回方案丙(前後對照用)。Node(測試、建置)沒有 location,用方案丁。
 */
const LOOK = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('look') : null;
export const PALETTE: Palette = LOOK === 'c' ? PALETTE_C : PALETTE_D;

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
