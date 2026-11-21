// 街道傢俱(decisions/0015 第四批):行道樹、路燈、號誌桿的擺放與尺寸。
// 全部是外觀推論(標「推論」),不是法規;顏色在 src/config/palette.ts 的 tree* / pole* / signal*。
// 擺放在建置端算好存進 world.json 的 furniture(tools/map-build/lib/furniture.ts),幾何在執行端生成(src/world/gen/furniture.ts)。

/** 推論:種行道樹的道路等級(主要道路;巷弄不種) */
export const TREE_HIGHWAYS = ['primary', 'secondary', 'tertiary', 'trunk'] as const;
/** 人行道至少多寬(公尺)才種樹 */
export const TREE_MIN_SIDEWALK = 2;
/** 推論:樹距(公尺)與每棵前後亂移的範圍(±) */
export const TREE_SPACING = 9;
export const TREE_JITTER = 1.5;
/** 樹離路緣多遠(公尺):人行道寬的一半,最多 TREE_CURB_MAX(樹穴靠車道側) */
export const TREE_CURB_MAX = 1.2;
/** 推論:樹的尺寸(公尺):樹幹半徑(樹幹長到樹冠中間)、樹冠半徑、樹冠中心高(半徑另乘 0.9–1.15、高度乘 0.92–1.08 的變化) */
export const TREE_TRUNK_R = 0.16;
export const TREE_CROWN_R = 1.9;
export const TREE_CROWN_Y = 4.1;

/**
 * 推論:行道樹樹種(Cooper 2026-11-01:「樹木的外型可以多樣化」)。同一條路(同路名;沒路名的同一條 way)種同一種,
 * 比較像實際的行道樹;樹種由路名雜湊依權重決定。椰子只種在路寬 ≥ PALM_MIN_WIDTH 的路,其他路抽到椰子改成球形。
 * 0 球形(樟樹)、1 層狀(小葉欖仁)、2 叢生(榕樹、茄苳)、3 椰子(大王椰子)、4 尖塔(落羽松)
 */
export const TREE_SPECIES = { Round: 0, Tiered: 1, Cluster: 2, Palm: 3, Cone: 4, Branchy: 5 } as const;
export const TREE_SPECIES_WEIGHTS = [30, 25, 20, 10, 15];
export const PALM_MIN_WIDTH = 14;

/** 推論:立路燈的道路等級(加上 OSM lit=yes 的道路) */
export const LIGHT_HIGHWAYS = ['primary', 'secondary', 'tertiary', 'trunk'] as const;
/**
 * 推論:燈距(公尺);路寬 ≥ LIGHT_BOTH_SIDES 兩側都立(交錯),否則只立行車方向右側。
 * 32 → 64(Cooper 2026-11-12:「我想減少路燈的數量」;約減半,寬路兩側交錯 = 沿路每 32 m 一支)
 * 64 → 128(Cooper 2026-11-16:「路燈可以減少一半數量。平均放置就好」;寬路兩側交錯 = 沿路每 64 m 一支,decisions/0042)
 */
export const LIGHT_SPACING = 128;
export const LIGHT_BOTH_SIDES = 16;
/** 路燈離路緣(公尺) */
export const LIGHT_CURB = 0.5;
/** 推論:路燈尺寸(公尺):桿高、桿半徑、懸臂伸出長度、燈頭長 */
export const LIGHT_H = 8;
export const LIGHT_R = 0.1;
export const LIGHT_ARM = 1.8;
export const LIGHT_HEAD = 0.7;

/**
 * 推論:每個路口放號誌(Cooper 2026-11-12:「在每個路口放上紅綠燈」)。
 * 「路口」= 這條路畫了停止線(進入路口),且 SIGNAL_PARTNER_R 公尺內有另一條方向交叉(夾角 > 約 45°)、
 * 不同路名的路也在這裡畫停止線;兩條路都要是「大路」:SIGNAL_HIGHWAYS 等級,或同名道路最寬處 ≥ SIGNAL_MIN_WIDTH 公尺
 * (OSM 把七期很多寬馬路標成 residential,例:惠來路二段 12 m、市政北二路 12 m;只看等級會漏掉)。窄巷口不放。
 * 號誌立在停止線旁、行車方向右側路緣,往後退 SIGNAL_SETBACK 公尺,懸臂伸向車道。
 */
export const SIGNAL_HIGHWAYS = ['trunk', 'primary', 'secondary', 'tertiary'] as const;
export const SIGNAL_MIN_WIDTH = 10;
export const SIGNAL_PARTNER_R = 60;
export const SIGNAL_SETBACK = 1;
/**
 * 0047 A 改法(Cooper 2026-11-16:「紅綠燈用A改法沒問題」):號誌改依 OSM 號誌點(highway=traffic_signals)放。
 * 進入路口的停止線 SIGNAL_OSM_R 公尺內有 OSM 號誌點 → 立號誌(位置規則同上);
 * OSM 號誌點附近都沒有停止線(窄路沒畫)→ 在最近道路的路緣補一支。沒有 OSM 號誌點的路口不放。
 */
