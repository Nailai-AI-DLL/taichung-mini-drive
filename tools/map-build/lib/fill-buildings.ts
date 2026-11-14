// 補虛構建築(decisions/0027,Cooper 2026-11-13:「增加建築物,讓場景更接近實際樣貌,兩旁都是高樓」「大路跟巷弄都補起來」)。
// OSM 在台中的建築資料很缺:路寬 ≥ 10 m 的道路兩側只有 23% 的位置旁邊有建築。這裡沿每條路的兩側,
// 在沒有建築的地方排上長方形的虛構建築(不是真實的那一棟;WorldBuilding.f = 1 標記,之後換成實際重點建築時好找)。
// 位置、大小、高度都由道路 id 與位置雜湊決定,每次建置結果一樣。全部是外觀推論,不是實測。
import { hash32, pointInPolygon, type Pt } from '../../../src/world/gen/geom';
import { FLOOR_HEIGHT, KIND, type BuildingKind } from '../../../src/config/buildings';

/** 推論:三級地段的樓層、基地面寬 / 深度(公尺)、退縮(離人行道外緣,公尺) */
export const FILL_TIERS = {
  /** 高樓區(附近既有高樓多,例:七期)或很寬的路(台灣大道) */
  tower: { floors: [15, 35], front: [22, 36], depth: [18, 28], setback: [1, 5], gap: [3, 8] },
  /** 其他大路(路寬 ≥ FILL_MAIN_WIDTH) */
  main: { floors: [5, 14], front: [12, 24], depth: [12, 20], setback: [0.2, 1.5], gap: [0, 2] },
  /** 巷弄 */
  alley: { floors: [3, 5], front: [8, 16], depth: [9, 14], setback: [0.2, 0.8], gap: [0, 1] },
} as const;
export type FillTier = keyof typeof FILL_TIERS;
export const FILL_MAIN_WIDTH = 10;
/** 路寬 ≥ 此值的路,不管在哪都排高樓 */
export const FILL_TOWER_WIDTH = 25;
/** 高樓區判定:半徑 FILL_TOWER_R 公尺內,高度 ≥ FILL_TOWER_H 公尺的既有建築 ≥ FILL_TOWER_N 棟 */
export const FILL_TOWER_H = 40;
export const FILL_TOWER_R = 250;
export const FILL_TOWER_N = 3;
/** 高樓區的巷弄樓層(不排透天) */
export const FILL_TOWER_ALLEY_FLOORS: readonly [number, number] = [8, 16];
/** 和既有建築、其他道路的人行道外緣至少留的空隙(公尺) */
export const FILL_GAP = 0.6;
/** 不沿這些道路排(停車場通道等);但它們的路面仍然不能被蓋到 */
const SKIP_HIGHWAYS = new Set(['service']);

export interface FillRoad {
  id: number;
  pts: Pt[];
  width: number;
  sidewalk: number;
  highway: string;
  bridge?: boolean;
}
export interface FillBuilding {
  ring: Pt[];
  h: number;
  kind: BuildingKind;
  tier: FillTier;
}

const CELL = 60;
class Grid<T> {
  private m = new Map<string, T[]>();
  add(x0: number, z0: number, x1: number, z1: number, v: T) {
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz;
        let l = this.m.get(k);
        if (!l) this.m.set(k, (l = []));
        l.push(v);
      }
  }
  /** 範圍內的項目(可能重複) */
  query(x0: number, z0: number, x1: number, z1: number, fn: (v: T) => boolean | void): boolean {
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) for (const v of this.m.get(gx + ',' + gz) ?? []) if (fn(v)) return true;
    return false;
  }
}

const bbox = (r: Pt[]) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of r) {
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1] as const;
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
/** 兩個凸四邊形是否重疊(分離軸) */
function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const q of [a, b])
    for (let i = 0; i < q.length; i++) {
      const p0 = q[i], p1 = q[(i + 1) % q.length];
      const nx = p1[1] - p0[1], nz = -(p1[0] - p0[0]);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of a) {
        const d = p[0] * nx + p[1] * nz;
        a0 = Math.min(a0, d); a1 = Math.max(a1, d);
      }
      for (const p of b) {
        const d = p[0] * nx + p[1] * nz;
        b0 = Math.min(b0, d); b1 = Math.max(b1, d);
      }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}

