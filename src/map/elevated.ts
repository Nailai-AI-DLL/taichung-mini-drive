// 高架快速道路(如台 74 線 快官霧峰線)、陸橋(如光明陸橋)與上下匝道(trunk_link 等)的 3D 高程計算與平滑細分。
// 不依賴 DOM 與 three.js,建置端與執行端共用。
import type { Pt } from '../world/gen/geom';
import { QUANT, type WorldJson, type WorldRoad } from './types';

/** 高架道路主線預設淨空高度(公尺;低於捷運綠線的 10 m,符合一般高架公路與陸橋高度) */
export const ELEVATED_DECK_Y = 8.5;
/** 匝道坡段細分間距(公尺):讓垂直 S 曲線(緩坡進出)平滑不跳車 */
export const RAMP_SUBDIV_M = 12;

/**
 * 匝道垂直緩動曲線(t ∈ [0, 1]):
 * 混合 25% 線性與 75% Hermite Smoothstep(3t² − 2t³),讓匝道在接地面(t=0)與接高架主線(t=1)兩端斜率平緩過渡。
 */
export function easeRamp(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 0.25 * u + 0.75 * u * u * (3 - 2 * u);
}

/**
 * 將帶有線性高程 elev 的折線做坡段細分(每段 ≤ RAMP_SUBDIV_M)並套用 easeRamp 垂直平滑曲線。
 * 由於細分點皆位於原折線線段上(共線),2D 折線總長度維持 100% 不變。
 */
export function subdivideElevatedPolyline(
  pts: Pt[],
  elev: number[],
  deckY?: number,
  maxStep = RAMP_SUBDIV_M,
): { pts: Pt[]; elev: number[] } {
  if (pts.length < 2 || elev.length !== pts.length) return { pts, elev };
  const topY = deckY ?? Math.max(ELEVATED_DECK_Y, ...elev);
  const outPts: Pt[] = [pts[0]];
  const outElev: number[] = [Math.round(topY * easeRamp(elev[0] / topY) * 1000) / 1000];

  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const y0 = elev[i], y1 = elev[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // 有坡度變化時每 maxStep 公尺細分一點;平坦高架主線維持原折點即可
    const sloped = Math.abs(y1 - y0) > 0.02;
    const n = sloped ? Math.max(1, Math.ceil(len / maxStep)) : 1;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const yLin = y0 + (y1 - y0) * u;
      outPts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      outElev.push(Math.round(topY * easeRamp(yLin / topY) * 1000) / 1000);
    }
  }
  return { pts: outPts, elev: outElev };
}

/**
 * 建置端使用:自動辨識高架主線(highway=trunk、陸橋主跨)與上下匝道(trunk_link、陸橋引道),
 * 以 Dijkstra 最短路徑比值 dg / (dg + dt) 算出所有匝道節點的連續線性高程並寫入 road.layer 與 road.elev(量化整數)。
 * 回傳被標記為高架/匝道的道路數量。
 */
