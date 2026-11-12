// 建築變化(decisions/0015 第三批):細分類、窗格、一樓店面、屋頂附加物的數值。
// 全部是遊戲規則或外觀推論(標「推論」),不是法規;顏色在 src/config/palette.ts 的 buildingKinds。

/** 層高(公尺;Cooper 2026-10-12 拍板 Q12,decisions/0006)。建置端估高度、執行端畫窗格共用 */
export const FLOOR_HEIGHT = 3.2;

/** 建築細分類。存在 world.json 的 WorldBuilding.t;分類規則在 tools/map-build/lib/buildings.ts 的 buildingKind */
export const KIND = {
  /** 一般(OSM building=yes / residential,規模介於透天與大樓之間) */
  Generic: 0,
  /** 透天厝(house、terrace,或 residential / yes 面積小、樓層低) */
  House: 1,
  /** 公寓、大樓(apartments、dormitory,或 residential / yes ≥ 7 層) */
  Apartment: 2,
  /** 商辦(commercial、retail、office、hotel、supermarket…) */
  Commercial: 3,
  /** 學校(school、university、college、kindergarten) */
  School: 4,
  /** 廟宇(temple、shrine) */
  Temple: 5,
  /** 低矮、附屬建築(鐵皮屋、倉庫、車棚、施工中…):不畫窗 */
  Low: 6,
  /** 公共建築(政府、醫院、車站、教堂…) */
  Public: 7,
} as const;
export type BuildingKind = (typeof KIND)[keyof typeof KIND];
export const KIND_COUNT = 8;

/**
 * 推論:窗格樣式,依細分類 [橫向週期, 窗寬, 窗下緣, 窗上緣](公尺;上下緣是離該層樓板的高度,層高 3.2 m)。
 * 窗寬 0 = 不畫窗。透天一層一扇大窗;大樓窗較密;商辦近似帶狀玻璃;學校是走廊式長窗。
 * 0023:參考台中七期 FPS 專案的立面,窗洞放大(窗牆比約 0.5 → 0.65–0.85),牆面讀起來像整齊的玻璃格子。
 */
export const WINDOW_STYLE: readonly (readonly [number, number, number, number])[] = [
  [3.2, 2.4, 0.8, 2.6], // Generic
  [4.0, 3.0, 0.8, 2.6], // House
  [3.0, 2.2, 0.8, 2.6], // Apartment
  [1.8, 1.6, 0.4, 2.9], // Commercial(近似帷幕牆)
  [3.6, 3.0, 0.9, 2.6], // School
  [1, 0, 0, 0], // Temple
  [1, 0, 0, 0], // Low
  [3.0, 2.4, 0.8, 2.7], // Public
];
/** 0023 之前的窗格(?bld=old 對照用) */
export const WINDOW_STYLE_OLD: readonly (readonly [number, number, number, number])[] = [
  [3.2, 1.8, 1.0, 2.3],
  [4.0, 2.4, 0.9, 2.4],
  [3.0, 1.6, 1.0, 2.3],
  [1.8, 1.5, 0.8, 2.7],
  [3.6, 2.8, 1.0, 2.4],
  [1, 0, 0, 0],
  [1, 0, 0, 0],
  [3.0, 2.0, 1.0, 2.4],
];
/**
 * 推論(0023,參考 FPS 專案):每類建築的立面細節 [窗台線, 玻璃反光]。
 * 窗台線 = 窗下一條淺色水平線(住宅類才有,1 = 有);玻璃反光 = 窗洞上方 WINDOW_GLINT_FRAC 的部分往白色混的比例。
 */
export const FACADE_DETAIL: readonly (readonly [number, number])[] = [
  [1, 0.14], // Generic
  [1, 0.12], // House
  [1, 0.14], // Apartment
  [0, 0.2], // Commercial
  [1, 0.12], // School
  [0, 0], // Temple
  [0, 0], // Low
  [0, 0.16], // Public
];
/** 玻璃反光佔窗洞高度的比例(FPS 專案:上方 35%) */
export const WINDOW_GLINT_FRAC = 0.35;
/** 窗台線:窗下緣往下 SILL_DROP 公尺起、厚 SILL_H 公尺;比窗洞左右各寬 SILL_OVERHANG 公尺 */
export const SILL_DROP = 0.05;
export const SILL_H = 0.16;
export const SILL_OVERHANG = 0.15;
/** 窗台線顏色 = 牆色往白色混的比例 */
export const SILL_LIGHTEN = 0.45;

export type BuildingLook = 'fps' | 'old';
/** 網址 ?bld=old 換回 0023 之前的建築外觀(前後對照用);預設新外觀 */
export function buildingLookFromSearch(search: string): BuildingLook {
  return new URLSearchParams(search).get('bld') === 'old' ? 'old' : 'fps';
}