const rnd = (seed: number, k: number) => hash32(seed + Math.imul(k, 0x9e3779b1)) / 4294967296;
const pick = (r: readonly [number, number] | readonly number[], u: number) => r[0] + (r[1] - r[0]) * u;

/**
 * 沿道路兩側補建築。
 * obstacles.solid = 既有建築、地標外框;obstacles.keepOut = 綠地、運動場、水面;waterways = 河道中心線與寬度;
 * obstacles.clear = 圓形淨空區(中心、半徑):知名地點、地標周圍不補。
 * bounds = 地圖範圍 [minX, minZ, maxX, maxZ]。existingHeights 用來判定高樓區(和 solid 的前 N 個一一對應,其餘可省略)。
 */
export function fillBuildings(
  roads: FillRoad[],
  obstacles: { solid: Pt[][]; keepOut: Pt[][]; waterways?: { pts: Pt[]; w: number }[]; heights?: number[]; clear?: { p: Pt; r: number }[] },
  bounds: readonly [number, number, number, number],
): FillBuilding[] {
  type Seg = { a: Pt; b: Pt; reach: number };
  const segs = new Grid<Seg>();
  let maxReach = 0;
  // 高架橋(bridge)也算:遊戲世界是平的,高架路段一樣畫在地面、車子開得上去
  for (const r of roads) {
    const reach = r.width / 2 + (SKIP_HIGHWAYS.has(r.highway) ? 0 : r.sidewalk);
    maxReach = Math.max(maxReach, reach);
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const m = reach + FILL_GAP;
      segs.add(Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, { a, b, reach });
    }
  }
  for (const w of obstacles.waterways ?? [])
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i], b = w.pts[i + 1];
      const reach = w.w / 2 + 2;
      segs.add(Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach, { a, b, reach });
    }
  const polys = new Grid<Pt[]>();
  for (const r of [...obstacles.solid, ...obstacles.keepOut]) {
    const [x0, z0, x1, z1] = bbox(r);
    polys.add(x0 - FILL_GAP, z0 - FILL_GAP, x1 + FILL_GAP, z1 + FILL_GAP, r);
  }
  // 高樓區:既有高樓的位置
  const tall = new Grid<Pt>();
  (obstacles.heights ?? []).forEach((h, i) => {
    if (h < FILL_TOWER_H) return;
    const [x0, z0, x1, z1] = bbox(obstacles.solid[i]);
    const c: Pt = [(x0 + x1) / 2, (z0 + z1) / 2];
    tall.add(c[0], c[1], c[0], c[1], c);
  });
  const towerZone = (p: Pt) => {
    const seen = new Set<Pt>();
    tall.query(p[0] - FILL_TOWER_R, p[1] - FILL_TOWER_R, p[0] + FILL_TOWER_R, p[1] + FILL_TOWER_R, (c) => {
      if (Math.hypot(c[0] - p[0], c[1] - p[1]) <= FILL_TOWER_R) seen.add(c);
    });
    return seen.size >= FILL_TOWER_N;
  };
  const placed = new Grid<Pt[]>();
  const out: FillBuilding[] = [];

  /** 這個長方形能不能蓋:四角在地圖內、不碰道路(含人行道)、河道、既有建築、綠地水面、已補的建築 */
  const free = (q: Pt[]): boolean => {
    const [x0, z0, x1, z1] = bbox(q);
    if (x0 < bounds[0] || z0 < bounds[1] || x1 > bounds[2] || z1 > bounds[3]) return false;
    // 知名地點、地標周圍留空(decisions/0031:不然會被補的高樓包住、從街上看不到)
    for (const c of obstacles.clear ?? []) {
      const nx = Math.max(x0, Math.min(x1, c.p[0])), nz = Math.max(z0, Math.min(z1, c.p[1]));
      if (Math.hypot(nx - c.p[0], nz - c.p[1]) < c.r) return false;
    }
    // 取樣點:邊上與內部每 ≤ 2.5 m 一點
    const w = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), d = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    const nu = Math.max(2, Math.ceil(w / 2.5)), nv = Math.max(2, Math.ceil(d / 2.5));
    const pts: Pt[] = [];
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const u = i / nu, v = j / nv;
        pts.push([q[0][0] + (q[1][0] - q[0][0]) * u + (q[3][0] - q[0][0]) * v, q[0][1] + (q[1][1] - q[0][1]) * u + (q[3][1] - q[0][1]) * v]);
      }
    if (segs.query(x0, z0, x1, z1, (s) => pts.some((p) => segDist(p, s.a, s.b) < s.reach + FILL_GAP))) return false;
    if (
      polys.query(x0, z0, x1, z1, (r) => {
        if (pts.some((p) => pointInPolygon(p, r))) return true;
        // 既有外框的頂點落在長方形裡(小建築整個被包住時,取樣點可能都不在它裡面)
        return r.some((p) => pointInPolygon(p, q)) || r.some((p, i) => q.some((c) => segDist(c, p, r[(i + 1) % r.length]) < FILL_GAP));
      })
    )
      return false;
    if (placed.query(x0, z0, x1, z1, (r) => quadsOverlap(q, r))) return false;
    return true;
  };

  // 寬的路先排(先佔位置)
  const order = roads.filter((r) => !SKIP_HIGHWAYS.has(r.highway) && r.pts.length >= 2).sort((a, b) => b.width - a.width || a.id - b.id);
  for (const r of order) {
    // 累積長度
    const cum = [0];
    for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 12) continue;
    const at = (s: number): { p: Pt; dir: Pt } => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = r.pts[i - 1], b = r.pts[i];
      const l = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / l;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    };
    for (const side of [1, -1]) {
      let s = 2;
      while (s < len - 6) {
        const seed = hash32(r.id) ^ hash32(Math.round(s * 10) + (side > 0 ? 7919 : 104729));
        const mid0 = at(s);
        const tower = r.width >= FILL_TOWER_WIDTH || towerZone(mid0.p);
        const tier: FillTier = tower && r.width >= FILL_MAIN_WIDTH ? 'tower' : r.width >= FILL_MAIN_WIDTH ? 'main' : 'alley';
        const T = FILL_TIERS[tier];
        let ok = false;
        // 先試完整大小,不行就縮小兩次
        for (const shrink of [1, 0.7, 0.5]) {
          const front = Math.min(pick(T.front, rnd(seed, 1)) * shrink, len - s - 2);
          const depth = pick(T.depth, rnd(seed, 2)) * shrink;
          if (front < T.front[0] * 0.5) break;
          const { p, dir } = at(s + front / 2);
          const nx = -dir[1] * side, nz = dir[0] * side;
          const e0 = r.width / 2 + r.sidewalk + pick(T.setback, rnd(seed, 3));
          const c = (u: number, v: number): Pt => [p[0] + dir[0] * u + nx * v, p[1] + dir[1] * u + nz * v];
          // 繞向固定:沿路 → 往外 → 回來
          let q: Pt[] = [c(-front / 2, e0), c(front / 2, e0), c(front / 2, e0 + depth), c(-front / 2, e0 + depth)];
          if (side < 0) q = [q[1], q[0], q[3], q[2]];
          if (!free(q)) continue;
          // 高樓區的巷弄不排透天;高樓的樓層偏低的多、特別高的少(次方 1.4)
          const floors = Math.round(tower && tier === 'alley' ? pick(FILL_TOWER_ALLEY_FLOORS, rnd(seed, 4)) : pick(T.floors, rnd(seed, 4) ** (tier === 'tower' ? 1.4 : 1)));
          const k = rnd(seed, 5);
          const kind: BuildingKind =
            tier === 'tower' ? (k < 0.35 ? KIND.Commercial : KIND.Apartment) : tier === 'main' ? (k < 0.5 ? KIND.Apartment : k < 0.8 ? KIND.Generic : KIND.Commercial) : floors > 5 ? KIND.Apartment : k < 0.8 ? KIND.House : KIND.Generic;
          const [x0, z0, x1, z1] = bbox(q);
          placed.add(x0, z0, x1, z1, q);
          out.push({ ring: q, h: floors * FLOOR_HEIGHT, kind, tier });
          s += front + pick(T.gap, rnd(seed, 6));
          ok = true;
          break;
        }
        if (!ok) s += 4;
      }
    }
  }
  return out;
}