export const SIGNAL_OSM_R = 40;
/** OSM 標了號誌的穿越道,離已立的路口號誌 < 此值(公尺)就不再另立 */
export const SIGNAL_OSM_DEDUPE = 12;

/** 號誌桿離路緣(公尺) */
export const SIGNAL_CURB = 0.7;
/** 推論:號誌桿尺寸(公尺):桿高、桿半徑、懸臂最長、燈箱長寬高 */
export const SIGNAL_H = 6;
export const SIGNAL_R = 0.13;
export const SIGNAL_ARM_MAX = 5;
export const SIGNAL_BOX: readonly [number, number, number] = [1.1, 0.4, 0.35];

/**
 * 推論:機車排(Cooper 2026-11-01 拍板 0015 §11.5 第 4 項:先做機車)。
 * 停在店面建築前、人行道靠建築那一側,垂直於道路、車頭朝建築;一排 SCOOTER_GROUP_MIN–MAX 台,排與排之間空 SCOOTER_GAP_MIN–MAX 格。
 * 只在人行道 ≥ SCOOTER_MIN_SIDEWALK、旁邊(人行道外緣往外 SCOOTER_SHOP_REACH 內)是店面建築的地方。
 */
export const SCOOTER_MIN_SIDEWALK = 2.5;
export const SCOOTER_SHOP_REACH = 2.5;
/** 每台佔的寬度(沿道路)、車長、車寬、車高(公尺) */
export const SCOOTER_SLOT = 0.8;
export const SCOOTER_LEN = 1.8;
export const SCOOTER_W = 0.6;
export const SCOOTER_H = 1.1;
export const SCOOTER_GROUP_MIN = 3;
export const SCOOTER_GROUP_MAX = 9;
export const SCOOTER_GAP_MIN = 2;
export const SCOOTER_GAP_MAX = 6;
/** 不停機車的道路等級(快速道路、服務道路) */
export const SCOOTER_SKIP_HIGHWAYS = ['motorway', 'trunk', 'service', 'motorway_link', 'trunk_link'] as const;

/**
 * 推論:直式招牌(Cooper 2026-11-01 拍板要做)。掛在店面建築(第三批的 s 旗標)面向道路的外牆上,二樓以上,
 * 垂直於外牆伸出;沿外牆每 SIGN_SPACING 一個位置,SIGN_CHANCE 的機率掛。字用淺色方塊代表(不用貼圖,方向 A)。
 */
/** Cooper 2026-11-01:「少一點」→ 從每 4 m、70% 改成每 5 m、45%(密度約一半;0015 §11.11) */
export const SIGN_SPACING = 5;
export const SIGN_CHANCE = 0.45;
/**
 * 推論:連棟透天店面(臺中市建物圖型態 3)的招牌密度(0041 A;Cooper 2026-11-16 選「透天街屋排招牌」)。
 * 用 0015 減半前的密度(每 4 m、70%);其他店面維持上面的減半密度。
 */
export const SIGN_SPACING_ROW = 4;
export const SIGN_CHANCE_ROW = 0.7;
/** 招牌底部高度、最短 / 最長(公尺);頂端不超過建築高度 - SIGN_TOP_GAP */
export const SIGN_BOTTOM = 3.4;
export const SIGN_MIN_H = 1.8;
export const SIGN_MAX_H = 5;
export const SIGN_TOP_GAP = 0.4;
/** 招牌伸出外牆的長度、厚度、離牆間隙(公尺) */
export const SIGN_DEPTH = 0.9;
export const SIGN_THICK = 0.18;
export const SIGN_WALL_GAP = 0.15;
/** 招牌底色數(= palette.ts 的 signBoards 長度;測試會核對) */
export const SIGN_COLORS = 6;
/** 外牆離道路(人行道外緣)多遠以內算「面向道路」(公尺) */
export const SIGN_ROAD_REACH = 4;

/**
 * 推論:公車站(Cooper 2026-11-01 拍板要做)。位置來自 OSM highway=bus_stop(tools/map-build/queries/range_a_nodes.overpassql),
 * 貼到最近道路的路緣;OSM shelter=yes 且人行道 ≥ BUS_SHELTER_MIN_SIDEWALK 的做候車亭,其他只放站牌。
 */