export function assignElevatedRoads(roads: WorldRoad[], deckY = ELEVATED_DECK_Y): number {
  const keyOf = (qx: number, qz: number) => `${qx},${qz}`;
  const ptKeys = (r: WorldRoad): string[] => {
    const out: string[] = [];
    for (let i = 0; i + 1 < r.pts.length; i += 2) out.push(keyOf(r.pts[i], r.pts[i + 1]));
    return out;
  };

  // 1. 收集所有非高架、非陸橋的一般平面道路節點(排除地下道)
  const isUnderpass = (r: WorldRoad) => r.name.includes('地下道');
  const groundRoadNodes = new Set<string>();
  for (const r of roads) {
    if ((r.highway !== 'trunk' && r.highway !== 'trunk_link' && !r.name.includes('陸橋')) || isUnderpass(r)) {
      for (const k of ptKeys(r)) groundRoadNodes.add(k);
    }
  }

  // 2. 分類高架主線(topIndices)與上下匝道/引道(rampIndices)
  const topIndices = new Set<number>();
  const rampIndices = new Set<number>();
  roads.forEach((r, idx) => {
    const ks = ptKeys(r);
    if (ks.length < 2 || isUnderpass(r)) return;
    if (r.highway === 'trunk') {
      topIndices.add(idx);
    } else if (r.highway === 'trunk_link') {
      rampIndices.add(idx);
    } else if (r.name.includes('陸橋')) {
      // 陸橋:端點有碰到一般平面道路的是兩端引道(ramp);兩端都只接陸橋本身的是跨越路口的主跨(top)
      if (groundRoadNodes.has(ks[0]) || groundRoadNodes.has(ks[ks.length - 1])) {
        rampIndices.add(idx);
      } else {
        topIndices.add(idx);
      }
    }
  });

  if (!topIndices.size && !rampIndices.size) return 0;

  // 3. 建立高架主線節點集合與匝道鄰接圖
  const topNodes = new Set<string>();
  for (const idx of topIndices) {
    for (const k of ptKeys(roads[idx])) topNodes.add(k);
  }

  const rampNodeWays = new Map<string, Set<number>>();
  const adj = new Map<string, { to: string; d: number }[]>();
  const addEdge = (u: string, v: string, d: number) => {
    let list = adj.get(u);
    if (!list) adj.set(u, (list = []));
    list.push({ to: v, d });
  };

  for (const idx of rampIndices) {
    const r = roads[idx];
    const ks = ptKeys(r);
    for (const k of ks) {
      let s = rampNodeWays.get(k);
      if (!s) rampNodeWays.set(k, (s = new Set()));
      s.add(idx);
    }
    for (let i = 0; i + 1 < ks.length; i++) {
      const dx = (r.pts[(i + 1) * 2] - r.pts[i * 2]) / QUANT;
      const dz = (r.pts[(i + 1) * 2 + 1] - r.pts[i * 2 + 1]) / QUANT;
      const d = Math.hypot(dx, dz);
      addEdge(ks[i], ks[i + 1], d);
      addEdge(ks[i + 1], ks[i], d);
    }
  }

  // 4. 找出匝道的地面端錨點(碰到平面道路,或未接高架主線的匝道自由端/邊界端)
  const groundAnchors = new Set<string>();
  for (const idx of rampIndices) {
    const ks = ptKeys(roads[idx]);
    for (const endKey of [ks[0], ks[ks.length - 1]]) {
      if (!topNodes.has(endKey) && (groundRoadNodes.has(endKey) || (rampNodeWays.get(endKey)?.size ?? 0) === 1)) {
        groundAnchors.add(endKey);
      }
    }
  }

  // 5. Dijkstra 計算每個匝道節點到地面端(dGround)與到高架主線端(dTop)的最短路徑距離
  const dijkstra = (sources: Iterable<string>): Map<string, number> => {
    const dist = new Map<string, number>();
    const queue: [number, string][] = [];
    for (const s of sources) {
      if (adj.has(s)) {
        dist.set(s, 0);
        queue.push([0, s]);
      }
    }
    while (queue.length > 0) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d0, u] = queue.shift()!;
      if (d0 > (dist.get(u) ?? Infinity)) continue;
      for (const { to, d } of adj.get(u) ?? []) {
        const nd = d0 + d;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          queue.push([nd, to]);
        }
      }
    }
    return dist;
  };

  const dGround = dijkstra(groundAnchors);
  const dTop = dijkstra(topNodes);

  // 6. 寫入 layer 與量化高程 elev
  let count = 0;
  for (const idx of topIndices) {
    const r = roads[idx];
    const n = r.pts.length / 2;
    r.layer = 1;
    r.elev = new Array<number>(n).fill(Math.round(deckY * QUANT));
    count++;
  }
  for (const idx of rampIndices) {
    const r = roads[idx];
    const ks = ptKeys(r);
    r.layer = 1;
    r.elev = ks.map((k) => {
      if (topNodes.has(k)) return Math.round(deckY * QUANT);
      if (groundAnchors.has(k)) return 0;
      const dg = dGround.get(k) ?? Infinity;
      const dt = dTop.get(k) ?? Infinity;
      if (Number.isFinite(dg) && Number.isFinite(dt) && dg + dt > 1e-6) {
        return Math.round(deckY * (dg / (dg + dt)) * QUANT);
      }
      return Number.isFinite(dt) ? Math.round(deckY * QUANT) : 0;
    });
    count++;
  }
  return count;
}

