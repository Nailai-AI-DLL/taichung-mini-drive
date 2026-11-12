// 街道傢俱擺放(建置端,decisions/0015 第四批):行道樹(含樹種)、路燈、號誌桿、機車排、直式招牌、公車站。
// 輸入是處理完路寬的道路、建築 / 地標 / 水面外框、有號誌的行人穿越道;輸出不量化,由 build.ts 量化後寫進 world.json。
// 位置只由資料決定(亂移用 OSM id 雜湊),每次建置結果一樣。
import {
  CLEAR_CROSSWALK, CLEAR_LIGHT, CLEAR_ROAD, LIGHT_BOTH_SIDES, LIGHT_CURB, LIGHT_HIGHWAYS, LIGHT_SPACING, SIGNAL_ARM_MAX, SIGNAL_CURB,
  SCOOTER_GAP_MAX, SCOOTER_GAP_MIN, SCOOTER_GROUP_MAX, SCOOTER_GROUP_MIN, SCOOTER_LEN, SCOOTER_MIN_SIDEWALK, SCOOTER_SHOP_REACH, SCOOTER_SKIP_HIGHWAYS,
  SCOOTER_SLOT, TREE_CURB_MAX, TREE_HIGHWAYS, TREE_JITTER, TREE_MIN_SIDEWALK, TREE_SPACING,
  BUS_DEDUPE, BUS_POLE_CURB, BUS_SHELTER_CURB, BUS_SHELTER_D, BUS_SHELTER_L, BUS_SHELTER_MIN_SIDEWALK, BUS_SNAP,
  PALM_MIN_WIDTH, SIGN_COLORS, SIGN_BOTTOM, SIGN_CHANCE, SIGN_DEPTH, SIGN_MAX_H, SIGN_MIN_H, SIGN_ROAD_REACH, SIGN_SPACING, SIGN_TOP_GAP, SIGN_WALL_GAP,
  TREE_SPECIES, TREE_SPECIES_WEIGHTS,
  SIGNAL_HIGHWAYS,
  SIGNAL_MIN_WIDTH,
  SIGNAL_OSM_DEDUPE,
  SIGNAL_PARTNER_R,
  SIGNAL_SETBACK,
} from '../../../src/config/furniture';
import { hash32, pointInPolygon, signedArea, type Pt } from '../../../src/world/gen/geom';
import { cumLength, leftNormal, pointAt } from '../../../src/world/gen/polyline';

export interface FurnitureRoad {
  id: number;
  highway: string;
  width: number;
  sidewalk: number;
  lit: boolean;
  bridge: boolean;
  pts: Pt[];
  /** 路名(同路名種同一種樹);沒有就用 id */
  name?: string;
}

/** 行人穿越道:中心 p(道路中心線上)、穿越方向 v(單位向量)、中心到路緣的距離 reach、有沒有號誌 */
/** 進入路口的方向(src: tools/map-build/lib/street.ts 的 approaches) */
export interface FurnitureApproach {
  p: Pt;
  dir: Pt;
  half: number;
  highway: string;
  name: string;
}

