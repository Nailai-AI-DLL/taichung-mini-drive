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

// ---------------------------------------------------------------------------------------------
// 建築不壓到車道(decisions/0026,Cooper 2026-11-13:「這棟建築物蓋到道路上了」)。
// 路寬用政府實測值,常比 OSM 上建築之間留的空隙寬,建築外框就伸進車道。處理:
//   路從旁邊經過 → 沿「車道邊緣 + ROAD_CLEAR_MARGIN」把伸進來的部分切掉(半平面裁切);
//   切完剩不到 ROAD_CLEAR_MIN_KEEP 的原面積,或一般道路的中心線直接穿過建築 → 整棟拿掉(不然路被擋住);
//   服務道路(停車場出入口等)穿過建築 → 不動。高架橋(bridge)照樣處理:遊戲世界是平的,高架路段也畫在地面。
/** 推論:建築離車道邊緣至少留這麼多(公尺) */
export const ROAD_CLEAR_MARGIN = 0.3;
/** 推論:切完面積剩不到原來的這個比例就整棟拿掉 */
export const ROAD_CLEAR_MIN_KEEP = 0.4;

export interface ClearRoad {
  pts: Pt[];
  width: number;
  /** 單側人行道寬(公尺,選填);有填時建築一併退縮至人行道外緣,不壓到人行道 */
  sidewalk?: number;
  highway: string;
  bridge?: boolean;
}
export type ClearResult = { ring: Pt[]; status: 'ok' | 'clipped' | 'removed' | 'through-service' };

const ringArea = (r: Pt[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};
const inRing = (p: Pt, ring: Pt[]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
const segCross = (a: Pt, b: Pt, c: Pt, e: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, e) < 0 && o(c, e, a) * o(c, e, b) < 0;
};

/** 保留 f(p) ≥ 0 的那一側(Sutherland–Hodgman,單一直線) */
export function clipHalfPlane(ring: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function clearBuildingsOffRoads(rings: Pt[][], roads: ClearRoad[]): ClearResult[] {
  const CELL = 50;
  type Seg = { a: Pt; b: Pt; half: number; service: boolean; dir: Pt; len: number };
  const grid = new Map<string, Seg[]>();
  for (const r of roads) {
    const half = r.width / 2 + (r.sidewalk ?? 0);
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const s: Seg = { a, b, half, service: r.highway === 'service', dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len };
      const m = half + ROAD_CLEAR_MARGIN;
      for (let gx = Math.floor((Math.min(a[0], b[0]) - m) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + m) / CELL); gx++)
        for (let gz = Math.floor((Math.min(a[1], b[1]) - m) / CELL); gz <= Math.floor((Math.max(a[1], b[1]) + m) / CELL); gz++) {
          const k = gx + ',' + gz;
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push(s);
        }
    }
  }
  return rings.map((ring0): ClearResult => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring0) {
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
    const segs = new Set<Seg>();
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) for (const s of grid.get(gx + ',' + gz) ?? []) segs.add(s);
    if (!segs.size) return { ring: ring0, status: 'ok' };
    // 中心線穿過建築?
    let through = false, throughService = false;
    for (const s of segs) {
      const hit = inRing(s.a, ring0) || inRing(s.b, ring0) || ring0.some((p, i) => segCross(s.a, s.b, p, ring0[(i + 1) % ring0.length]));
      if (!hit) continue;
      if (s.service) throughService = true;
      else through = true;
    }
    if (through) return { ring: ring0, status: 'removed' };
    let ring = ring0;
    let clipped = false;
    for (const s of segs) {
      // 服務道路穿過的建築:服務道路那邊不動,但旁邊的一般道路照樣要切
      // (驗收抓到:原本一遇到服務道路穿過就整棟跳過,旁邊壓到市政路 4.7 m 的也沒切)
      if (throughService && s.service) continue;
      const lat = (p: Pt) => (p[0] - s.a[0]) * -s.dir[1] + (p[1] - s.a[1]) * s.dir[0];
      const along = (p: Pt) => (p[0] - s.a[0]) * s.dir[0] + (p[1] - s.a[1]) * s.dir[1];
      const lim = s.half + ROAD_CLEAR_MARGIN;
      // 外框(頂點 + 每 1 m 取樣)有沒有落在這段車道/人行道或端點圓帽裡(優先判定線段本體,其次才看端點圓帽)
      let hitBody = false;
      let hitEnd: Pt | null = null;
      for (let i = 0; i < ring.length && !hitBody; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 0; k < n; k++) {
          const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          const t = along(p), d = lat(p);
          if (t >= 0 && t <= s.len && Math.abs(d) < lim - 0.05) {
            hitBody = true;
            break;
          }
          if (!hitEnd) {
            if (t < 0 && Math.hypot(p[0] - s.a[0], p[1] - s.a[1]) < lim - 0.05) hitEnd = s.a;
            else if (t > s.len && Math.hypot(p[0] - s.b[0], p[1] - s.b[1]) < lim - 0.05) hitEnd = s.b;
          }
        }
      }
      if (!hitBody && !hitEnd) continue;
      // 建築在哪一側:看頂點平均重心
      let cx = 0, cz = 0;
      for (const p of ring) {
        cx += p[0]; cz += p[1];
      }
      cx /= ring.length;
      cz /= ring.length;
      let next: Pt[];
      if (hitBody) {
        const side = lat([cx, cz]) >= 0 ? 1 : -1;
        next = clipHalfPlane(ring, (p) => side * lat(p) - lim);
      } else {
        const ep = hitEnd!;
        const vx = cx - ep[0], vz = cz - ep[1];
        const vl = Math.hypot(vx, vz);
        if (vl < 1e-4) return { ring: ring0, status: 'removed' };
        const ux = vx / vl, uz = vz / vl;
        next = clipHalfPlane(ring, (p) => (p[0] - ep[0]) * ux + (p[1] - ep[1]) * uz - lim);
      }
      if (next.length < 3) return { ring: ring0, status: 'removed' };
      ring = next;
      clipped = true;
    }
    if (!clipped) return { ring: ring0, status: throughService ? 'through-service' : 'ok' };
    if (ringArea(ring) < ringArea(ring0) * ROAD_CLEAR_MIN_KEEP) return { ring: ring0, status: 'removed' };
    return { ring, status: 'clipped' };
  });
}