/**
 * 清除原本誤畫在地面上的高架道路/匝道 2D 標線(street.strips)與中央分隔島(street.medians):
 * 若某條地面標線或分隔島的多數取樣點緊貼在懸空高架道路(> 0.35 m)正下方,且不屬於下方平面道路,則予以濾除。
 */
export function cleanElevatedGroundStreet(json: WorldJson): number {
  const street = json.street;
  if (!street) return 0;

  interface Seg2D {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    y0: number;
    y1: number;
    hw: number;
    dx: number;
    dz: number;
    len: number;
  }

  const elevSegs: Seg2D[] = [];
  const groundSegs: Seg2D[] = [];

  for (const r of json.roads) {
    const isElev = (r.layer ?? 0) > 0 && r.elev && r.elev.some((e) => e > 35);
    const hw = r.width * 0.5;
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const ax = r.pts[i] / QUANT, az = r.pts[i + 1] / QUANT;
      const bx = r.pts[i + 2] / QUANT, bz = r.pts[i + 3] / QUANT;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const idx = i / 2;
      const y0 = isElev ? (r.elev![idx] ?? 0) / QUANT : 0;
      const y1 = isElev ? (r.elev![idx + 1] ?? y0 * QUANT) / QUANT : 0;
      const seg: Seg2D = { ax, az, bx, bz, y0, y1, hw, dx: dx / len, dz: dz / len, len };
      if (isElev) elevSegs.push(seg);
      else groundSegs.push(seg);
    }
  }

  if (!elevSegs.length) return 0;

  const isShadowOfElevated = (pts: number[]): boolean => {
    if (pts.length < 4) return false;
    const sx = (pts[pts.length - 2] - pts[0]) / QUANT;
    const sz = (pts[pts.length - 1] - pts[1]) / QUANT;
    const sl = Math.hypot(sx, sz) || 1;
    const ux = sx / sl, uz = sz / sl;

    let total = 0;
    let onElevOnly = 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const px = pts[i] / QUANT, pz = pts[i + 1] / QUANT;
      total++;
      let hitElev = false;
      for (const s of elevSegs) {
        const vx = px - s.ax, vz = pz - s.az;
        const proj = Math.max(0, Math.min(s.len, vx * s.dx + vz * s.dz));
        const d = Math.hypot(px - (s.ax + s.dx * proj), pz - (s.az + s.dz * proj));
        if (d > s.hw + 0.8) continue;
        const y = s.y0 + ((s.y1 - s.y0) * proj) / s.len;
        const cos = Math.abs(ux * s.dx + uz * s.dz);
        if (y > 0.35 && cos > 0.85) {
          hitElev = true;
          break;
        }
      }
      if (!hitElev) continue;

      let hitGroundParallel = false;
      for (const g of groundSegs) {
        const vx = px - g.ax, vz = pz - g.az;
        const proj = Math.max(0, Math.min(g.len, vx * g.dx + vz * g.dz));
        const d = Math.hypot(px - (g.ax + g.dx * proj), pz - (g.az + g.dz * proj));
        if (d > g.hw + 0.4) continue;
        const cos = Math.abs(ux * g.dx + uz * g.dz);
        if (cos > 0.85) {
          hitGroundParallel = true;
          break;
        }
      }
      if (!hitGroundParallel) onElevOnly++;
    }
    return total > 0 && onElevOnly / total >= 0.5;
  };

  const beforeStrips = street.strips.length;
  const beforeMedians = street.medians.length;
  street.strips = street.strips.filter((s) => !isShadowOfElevated(s.pts));
  street.medians = street.medians.filter((m) => !isShadowOfElevated(m.pts));
  return beforeStrips - street.strips.length + (beforeMedians - street.medians.length);
}