export const BUS_SNAP = 25;
export const BUS_DEDUPE = 6;
export const BUS_SHELTER_MIN_SIDEWALK = 2.2;
/** 站牌離路緣、候車亭前緣離路緣(公尺) */
export const BUS_POLE_CURB = 0.6;
export const BUS_SHELTER_CURB = 0.5;
/** 候車亭長、深、高 */
export const BUS_SHELTER_L = 4;
export const BUS_SHELTER_D = 1.5;
export const BUS_SHELTER_H = 2.5;
/** 站牌桿高 */
export const BUS_POLE_H = 2.9;

/**
 * 碰撞(Cooper 2026-11-01 拍板 0015 §11.5:要碰撞,撞到會彈開):每支樹幹 / 桿子一個直立圓柱。
 * 半徑比畫出來的略粗一點(樹幹 0.16、路燈 0.1、號誌 0.13),高速時才不會擦邊穿過;高度只要擋得住車身。
 */
export const TREE_HIT_R = 0.3;
export const LIGHT_HIT_R = 0.2;
export const SIGNAL_HIT_R = 0.25;
export const POST_HIT_H = 3;
export const BUS_POLE_HIT_R = 0.15;

/** 擺放時的淨空(公尺):離其他道路的車道邊緣、行人穿越道中心、彼此之間 */
export const CLEAR_ROAD = 1;
export const CLEAR_CROSSWALK = 4;
export const CLEAR_LIGHT = 3;

/**
 * 行道樹、機車排要不要出現(畫面 + 碰撞一起)。Cooper 2026-11-13:「場景中的摩托車、樹木先都移除」(decisions/0025)。
 * 資料還留在 world.json;模組預設都顯示(單元測試不受影響),main.ts 依網址設定:預設都不顯示,
 * 網址 ?trees=on / ?scooters=on 加回來。
 */
export const furnitureShow = { trees: true, scooters: true };
/** 2026-11-16 起行道樹預設顯示(Cooper 選程式生成樹形,decisions/0044),?trees=off 隱藏;機車仍預設不顯示 */
export function furnitureShowFromSearch(search: string) {
  const q = new URLSearchParams(search);
  return { trees: q.get('trees') !== 'off', scooters: q.get('scooters') === 'on' };
}
export function setFurnitureShow(v: { trees: boolean; scooters: boolean }) {
  furnitureShow.trees = v.trees;
  furnitureShow.scooters = v.scooters;
}

/**
 * 臺中市行道樹分佈圖(decisions/0042):實測樹的樹高換成大小倍率,和樹形一起存在 world.json 樹的第 3 個值:
 * 值 = 樹形 + TREE_SCALE_CODE × round(倍率 × 10);倍率 0(舊資料、規則種的樹)= 1。
 */
export const TREE_SCALE_CODE = 10;
/** 推論:樹高 → 倍率的基準樹高(公尺;遊戲的樹約這麼高)與倍率範圍 */
export const TREE_REF_HEIGHT = 7;
/** 所有行道樹畫面上再乘這個大小(Cooper 2026-11-16:「樹的尺寸有點太大了，我覺得可以縮小些」,decisions/0047) */
export const TREE_DRAW_SCALE = 0.75;
export const TREE_SCALE_RANGE: readonly [number, number] = [0.6, 1.6];
/** 畫面顯示樹高壓在 1.5 層樓(4.8 m)以內(Cooper 2026-11-21):將 [0.6, 1.6] 的實測倍率壓縮映射到 [0.42, 0.64] */
export const TREE_DISPLAY_SCALE_RANGE: readonly [number, number] = [0.42, 0.64];
export const TREE_DISPLAY_JITTER: readonly [number, number] = [0.94, 1.07];
/** 將資料內的實測倍率(0.6–1.6)轉成畫面基準縮放倍率(搭配 TREE_REF_HEIGHT=7 m 與隨機微調,全圖最高約 4.79 m ≈ 1.5 層樓) */
export function treeDisplayScale(scale: number): number {
  const [sMin, sMax] = TREE_SCALE_RANGE;
  const [dMin, dMax] = TREE_DISPLAY_SCALE_RANGE;
  const t = Math.max(0, Math.min(1, (scale - sMin) / (sMax - sMin)));
  return dMin + t * (dMax - dMin);
}
/** 推論:實測樹 TREE_GOV_COVER 公尺內不再種規則樹(避免實測路段多種一排) */
export const TREE_GOV_COVER = 15;

export function encodeTreeKind(kind: number, scale: number): number {
  return kind + TREE_SCALE_CODE * Math.round(scale * 10);
}
export function decodeTreeKind(v: number): { kind: number; scale: number } {
  const s = Math.floor(v / TREE_SCALE_CODE);
  return { kind: v % TREE_SCALE_CODE, scale: s ? s / 10 : 1 };
}
