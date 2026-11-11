// 建築:高度與顏色規則(只在建置端使用;擠出網格在 src/world/gen/extrude.ts)。
// 高度規則(Cooper 2026-10-12 拍板 Q12:依類型與面積推估,層高 3.2 m);數值見 docs/decisions/0006-m0-implementation.md。

import { hash32, type Pt } from '../../../src/world/gen/geom';
import { APARTMENT_MIN_FLOORS, FLOOR_HEIGHT, HOUSE_MAX_AREA, HOUSE_MAX_FLOORS, KIND, SHOP_REACH, SHOP_ROAD_MIN, TEMPLE_EST_FLOORS, TOUCH_DIST, type BuildingKind } from '../../../src/config/buildings';

export { FLOOR_HEIGHT };

const LOW_STRUCTURES = new Set(['roof', 'carport', 'shed', 'garage', 'garages', 'kiosk', 'hut', 'toilets', 'service']);
const COMMERCIAL = new Set([
  'commercial', 'retail', 'office', 'public', 'civic', 'government', 'hotel', 'school', 'university',
  'college', 'hospital', 'train_station', 'transportation', 'theatre', 'museum', 'stadium',
]);

export type HeightSource = 'height' | 'levels' | 'estimate';

export interface HeightResult {
  height: number;
  source: HeightSource;
}

