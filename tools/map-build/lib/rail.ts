// 高架捷運(decisions/0030):從 OSM 的捷運軌道(兩條平行的主線)算出一條橋的中心線、墩柱位置與車站位置。
// 輸出不量化,由 build.ts 量化後寫進 world.json 的 viaduct。位置只由資料決定,每次建置結果一樣。
import type { Pt } from '../../../src/world/gen/geom';
import { VIADUCT } from '../../../src/config/viaduct';

export interface ViaductResult {
  /** 橋中心線(可能被地圖邊界切成好幾段) */
  lines: Pt[][];
  /** 墩柱:位置與橋的方向(弧度,atan2(z, x)) */
  piers: { p: Pt; a: number }[];
  /** 車站:投影到中心線上的位置與橋的方向 */
  stations: { name: string; p: Pt; a: number }[];
  /** 統計:想放墩柱的位置數、因為在車道上而沒放的數量 */
  pierSlots: number;
  pierSkipped: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestOnLine(p: Pt, line: Pt[]): { d: number; q: Pt; dir: Pt } {
  let best = { d: Infinity, q: line[0], dir: [1, 0] as Pt };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    const q: Pt = [a[0] + dx * t, a[1] + dz * t];
    const d = dist(p, q);
    if (d < best.d) {
      const l = Math.sqrt(l2);
      best = { d, q, dir: [dx / l, dz / l] };
    }
  }
  return best;
}
const cumLen = (line: Pt[]) => {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + dist(line[i], line[i - 1]));
  return c;
};
function at(line: Pt[], cum: number[], s: number): { p: Pt; dir: Pt } {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = line[i - 1], b = line[i];
  const l = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / l));
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
}

/** 把端點相接的線段串成長線(端點距離 < 1 m 視為相接) */
export function chainLines(ways: Pt[][]): Pt[][] {
  const left = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const out: Pt[][] = [];
  while (left.length) {
    let line = left.pop()!;
    for (let grown = true; grown; ) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const head = line[0], tail = line[line.length - 1];
        if (dist(tail, w[0]) < 1) line = [...line, ...w.slice(1)];
        else if (dist(tail, w[w.length - 1]) < 1) line = [...line, ...w.reverse().slice(1)];
        else if (dist(head, w[w.length - 1]) < 1) line = [...w, ...line.slice(1)];
        else if (dist(head, w[0]) < 1) line = [...w.reverse(), ...line.slice(1)];
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(line);
  }
  return out.sort((a, b) => cumLen(b).at(-1)! - cumLen(a).at(-1)!);
}

/**
 * tracks = 主線軌道(世界座標);stations = 車站點;roads = 所有道路(墩柱要避開車道);
 * bounds = 地圖範圍 [minX, minZ, maxX, maxZ](橋只留在範圍內的部分)。
 */