/** 推論:每扇窗的玻璃明暗(0 = 最暗、1 = 最亮)在這個範圍內依窗、樓層、建築隨機,畫面上有的窗亮、有的窗暗 */
export const WINDOW_TONE_MIN = 0;
export const WINDOW_TONE_MAX = 1;
/** 推論:窗戶顏色往玻璃色混合的比例(1 = 整片玻璃色);太高會像黑洞,太低看不出窗 */
/** 窗框寬(公尺;只有配色有 windowFrame 時才畫,0016 §9) */
export const WINDOW_FRAME_W = 0.14;

/** 推論:一樓店面(騎樓)高度、柱寬、柱距(公尺) */
export const SHOP_HEIGHT = 3.0;
export const SHOP_PILLAR_W = 0.5;
export const SHOP_PILLAR_GAP = 4.0;
/**
 * 推論:建築外框離「路面寬 ≥ SHOP_ROAD_MIN 的道路」的人行道外緣 ≤ SHOP_REACH 公尺,一樓畫成店面。
 * 台中的騎樓、店面多在 8 m 以上的道路兩側,巷弄裡較少;實際法規門檻 not_stated。
 * 建築本身有 shop / amenity / office 標籤時,不論臨哪條路都畫店面。
 */
export const SHOP_REACH = 3;
export const SHOP_ROAD_MIN = 8;
/** 會畫店面的細分類(學校、廟宇、低矮建築、公共建築不畫) */
export const SHOP_KINDS: readonly BuildingKind[] = [KIND.Generic, KIND.House, KIND.Apartment, KIND.Commercial];

/** 推論:透天厝的判定:樓層 ≤ 此值、面積 ≤ HOUSE_MAX_AREA 的 residential / yes 視為透天 */
export const HOUSE_MAX_FLOORS = 5;
export const HOUSE_MAX_AREA = 250;
/** 推論:residential / yes 樓層 ≥ 此值視為大樓 */
export const APARTMENT_MIN_FLOORS = 7;

/**
 * 推論:屋頂附加物。
 * - 鐵皮加蓋:透天、一般建築(樓層 ≤ ROOF_SHED_MAX_FLOORS)依機率加一間,牆高 2.6 m、斜屋頂再高 0.5 m。
 * - 水塔:不鏽鋼圓桶;透天放在鐵皮加蓋上或屋頂上,大樓放在屋突旁。
 * - 屋突(樓梯間、電梯機房):大樓、商辦、公共建築 ≥ ROOF_BOX_MIN_FLOORS 層才有。
 * 機率由 OSM id 決定,每次載入都一樣。
 */
export const ROOF_SHED_CHANCE: Readonly<Partial<Record<BuildingKind, number>>> = { [KIND.House]: 0.5, [KIND.Generic]: 0.35 };
export const ROOF_SHED_MAX_FLOORS = 6;
export const ROOF_SHED_WALL = 2.6;
export const ROOF_SHED_RIDGE = 0.5;
export const ROOF_TANK_R = 0.6;
export const ROOF_TANK_H = 1.4;
export const ROOF_BIG_TANK_R = 1.0;
export const ROOF_BIG_TANK_H = 2.0;
export const ROOF_BOX_MIN_FLOORS = 6;
export const ROOF_BOX_H = 3.2;
/** 屋頂可用面積 < 此值(平方公尺)不放附加物 */
export const ROOF_MIN_AREA = 30;

/**
 * 推論:廟宇雙斜屋頂。外框面積 / 外接矩形面積 ≥ TEMPLE_RECT_MIN 才加(不規則外框維持平頂);
 * 屋脊高 = 短邊 × TEMPLE_RIDGE_RATIO,最多 TEMPLE_RIDGE_MAX;屋簷伸出 TEMPLE_EAVE;屋脊兩端上翹 TEMPLE_FLARE(燕尾的簡化)。
 */
export const TEMPLE_RECT_MIN = 0.75;
export const TEMPLE_RIDGE_RATIO = 0.3;
export const TEMPLE_RIDGE_MAX = 4;
export const TEMPLE_EAVE = 0.8;
export const TEMPLE_FLARE = 0.8;
/** 沒有 height / building:levels 的廟宇估幾層(Cooper 2026-11-01 拍板 0015 §10.8:正殿多半一層加高屋頂;不加 ±1 樓變化) */
export const TEMPLE_EST_FLOORS = 2;

/**
 * 推論:外框頂點離另一棟建築的外框邊 ≤ 此值(公尺)就算「和隔壁相接」,這個轉角不做圓角
 * (Cooper 2026-11-01 要修連棟透天之間的星形破洞;decisions/0015 §10.6)。OSM 連棟透天多半共用節點,距離 0;
 * 沒共用節點、畫得稍微分開的也算進來
 */
export const TOUCH_DIST = 0.3;