/** 依 OSM 標籤與面積決定建築高度 */
export function buildingHeight(id: number, tags: Record<string, string>, area: number): HeightResult {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return { height: h, source: 'height' };
  const lv = parseFloat(tags['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return { height: lv * FLOOR_HEIGHT, source: 'levels' };
  return { height: estimateFloors(id, tags.building, area) * FLOOR_HEIGHT, source: 'estimate' };
}

/**
 * 依細分類修正估計高度:沒有高度資料的廟宇改估 TEMPLE_EST_FLOORS 層(依面積估會變成 4–6 層的無窗高盒子,0015 §10.8)。
 * 有 height / building:levels 的照資料。
 */
export function kindHeight(kind: BuildingKind, h: HeightResult): HeightResult {
  if (kind === KIND.Temple && h.source === 'estimate') return { height: TEMPLE_EST_FLOORS * FLOOR_HEIGHT, source: 'estimate' };
  return h;
}

/** 無樓層資料時的估計樓層數(依類型與面積,加上由 OSM id 決定的 ±1 樓變化避免整排同高) */
export function estimateFloors(id: number, type: string, area: number): number {
  if (LOW_STRUCTURES.has(type)) return 1.25;
  let floors: number;
  if (type === 'house' || type === 'detached' || type === 'terrace' || type === 'semidetached_house') floors = 4;
  else if (type === 'apartments') floors = area > 600 ? 14 : 8;
  else if (type === 'industrial' || type === 'warehouse') floors = 2;
  else if (COMMERCIAL.has(type)) floors = area > 2000 ? 8 : area > 600 ? 5 : 4;
  else if (area < 150) floors = 4; // 透天厝規模
  else if (area < 600) floors = 5;
  else if (area < 2000) floors = 7;
  else floors = 10;
  const jitter = (hash32(id) % 3) - 1; // -1, 0, +1
  return Math.max(1, floors + jitter);
}

const SCHOOL = new Set(['school', 'university', 'college', 'kindergarten']);
const TEMPLE = new Set(['temple', 'shrine']);
const LOW = new Set([...LOW_STRUCTURES, 'outbuilding', 'industrial', 'warehouse', 'construction', 'bridge', 'container', 'greenhouse']);
const PUBLIC = new Set([
  'public', 'civic', 'government', 'hospital', 'train_station', 'transportation', 'church', 'theatre', 'museum',
  'stadium', 'parking', 'fire_station', 'sports_hall', 'sports_centre', 'cathedral', 'chapel', 'mosque',
]);
/** building=yes 上帶這些 amenity 的算公共建築(警察局、區公所、圖書館、郵局…) */
const PUBLIC_AMENITY = new Set(['police', 'townhall', 'library', 'post_office', 'fire_station', 'courthouse', 'community_centre']);
/** building=yes 上帶這些 amenity 的算低矮建築(公廁、涼亭) */
const LOW_AMENITY = new Set(['toilets', 'shelter']);
/** building=yes 上帶這些 shop 的算商辦(量販店、百貨) */
const BIG_SHOP = new Set(['supermarket', 'department_store', 'mall', 'wholesale']);
/** 這些宗教的禮拜場所是公共建築色系;其他(含沒標宗教)在台灣多半是寺廟 */
const NON_TEMPLE_RELIGION = new Set(['christian', 'muslim']);
const STORE = new Set(['commercial', 'retail', 'office', 'hotel', 'supermarket', 'restaurant', 'mall', 'department_store']);
const HOUSE = new Set(['house', 'detached', 'terrace', 'semidetached_house']);

/**
 * 建築細分類(decisions/0015 第三批,類別見 src/config/buildings.ts 的 KIND)。
 * building=* 的值優先;residential / yes 這類籠統的值,依樓層與面積分成透天、一般、大樓。
 */
export function buildingKind(tags: Record<string, string>, area: number, height: number): BuildingKind {
  const type = tags.building;
  const worship = tags.amenity === 'place_of_worship' || type === 'religious';
  if (PUBLIC.has(type) || (worship && NON_TEMPLE_RELIGION.has(tags.religion))) return KIND.Public;
  if (TEMPLE.has(type) || worship) return KIND.Temple;
  if (SCHOOL.has(type)) return KIND.School;
  if (LOW.has(type)) return KIND.Low;
  if (STORE.has(type)) return KIND.Commercial;
  if (type === 'yes' && PUBLIC_AMENITY.has(tags.amenity)) return KIND.Public;
  if (type === 'yes' && LOW_AMENITY.has(tags.amenity)) return KIND.Low;
  if (type === 'yes' && BIG_SHOP.has(tags.shop)) return KIND.Commercial;
  if (type === 'apartments' || type === 'dormitory') return KIND.Apartment;
  if (HOUSE.has(type)) return KIND.House;
  const floors = height / FLOOR_HEIGHT;
  if (floors >= APARTMENT_MIN_FLOORS) return KIND.Apartment;
  if (floors <= HOUSE_MAX_FLOORS && area <= HOUSE_MAX_AREA) return KIND.House;
  return KIND.Generic;
}

/** 建築本身就是商店、餐廳、辦公室(OSM 標籤),一樓一定畫店面 */
export function hasShopTags(tags: Record<string, string>): boolean {
  if (tags.shop || tags.office) return true;
  const a = tags.amenity;
  return !!a && !NOT_SHOP_AMENITY.has(a);
}

/** 這些 amenity 不是店面(宗教、學校、公家機關、公廁、涼亭、垃圾場…) */
const NOT_SHOP_AMENITY = new Set([
  'place_of_worship', 'school', 'kindergarten', 'parking', 'parking_entrance', 'hospital', 'townhall', 'police', 'fire_station',
  'library', 'courthouse', 'community_centre', 'toilets', 'shelter', 'waste_transfer_station', 'waste_disposal', 'recycling',
  'social_facility', 'bus_station', 'grave_yard',
]);

/**
 * 一樓店面判定:建築外框任一頂點離「路面寬 ≥ SHOP_ROAD_MIN 的道路」的人行道外緣 ≤ SHOP_REACH(decisions/0015 第三批)。
 * roads 的 half = 路面半寬 + 單側人行道寬;回傳每棟建築是否臨大路。用 50 m 格網索引道路線段。
 */
export function nearWideRoad(rings: Pt[][], roads: { pts: Pt[]; width: number; half: number }[]): boolean[] {
  const CELL = 50;
  const grid = new Map<string, { a: Pt; b: Pt; half: number }[]>();
  for (const r of roads) {
    if (r.width < SHOP_ROAD_MIN) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const pad = r.half + SHOP_REACH;
      for (let gx = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL); gx++)
        for (let gz = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); gz <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL); gz++) {
          const k = `${gx},${gz}`;
          const list = grid.get(k) ?? [];
          list.push({ a, b, half: r.half });
          grid.set(k, list);
        }
    }
  }
  return rings.map((ring) =>
    ring.some((p) => (grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []).some((s) => segDist(p, s.a, s.b) - s.half <= SHOP_REACH)),
  );
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/**
 * 和隔壁建築相接的轉角:外框頂點離「另一棟建築的外框邊」≤ TOUCH_DIST 公尺(decisions/0015 §10.6)。
 * 這些轉角不做圓角,連棟透天之間才不會留下星形破洞。回傳每棟建築的頂點索引(對應傳入的外框)。
 */
export function touchingCorners(rings: Pt[][]): number[][] {
  const CELL = 20;
  const grid = new Map<string, number[]>();
  rings.forEach((ring, b) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) {
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
    for (let gx = Math.floor((x0 - TOUCH_DIST) / CELL); gx <= Math.floor((x1 + TOUCH_DIST) / CELL); gx++)
      for (let gz = Math.floor((z0 - TOUCH_DIST) / CELL); gz <= Math.floor((z1 + TOUCH_DIST) / CELL); gz++) {
        const k = `${gx},${gz}`;
        const list = grid.get(k) ?? [];
        list.push(b);
        grid.set(k, list);
      }
  });
  return rings.map((ring, b) => {
    const out: number[] = [];
    ring.forEach((p, i) => {
      const others = grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [];
      const touches = others.some((o) => {
        if (o === b) return false;
        const r = rings[o];
        for (let j = 0; j < r.length; j++) if (segDist(p, r[j], r[(j + 1) % r.length]) <= TOUCH_DIST) return true;
        return false;
      });
      if (touches) out.push(i);
    });
    return out;
  });
}