export function buildViaduct(
  tracks: Pt[][],
  stations: { name: string; p: Pt }[],
  roads: { pts: Pt[]; width: number }[],
  bounds: readonly [number, number, number, number],
  cfg = VIADUCT,
): ViaductResult {
  const res: ViaductResult = { lines: [], piers: [], stations: [], pierSlots: 0, pierSkipped: 0 };
  const chains = chainLines(tracks);
  if (!chains.length) return res;
  // 最長的那條當基準;每 5 m 取一點,和另一條軌道(20 m 內)取中點 = 橋中心線
  const base = chains[0], others = chains.slice(1);
  const cb = cumLen(base);
  const center: Pt[] = [];
  for (let s = 0; s <= cb[cb.length - 1]; s += 5) {
    const { p } = at(base, cb, s);
    let mate: Pt | null = null, md = 20;
    for (const o of others) {
      const n = nearestOnLine(p, o);
      if (n.d < md) {
        md = n.d;
        mate = n.q;
      }
    }
    center.push(mate ? [(p[0] + mate[0]) / 2, (p[1] + mate[1]) / 2] : p);
  }
  // 只留地圖範圍內的部分(連續的點成一段)
  const inside = (p: Pt) => p[0] >= bounds[0] && p[1] >= bounds[1] && p[0] <= bounds[2] && p[1] <= bounds[3];
  let cur: Pt[] = [];
  for (const p of center) {
    if (inside(p)) cur.push(p);
    else if (cur.length) {
      if (cur.length >= 2) res.lines.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) res.lines.push(cur);

  // 道路線段的格子索引(墩柱避開車道)
  const CELL = 60;
  const grid = new Map<string, { a: Pt; b: Pt; half: number }[]>();
  for (const r of roads)
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], m = r.width / 2 + 5;
      for (let gx = Math.floor((Math.min(a[0], b[0]) - m) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + m) / CELL); gx++)
        for (let gz = Math.floor((Math.min(a[1], b[1]) - m) / CELL); gz <= Math.floor((Math.max(a[1], b[1]) + m) / CELL); gz++) {
          const k = gx + ',' + gz;
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push({ a, b, half: r.width / 2 });
        }
    }
  const reach = Math.hypot(cfg.pierHalf[0], cfg.pierHalf[1]);
  const near = (p: Pt) => {
    const out = new Set<{ a: Pt; b: Pt; half: number }>();
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const s of grid.get(Math.floor(p[0] / CELL) + gx + ',' + (Math.floor(p[1] / CELL) + gz)) ?? []) out.add(s);
    return out;
  };
  /** 墩柱位置:先橫向挪到兩側平行車道中間,再檢查橫交道路;放不下回傳 null */
  const place = (p0: Pt, dir: Pt): Pt | null => {
    const n: Pt = [-dir[1], dir[0]];
    // 兩側最近的平行車道邊緣離中心線多遠(正 = 有空隙,負 = 中心線在車道裡)
    let left = cfg.pierSideMax * 2, right = cfg.pierSideMax * 2;
    const cross: { a: Pt; b: Pt; half: number }[] = [];
    for (const s of near(p0)) {
      const l = dist(s.a, s.b);
      if (!l) continue;
      const cos = Math.abs(((s.b[0] - s.a[0]) * dir[0] + (s.b[1] - s.a[1]) * dir[1]) / l);
      if (cos < cfg.pierParallelCos) {
        cross.push(s);
        continue;
      }
      const q = nearestOnLine(p0, [s.a, s.b]);
      // 只看正旁邊的(最近點不在線段端點外太遠)
      if (Math.abs((q.q[0] - p0[0]) * dir[0] + (q.q[1] - p0[1]) * dir[1]) > 2) continue;
      const side = (q.q[0] - p0[0]) * n[0] + (q.q[1] - p0[1]) * n[1];
      if (side >= 0) left = Math.min(left, side - s.half);
      else right = Math.min(right, -side - s.half);
    }
    const shift = Math.max(-cfg.pierSideMax, Math.min(cfg.pierSideMax, (left - right) / 2));
    const p: Pt = [p0[0] + n[0] * shift, p0[1] + n[1] * shift];
    for (const s of cross) if (nearestOnLine(p, [s.a, s.b]).d < s.half + reach + cfg.pierClear) return null;
    return p;
  };
  for (const line of res.lines) {
    const cum = cumLen(line);
    const len = cum[cum.length - 1];
    // 站體範圍(沿線位置):墩柱加密(照片:站體段柱距比一般高架段密)
    const stationS: number[] = [];
    for (const st of stations) {
      const n = nearestOnLine(st.p, line);
      if (n.d < 60) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < cum.length; k++) {
          const d = dist(line[k], n.q);
          if (d < bd) [bd, best] = [d, cum[k]];
        }
        stationS.push(best);
      }
    }
    const slots: number[] = [];
    for (let s = cfg.pierSpacing / 2; s < len; s += cfg.pierSpacing) slots.push(s);
    for (const s0 of stationS)
      for (let s = s0 - cfg.stationHalf[0] + cfg.stationPierSpacing / 2; s < s0 + cfg.stationHalf[0]; s += cfg.stationPierSpacing)
        if (!slots.some((x) => Math.abs(x - s) < cfg.stationPierSpacing * 0.6)) slots.push(s);
    slots.sort((x, y) => x - y);
    for (const s of slots) {
      res.pierSlots++;
      let placed = false;
      for (const shift of cfg.pierShift) {
        const t = s + shift;
        if (t < 1 || t > len - 1) continue;
        const { p: p0, dir } = at(line, cum, t);
        const p = place(p0, dir);
        if (!p) continue;
        res.piers.push({ p, a: Math.atan2(dir[1], dir[0]) });
        placed = true;
        break;
      }
      if (!placed) res.pierSkipped++;
    }
    for (const st of stations) {
      const n = nearestOnLine(st.p, line);
      if (n.d < 60 && !res.stations.some((x) => x.name === st.name)) res.stations.push({ name: st.name, p: n.q, a: Math.atan2(n.dir[1], n.dir[0]) });
    }
  }
  return res;
}