/** 每個路口的號誌位置:主要道路進入路口、附近有另一條交叉的主要道路也進入同一路口(純函式,給測試用) */
export function intersectionSignals(approaches: FurnitureApproach[]) {
  // 同名道路最寬處(分隔島兩側的單向車道各自很窄,要看整條路)
  const nameWidth = new Map<string, number>();
  for (const a of approaches) if (a.name) nameWidth.set(a.name, Math.max(nameWidth.get(a.name) ?? 0, a.half * 2));
  const isBig = (a: FurnitureApproach) =>
    (SIGNAL_HIGHWAYS as readonly string[]).includes(a.highway) || (a.name ? nameWidth.get(a.name)! : a.half * 2) >= SIGNAL_MIN_WIDTH;
  const big = approaches.filter(isBig);
  const g = new Grid<FurnitureApproach>();
  for (const a of big) g.add(a.p[0] - SIGNAL_PARTNER_R, a.p[1] - SIGNAL_PARTNER_R, a.p[0] + SIGNAL_PARTNER_R, a.p[1] + SIGNAL_PARTNER_R, a);
  const out: { p: Pt; a: number; arm: number }[] = [];
  for (const a of big) {
    const partner = g.near(a.p).some(
      (b) => b !== a && (b.name !== a.name || !a.name) && Math.abs(a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1]) < 0.7 && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < SIGNAL_PARTNER_R,
    );
    if (!partner) continue;
    const n = leftNormal(a.dir); // 往路中央(行車方向左側)
    const p: Pt = [a.p[0] - n[0] * SIGNAL_CURB - a.dir[0] * SIGNAL_SETBACK, a.p[1] - n[1] * SIGNAL_CURB - a.dir[1] * SIGNAL_SETBACK];
    out.push({ p, a: Math.atan2(n[1], n[0]), arm: Math.min(SIGNAL_ARM_MAX, a.half * 0.7) });
  }
  return out;
}

export interface FurnitureCrossing {
  p: Pt;
  v: Pt;
  reach: number;
  sig: boolean;
}

export interface Furniture {
  trees: Pt[];
  /** 和 trees 一一對應的樹種(src/config/furniture.ts 的 TREE_SPECIES) */
  treeKinds: number[];
  /** a = 懸臂朝向(atan2(z, x),弧度),指向車道 */
  lights: { p: Pt; a: number }[];
  /** a = 懸臂朝向;arm = 懸臂長(公尺) */
  signals: { p: Pt; a: number; arm: number }[];
  /** 機車排:p = 第一台的中心;a = 排列方向(沿道路);n = 台數;f = 車頭朝向。第 i 台在 p + (cos a, sin a)·i·SCOOTER_SLOT */
  scooters: { p: Pt; a: number; n: number; f: number }[];
  /** 直式招牌:p = 貼牆處(外牆上),a = 伸出方向(外牆外側法向量),y0 / y1 = 底 / 頂高度,c = 底色編號 */
  signs: { p: Pt; a: number; y0: number; y1: number; c: number }[];
  /** 公車站:p = 站牌或候車亭中心,a = 朝向車道,shelter = 候車亭 */
  busStops: { p: Pt; a: number; shelter: boolean }[];
}

/** 字串雜湊(路名 → 樹種) */
function strHash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * 這條路的樹種:同路名同一種;椰子只種在寬路。
 * width 要傳「整條路(同路名所有 way)最窄的寬度」:各段各自判斷的話,同一條路窄段會變球形、寬段是椰子(驗收 2026-11-01:英才路等 3 條混種)。
 */
export function treeKindOf(r: Pick<FurnitureRoad, 'id' | 'name' | 'width'>): number {
  const total = TREE_SPECIES_WEIGHTS.reduce((a, b) => a + b, 0);
  let x = (r.name ? strHash(r.name) : hash32(r.id)) % total;
  let k = 0;
  while (x >= TREE_SPECIES_WEIGHTS[k]) x -= TREE_SPECIES_WEIGHTS[k++];
  return k === TREE_SPECIES.Palm && r.width < PALM_MIN_WIDTH ? TREE_SPECIES.Round : k;
}

const CELL = 40;
/** 兩條路方向夾角餘弦 > 此值算平行(同一條路的下一段、雙向分開的另一側) */
const PARALLEL_COS = 0.95;
/** 樹與樹至少隔多遠(公尺);重疊描繪的兩條 way 才不會種兩排 */
const TREE_MIN_GAP = 4;
/** 路燈與路燈至少隔多遠 */
const LIGHT_MIN_GAP = 10;
/** 號誌桿與號誌桿至少隔多遠 */
const SIGNAL_MIN_GAP = 3;
/** 離建築外牆至少多遠:樹冠比較寬 */
const TREE_BUILDING_GAP = 0.8;
/** 離平行道路車道邊緣至少多遠(量化 0.1 m 後樹幹才不會壓進車道;驗收 2026-11-01:15 棵壓進 0–0.1 m) */
const LANE_GAP = 0.2;
/** 離水道水面邊緣至少多遠 */
const WATER_GAP = 0.3;
const POLE_BUILDING_GAP = 0.3;

