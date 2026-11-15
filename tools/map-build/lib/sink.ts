// 下沉地標(秋紅谷,decisions/0035)的外框避開道路:外框會在地面挖洞、外緣立 1.1 m 擋牆,
// 所以外框不能碰到任何道路的路面 + 人行道(驗收抓到:停車場車道有 130 m 沿著外框內側走、臺灣大道人行道被蓋進 3.7 m)。
import { pointInPolygon, type Pt } from '../../../src/world/gen/geom';

export interface SinkRoad { pts: Pt[]; width: number; sidewalk: number }

/** 外框與道路走廊之間至少留這麼多(公尺) */
export const SINK_ROAD_CLEAR = 1;

function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = -1, wi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const d = Math.abs((pts[i][0] - a[0]) * dz - (pts[i][1] - a[1]) * dx) / l;
    if (d > worst) [worst, wi] = [d, i];
  }
  if (worst <= tol) return [a, b];
  return [...dp(pts.slice(0, wi + 1), tol).slice(0, -1), ...dp(pts.slice(wi), tol)];
}

/** 閉合環簡化:從離第 0 點最遠的點切成兩段各自簡化 */
function simplifyRing(ring: Pt[], tol: number): Pt[] {
  let far = 0, fd = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) [fd, far] = [d, i];
  }
  const a = dp(ring.slice(0, far + 1), tol);
  const b = dp([...ring.slice(far), ring[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * 外框扣掉所有道路走廊(半寬 + 人行道 + SINK_ROAD_CLEAR):
 * 以 CELL 公尺的格子柵格化「在外框內且不在任何走廊內」,取最大的一塊,沿格線描出輪廓再簡化。
 * 用柵格是因為沒有多邊形布林運算的套件;誤差約 1 格,對公園外框夠用。回傳新外框與被扣掉的格數。
 */
export function clearSinkOffRoads(ring0: Pt[], roads: SinkRoad[], CELL = 1): { ring: Pt[]; moved: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ring0) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 -= CELL; z0 -= CELL;
  const nx = Math.ceil((x1 - x0) / CELL) + 2, nz = Math.ceil((z1 - z0) / CELL) + 2;
  const segs: { a: Pt; b: Pt; lim: number }[] = [];
  for (const r of roads) {
    const lim = r.width / 2 + r.sidewalk + SINK_ROAD_CLEAR;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [a, b] = [r.pts[i], r.pts[i + 1]];
      if (Math.max(a[0], b[0]) + lim < x0 || Math.min(a[0], b[0]) - lim > x1 + CELL || Math.max(a[1], b[1]) + lim < z0 || Math.min(a[1], b[1]) - lim > z1 + CELL) continue;
      segs.push({ a, b, lim });
    }
  }
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
  };
  const cell = new Uint8Array(nx * nz);
  let moved = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const p: Pt = [x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL];
      if (!pointInPolygon(p, ring0)) continue;
      if (segs.some((s) => segDist(p, s.a, s.b) < s.lim)) { moved++; continue; }
      cell[j * nx + i] = 1;
    }
  if (!moved) return { ring: ring0, moved }; // 沒壓到路:原樣回傳,不引入柵格誤差
  // 最大連通塊
  const comp = new Int32Array(nx * nz).fill(-1);
  let best = -1, bestN = 0;
  for (let k = 0, id = 0; k < cell.length; k++) {
    if (!cell[k] || comp[k] >= 0) continue;
    const stack = [k];
    comp[k] = id;
    let n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const ci = c % nx, cj = (c - ci) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii;
        if (cell[q] && comp[q] < 0) { comp[q] = id; stack.push(q); }
      }
    }
    if (n > bestN) [best, bestN] = [id, n];
    id++;
  }
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && comp[j * nx + i] === best;
  // 邊界有向邊:格點座標 (i, j);內側在行進方向的左邊(x 右、z 下的座標裡)
  const next = new Map<number, number[]>();
  const key = (i: number, j: number) => j * (nx + 1) + i;
  const add = (ai: number, aj: number, bi: number, bj: number) => {
    const k = key(ai, aj);
    const l = next.get(k);
    if (l) l.push(key(bi, bj));
    else next.set(k, [key(bi, bj)]);
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!on(i, j)) continue;
      if (!on(i, j - 1)) add(i + 1, j, i, j);
      if (!on(i, j + 1)) add(i, j + 1, i + 1, j + 1);
      if (!on(i - 1, j)) add(i, j, i, j + 1);
      if (!on(i + 1, j)) add(i + 1, j + 1, i + 1, j);
    }
  // 串成環,取最長的(外圈)
  let loop: number[] = [];
  const used = new Set<string>();
  for (const [s0, outs] of next) {
    for (const e0 of outs) {
      if (used.has(s0 + ',' + e0)) continue;
      const cur = [s0];
      let a = s0, b = e0;
      used.add(a + ',' + b);
      while (b !== s0) {
        cur.push(b);
        const cand = (next.get(b) ?? []).filter((c) => !used.has(b + ',' + c));
        if (!cand.length) break;
        const c = cand[0];
        used.add(b + ',' + c);
        a = b;
        b = c;
      }
      if (cur.length > loop.length) loop = cur;
    }
  }
  const pts: Pt[] = loop.map((k) => { const i = k % (nx + 1), j = (k - i) / (nx + 1); return [x0 + i * CELL, z0 + j * CELL]; });
  return { ring: simplifyRing(pts, CELL * 1.6), moved };
}
