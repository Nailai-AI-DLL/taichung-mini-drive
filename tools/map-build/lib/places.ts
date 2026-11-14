// 知名地點(decisions/0031):算每個地點的「接送點」—— 離地點最近、站得了人的路邊。
// 規則:依距離找附近的道路(有名字、夠寬、非服務道路),在車道邊緣外 CURB 公尺處取點;
// 點不可以落在任何道路的路面上或建築裡。地點本身在道路中間(捷運站在分隔島上)時,取行車方向右側(外側)的路邊。
import { pointInPolygon, type Pt } from '../../../src/world/gen/geom';

export const PLACE_CURB = 1.0;
/** 知名地點、地標的外框往外這麼多公尺內不補虛構建築(build.ts 傳給 fillBuildings) */
export const PLACE_CLEAR = 30;
export const PLACE_MIN_ROAD = 6;
export const PLACE_REACH = 260;
const SKIP = new Set(['service', 'trunk', 'motorway']);

export interface PlaceRoad {
  name: string;
  highway: string;
  width: number;
  pts: Pt[];
}

/** farSide = 地點在路中間(捷運站在分隔島上):接送點一律取馬路對面(外側路邊),不取地點那一側 */
export function placePickup(anchor: Pt, roads: PlaceRoad[], solids: Pt[][], farSide = false): { p: Pt; road: string } | null {
  type Cand = { d: number; q: Pt; dir: Pt; r: PlaceRoad };
  const cands: Cand[] = [];
  const all: { a: Pt; b: Pt; half: number }[] = [];
  for (const r of roads)
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (Math.min(Math.abs(a[0] - anchor[0]), Math.abs(b[0] - anchor[0])) > PLACE_REACH + 200 || Math.min(Math.abs(a[1] - anchor[1]), Math.abs(b[1] - anchor[1])) > PLACE_REACH + 200) continue;
      all.push({ a, b, half: r.width / 2 });
      if (!r.name || r.width < PLACE_MIN_ROAD || SKIP.has(r.highway)) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      if (!l2) continue;
      // 不取線段兩端(路口),留 15% 的邊
      const t = Math.max(0.15, Math.min(0.85, ((anchor[0] - a[0]) * dx + (anchor[1] - a[1]) * dz) / l2));
      const q: Pt = [a[0] + dx * t, a[1] + dz * t];
      const d = Math.hypot(anchor[0] - q[0], anchor[1] - q[1]);
      const l = Math.sqrt(l2);
      if (d <= PLACE_REACH) cands.push({ d, q, dir: [dx / l, dz / l], r });
    }
  cands.sort((x, y) => x.d - y.d);
  const near = solids.filter((s) => Math.abs(s[0][0] - anchor[0]) < PLACE_REACH + 300 && Math.abs(s[0][1] - anchor[1]) < PLACE_REACH + 300);
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
  };
  for (const c of cands) {
    const half = c.r.width / 2;
    // 行車方向右側 = (−dz, dx)
    const right: Pt = [-c.dir[1], c.dir[0]];
    const lat = (anchor[0] - c.q[0]) * right[0] + (anchor[1] - c.q[1]) * right[1];
    // 地點在路面上或貼著路(捷運站在分隔島上):只取「離地點遠」的那一側(外側路邊),不取地點那一側(那是分隔島);
    // 否則先取地點那一側,不行再取對面
    const sides = farSide || Math.abs(lat) < half + 3 ? [lat > 0 ? -1 : 1] : [Math.sign(lat), -Math.sign(lat)];
    for (const s of sides) {
      const off = (half + PLACE_CURB) * s;
      const p: Pt = [c.q[0] + right[0] * off, c.q[1] + right[1] * off];
      if (all.some((g) => segDist(p, g.a, g.b) < g.half + 0.4)) continue;
      if (near.some((ring) => pointInPolygon(p, ring))) continue;
      return { p, road: c.r.name };
    }
  }
  return null;
}