interface Seg {
  a: Pt;
  b: Pt;
  dir: Pt;
  half: number;
  road: number;
  sidewalk: number;
}

/** 依格子收集的線段 / 外框 / 點,查詢附近用 */
class Grid<T> {
  private m = new Map<string, T[]>();
  add(x0: number, z0: number, x1: number, z1: number, v: T) {
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = `${gx},${gz}`;
        const l = this.m.get(k);
        if (l) l.push(v);
        else this.m.set(k, [v]);
      }
  }
  near(p: Pt): T[] {
    return this.m.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [];
  }
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

function ringDist(p: Pt, ring: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** 點的集合,檢查最小間距 */
class Spacing {
  private g = new Grid<Pt>();
  constructor(private gap: number) {}
  free(p: Pt, gap = this.gap) {
    return !this.g.near(p).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < gap);
  }
  add(p: Pt) {
    this.g.add(p[0] - CELL, p[1] - CELL, p[0] + CELL, p[1] + CELL, p);
  }
}

/**
 * 擺放街道傢俱。檢查順序:號誌桿 → 路燈 → 行道樹 → 機車(先放的優先,後放的避開)。
 * 每個位置都要:不在其他道路的車道上(橫交道路再加 CLEAR_ROAD 淨空,路口轉角才空得出來)、不在建築 / 地標 / 水面裡、
 * 樹與路燈不擋行人穿越道。
 */
export function placeFurniture(
  roads: FurnitureRoad[],
  obstacles: { rings: Pt[][]; water: Pt[][]; shops?: Pt[][]; waterways?: { pts: Pt[]; w: number }[]; junctions?: Pt[][]; shopBuildings?: { ring: Pt[]; h: number; id: number }[] },
  crossings: FurnitureCrossing[],
  busStops: { p: Pt; shelter: boolean }[] = [],
  approaches: FurnitureApproach[] = [],
): Furniture {
  const segs = new Grid<Seg>();
  const pad = (s: Seg) => s.half + CLEAR_ROAD + 1;
  roads.forEach((r, ri) => {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-6) continue;
      const s: Seg = { a, b, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], half: r.width / 2, road: ri, sidewalk: r.sidewalk };
      segs.add(Math.min(a[0], b[0]) - pad(s), Math.min(a[1], b[1]) - pad(s), Math.max(a[0], b[0]) + pad(s), Math.max(a[1], b[1]) + pad(s), s);
    }
  });
  const solids = new Grid<Pt[]>();
  const addRing = (g: Grid<Pt[]>, ring: Pt[], m: number) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) {
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
    g.add(x0 - m, z0 - m, x1 + m, z1 + m, ring);
  };
  for (const r of obstacles.rings) addRing(solids, r, TREE_BUILDING_GAP);
  const water = new Grid<Pt[]>();
  for (const r of obstacles.water) addRing(water, r, 0);
  // 路口鋪面(路面色畫在人行道上方):裡面的傢俱看起來像立在馬路上(驗收 2026-11-01:192 件)
  const junctions = new Grid<Pt[]>();
  for (const r of obstacles.junctions ?? []) addRing(junctions, r, 0);
  // 水道(帶狀水面):離中心線 < 半寬 + WATER_GAP 不放(驗收 2026-11-01:123 件,含 1 支號誌桿立在水上)
  const streams = new Grid<{ a: Pt; b: Pt; half: number }>();
  for (const w of obstacles.waterways ?? [])
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i], b = w.pts[i + 1], m = w.w / 2 + WATER_GAP;
      streams.add(Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, { a, b, half: w.w / 2 });
    }
  const walks = new Grid<{ a: Pt; b: Pt }>();
  for (const c of crossings) {
    const e = c.reach + 3;
    const a: Pt = [c.p[0] - c.v[0] * e, c.p[1] - c.v[1] * e];
    const b: Pt = [c.p[0] + c.v[0] * e, c.p[1] + c.v[1] * e];
    walks.add(Math.min(a[0], b[0]) - CLEAR_CROSSWALK, Math.min(a[1], b[1]) - CLEAR_CROSSWALK, Math.max(a[0], b[0]) + CLEAR_CROSSWALK, Math.max(a[1], b[1]) + CLEAR_CROSSWALK, { a, b });
  }

  /** 位置可不可以放:dir = 這個傢俱所屬道路的方向(沒有就是號誌桿,只檢查車道) */
  const ok = (p: Pt, dir: Pt | null, buildingGap: number) => {
    for (const s of segs.near(p)) {
      const d = segDist(p, s.a, s.b);
      const parallel = dir && Math.abs(s.dir[0] * dir[0] + s.dir[1] * dir[1]) > PARALLEL_COS;
      // 平行的路(自己這條、下一段、雙向分開的另一側)只要離車道 LANE_GAP;橫交的路另外留淨空
      if (d < s.half + (parallel || !dir ? LANE_GAP : CLEAR_ROAD)) return false;
    }
    for (const r of junctions.near(p)) if (pointInPolygon(p, r)) return false;
    for (const s of streams.near(p)) if (segDist(p, s.a, s.b) < s.half + WATER_GAP) return false;
    for (const r of solids.near(p)) if (pointInPolygon(p, r) || ringDist(p, r) < buildingGap) return false;
    for (const r of water.near(p)) if (pointInPolygon(p, r)) return false;
    return true;
  };
  const clearOfCrosswalk = (p: Pt) => !walks.near(p).some((w) => segDist(p, w.a, w.b) < CLEAR_CROSSWALK);

  const out: Furniture = { trees: [], treeKinds: [], lights: [], signals: [], scooters: [], signs: [], busStops: [] };

  // ---- 號誌桿:有號誌的穿越道兩端,人行道上靠路緣;懸臂伸向車道 ----
  const sigSpace = new Spacing(SIGNAL_MIN_GAP);
  // 先放每個路口的號誌(Cooper 2026-11-12),再用 OSM 標了號誌的穿越道補(例如路段中間的行人號誌)
  for (const s of intersectionSignals(approaches)) {
    if (!sigSpace.free(s.p) || !ok(s.p, null, POLE_BUILDING_GAP)) continue;
    sigSpace.add(s.p);
    out.signals.push(s);
  }
  for (const c of crossings) {
    if (!c.sig) continue;
    for (const side of [1, -1]) {
      const e = c.reach + SIGNAL_CURB;
      const p: Pt = [c.p[0] + c.v[0] * e * side, c.p[1] + c.v[1] * e * side];
      if (!sigSpace.free(p, SIGNAL_OSM_DEDUPE) || !ok(p, null, POLE_BUILDING_GAP)) continue;
      sigSpace.add(p);
      out.signals.push({ p, a: Math.atan2(-c.v[1] * side, -c.v[0] * side), arm: Math.min(SIGNAL_ARM_MAX, c.reach * 0.7) });
    }
  }

  // ---- 公車站:OSM 站點貼到最近道路的路緣(在車道上的站點放到行車方向右側);有候車亭且人行道夠寬做候車亭 ----
  const busSpace = new Spacing(BUS_DEDUPE);
  /** 樹、路燈、機車離公車站至少多遠(候車亭半長 + 一點) */
  const busClear = (p: Pt) => busSpace.free(p, BUS_SHELTER_L / 2 + 1);
  for (const st of busStops) {
    let best: { d: number; s: Seg; foot: Pt } | null = null;
    for (const r of roads)
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        if (Math.abs(a[0] - st.p[0]) > 200 && Math.abs(b[0] - st.p[0]) > 200) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
        if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((st.p[0] - a[0]) * dx + (st.p[1] - a[1]) * dz) / l2));
        const foot: Pt = [a[0] + t * dx, a[1] + t * dz];
        // 服務道路、巷弄不當公車停靠的路(距離加 10 m 的懲罰)
        const d = Math.hypot(st.p[0] - foot[0], st.p[1] - foot[1]) + (r.highway === 'service' || r.highway === 'living_street' ? 10 : 0);
        if (d < BUS_SNAP && (!best || d < best.d)) {
          const l = Math.sqrt(l2);
          best = { d, foot, s: { a, b, dir: [dx / l, dz / l], half: r.width / 2, road: 0, sidewalk: r.sidewalk } };
        }
      }
    if (!best) continue;
    const { s, foot } = best;
    const n = leftNormal(s.dir);
    const off = (st.p[0] - foot[0]) * n[0] + (st.p[1] - foot[1]) * n[1];
    const side = Math.abs(off) < s.half + 0.5 ? -1 : Math.sign(off);
    const at = (e: number): Pt => [foot[0] + n[0] * e * side, foot[1] + n[1] * e * side];
    const a = Math.atan2(-n[1] * side, -n[0] * side);
    const shelterP = at(s.half + BUS_SHELTER_CURB + BUS_SHELTER_D / 2);
    const corners = [-1, 1].flatMap((u) => [-1, 1].map((v): Pt => [shelterP[0] + s.dir[0] * u * (BUS_SHELTER_L / 2) + n[0] * side * v * (BUS_SHELTER_D / 2), shelterP[1] + s.dir[1] * u * (BUS_SHELTER_L / 2) + n[1] * side * v * (BUS_SHELTER_D / 2)]));
    const shelter = st.shelter && s.sidewalk >= BUS_SHELTER_MIN_SIDEWALK && corners.every((q) => ok(q, s.dir, 0.1)) && clearOfCrosswalk(shelterP);
    const p = shelter ? shelterP : at(s.half + BUS_POLE_CURB);
    if (!busSpace.free(p) || !sigSpace.free(p, 1.5) || (!shelter && !ok(p, s.dir, POLE_BUILDING_GAP))) continue;
    busSpace.add(p);
    out.busStops.push({ p, a, shelter });
  }

  // ---- 路燈:主要道路與 lit=yes 的路,等距;寬路兩側交錯,窄路只立右側(單行道分開畫的兩條各立外側) ----
  const lightSpace = new Spacing(LIGHT_MIN_GAP);
  const lightOrTree = new Spacing(CLEAR_LIGHT);
  for (const s of out.signals) lightOrTree.add(s.p);
  for (const r of roads) {
    if (r.bridge || !(r.lit || (LIGHT_HIGHWAYS as readonly string[]).includes(r.highway)) || r.highway === 'service') continue;
    const sides = r.width >= LIGHT_BOTH_SIDES ? [-1, 1] : [-1];
    const cum = cumLength(r.pts);
    const len = cum[cum.length - 1];
    for (const side of sides) {
      for (let s = side < 0 ? LIGHT_SPACING / 2 : LIGHT_SPACING; s < len - 3; s += LIGHT_SPACING) {
        const { p: c, dir } = pointAt(r.pts, cum, s);
        const n = leftNormal(dir);
        const e = r.width / 2 + LIGHT_CURB;
        const p: Pt = [c[0] + n[0] * e * side, c[1] + n[1] * e * side];
        if (!lightSpace.free(p) || !lightOrTree.free(p) || !busClear(p) || !clearOfCrosswalk(p) || !ok(p, dir, POLE_BUILDING_GAP)) continue;
        lightSpace.add(p);
        lightOrTree.add(p);
        out.lights.push({ p, a: Math.atan2(-n[1] * side, -n[0] * side) });
      }
    }
  }

  // ---- 行道樹:主要道路、人行道夠寬,兩側等距(前後亂移);樹穴靠路緣 ----
  const minWidthByName = new Map<string, number>();
  for (const r of roads) if (r.name) minWidthByName.set(r.name, Math.min(minWidthByName.get(r.name) ?? Infinity, r.width));
  const treeSpace = new Spacing(TREE_MIN_GAP);
  for (const r of roads) {
    if (r.bridge || r.sidewalk < TREE_MIN_SIDEWALK || !(TREE_HIGHWAYS as readonly string[]).includes(r.highway)) continue;
    const cum = cumLength(r.pts);
    const len = cum[cum.length - 1];
    const e = r.width / 2 + Math.min(TREE_CURB_MAX, r.sidewalk / 2);
    const kind = treeKindOf({ id: r.id, name: r.name, width: r.name ? (minWidthByName.get(r.name) ?? r.width) : r.width });
    for (const side of [-1, 1]) {
      let k = 0;
      for (let s0 = TREE_SPACING / 2; s0 < len - 2; s0 += TREE_SPACING, k++) {
        const j = ((hash32(r.id * 977 + k * 2 + (side > 0 ? 1 : 0)) % 1000) / 1000 - 0.5) * 2 * TREE_JITTER;
        const s = Math.max(1, Math.min(len - 1, s0 + j));
        const { p: c, dir } = pointAt(r.pts, cum, s);
        const n = leftNormal(dir);
        const p: Pt = [c[0] + n[0] * e * side, c[1] + n[1] * e * side];
        if (!treeSpace.free(p) || !lightOrTree.free(p) || !busClear(p) || !clearOfCrosswalk(p) || !ok(p, dir, TREE_BUILDING_GAP)) continue;
        treeSpace.add(p);
        out.trees.push(p);
        out.treeKinds.push(kind);
      }
    }
  }

  // ---- 機車排:店面建築前、人行道靠建築側,垂直於道路;連續可停的格子再切成一排一排 ----
  const shops = new Grid<Pt[]>();
  for (const r of obstacles.shops ?? []) addRing(shops, r, SCOOTER_SHOP_REACH);
  const scooterSpace = new Spacing(SCOOTER_SLOT * 0.9);
  const half = SCOOTER_LEN / 2;
  for (const r of roads) {
    if (r.bridge || r.sidewalk < SCOOTER_MIN_SIDEWALK || (SCOOTER_SKIP_HIGHWAYS as readonly string[]).includes(r.highway)) continue;
    const cum = cumLength(r.pts);
    const len = cum[cum.length - 1];
    // 機車中心:人行道外緣往內半個車長再留 0.2 m
    const e = r.width / 2 + r.sidewalk - half - 0.2;
    for (const side of [-1, 1]) {
      const slots: { p: Pt; dir: Pt; n: Pt }[] = [];
      const flush = () => {
        // 連續格子切成排:每排 GROUP_MIN–MAX 台,排間空 GAP_MIN–MAX 格(長度由道路 id、位置雜湊決定)
        let i = 0, k = 0;
        while (i + SCOOTER_GROUP_MIN <= slots.length) {
          const h = hash32(r.id * 7919 + (side > 0 ? 1 : 0) * 104729 + Math.round(cum[0] + i) * 31 + k++);
          const n = Math.min(slots.length - i, SCOOTER_GROUP_MIN + (h % (SCOOTER_GROUP_MAX - SCOOTER_GROUP_MIN + 1)));
          if (n >= SCOOTER_GROUP_MIN) {
            const g = slots.slice(i, i + n);
            for (const sl of g) scooterSpace.add(sl.p);
            const d = g[0].dir;
            const nn = g[0].n;
            out.scooters.push({ p: g[0].p, a: Math.atan2(d[1], d[0]), n, f: Math.atan2(nn[1] * side, nn[0] * side) });
          }
          i += n + SCOOTER_GAP_MIN + ((h >>> 8) % (SCOOTER_GAP_MAX - SCOOTER_GAP_MIN + 1));
        }
        slots.length = 0;
      };
      for (let s = 2; s < len - 2; s += SCOOTER_SLOT) {
        const { p: c, dir } = pointAt(r.pts, cum, s);
        const n = leftNormal(dir);
        const at = (o: number): Pt => [c[0] + n[0] * o * side, c[1] + n[1] * o * side];
        const p = at(e);
        // 店面:人行道外緣往外一點的地方,在店面建築裡或旁邊
        const probe = at(r.width / 2 + r.sidewalk + 1);
        const shop = shops.near(probe).some((ring) => pointInPolygon(probe, ring) || ringDist(probe, ring) < SCOOTER_SHOP_REACH);
        const free =
          shop &&
          scooterSpace.free(p) &&
          [at(e - half), p, at(e + half)].every((q) => treeSpace.free(q, 0.7) && lightOrTree.free(q, 0.7) && busClear(q) && ok(q, dir, 0.1)) &&
          clearOfCrosswalk(p) &&
          // 直線段才停(彎道上一排會扇開)
          (slots.length === 0 || Math.abs(slots[slots.length - 1].dir[0] * dir[0] + slots[slots.length - 1].dir[1] * dir[1]) > 0.995);
        if (free) slots.push({ p, dir, n });
        else flush();
      }
      flush();
    }
  }

  // ---- 直式招牌:店面建築面向道路的外牆,二樓以上,垂直外牆伸出 ----
  // 每面招牌各自檢查(驗收 2026-11-01):
  // - 面向道路:招牌外側 1 m 的點,離一條和外牆大致平行的道路的人行道外緣 SIGN_ROAD_REACH 內(原本只看外牆中點,60 面前方沒有路);
  // - 板子沿伸出方向取 3 點:不插進其他建築(原本只看尖端,5 面板身插進別棟);
  //   伸到車道上方是允許的:招牌在 3.4 m 以上、車子過得去,舊城區窄街的外牆貼著路,台灣的招牌本來就會伸到路上;
  //   一度禁止,結果舊城區整條街的招牌都不見(0015 §11.10);
  // - 兩棟共用同一道外牆時只掛一面(20 面完全重疊會閃爍)。
  const signSpace = new Spacing(0.5);
  for (const b of obstacles.shopBuildings ?? []) {
    if (b.h < SIGN_BOTTOM + SIGN_MIN_H + SIGN_TOP_GAP) continue;
    const ring = signedArea(b.ring) > 0 ? b.ring : [...b.ring].reverse();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 3) continue;
      const t: Pt = [dx / len, dz / len];
      // 逆時針外框:外側法向量在行進方向右手邊
      const n: Pt = [t[1], -t[0]];
      let k = 0;
      for (let u = 1; u <= len - 1; u += SIGN_SPACING, k++) {
        const h = hash32(b.id * 131 + i * 17 + k);
        if ((h % 1000) / 1000 >= SIGN_CHANCE) continue;
        const p: Pt = [a[0] + t[0] * u, a[1] + t[1] * u];
        const at = (e: number): Pt => [p[0] + n[0] * e, p[1] + n[1] * e];
        const probe = at(1);
        const facing = segs.near(probe).some((sg) => Math.abs(sg.dir[0] * t[0] + sg.dir[1] * t[1]) > 0.8 && segDist(probe, sg.a, sg.b) < sg.half + sg.sidewalk + SIGN_ROAD_REACH);
        if (!facing || !signSpace.free(p)) continue;
        const board = [SIGN_WALL_GAP, SIGN_WALL_GAP + SIGN_DEPTH / 2, SIGN_WALL_GAP + SIGN_DEPTH].map(at);
        if (board.some((q) => solids.near(q).some((r) => pointInPolygon(q, r)))) continue;
        const y1 = Math.min(b.h - SIGN_TOP_GAP, SIGN_BOTTOM + SIGN_MIN_H + (((h >>> 10) % 1000) / 1000) * (SIGN_MAX_H - SIGN_MIN_H));
        if (y1 - SIGN_BOTTOM < SIGN_MIN_H) continue;
        signSpace.add(p);
        out.signs.push({ p, a: Math.atan2(n[1], n[0]), y0: SIGN_BOTTOM, y1, c: (h >>> 20) % SIGN_COLORS });
      }
    }
  }
  return out;
}
