// 建置用的 2D 幾何工具。座標皆為世界座標 [x, z](公尺)。
export type Pt = [number, number];

/** 多邊形有號面積(x-z 平面;以 x 向右、z 向下的螢幕慣例,正值 = 順時針看起來的方向) */
export function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function centroid(ring: Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
}

/** 多邊形的面積重心(頂點分布不均時,和頂點平均 centroid() 可能差十幾公尺);面積為 0 時退回頂點平均 */
export function areaCentroid(ring: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cz += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return centroid(ring);
  return [cx / (3 * a), cz / (3 * a)];
}

/** 去掉首尾重複點與連續重複點 */
export function cleanRing(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-3) out.pop();
  }
  return out;
}

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function inRect(p: Pt, r: Rect): boolean {
  return p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minZ && p[1] <= r.maxZ;
}

/** Liang–Barsky:把線段裁切到矩形,回傳裁切後線段或 null */
function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dz, a[1] - r.minZ],
    [dz, r.maxZ - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

/** 折線裁切到矩形,可能切成多段 */
export function clipPolyline(line: Pt[], r: Rect): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const seg = clipSegment(line[i], line[i + 1], r);
    if (!seg) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      continue;
    }
    const [a, b] = seg;
    const last = cur[cur.length - 1];
    if (last && Math.hypot(last[0] - a[0], last[1] - a[1]) < 1e-6) {
      cur.push(b);
    } else {
      if (cur.length > 1) out.push(cur);
      cur = [a, b];
    }
    // 線段被裁掉尾端時,下一段不會接續
    if (b[0] !== line[i + 1][0] || b[1] !== line[i + 1][1]) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((l) => l.length > 1);
}

/** Sutherland–Hodgman:多邊形裁切到矩形 */
export function clipPolygon(ring: Pt[], r: Rect): Pt[] {
  type Edge = { inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt };
  const lerpX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const lerpZ = (a: Pt, b: Pt, z: number): Pt => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= r.minX, cut: (a, b) => lerpX(a, b, r.minX) },
    { inside: (p) => p[0] <= r.maxX, cut: (a, b) => lerpX(a, b, r.maxX) },
    { inside: (p) => p[1] >= r.minZ, cut: (a, b) => lerpZ(a, b, r.minZ) },
    { inside: (p) => p[1] <= r.maxZ, cut: (a, b) => lerpZ(a, b, r.maxZ) },
  ];
  let out = ring;
  for (const e of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (e.inside(prev)) {
        out.push(e.cut(prev, cur));
      }
    }
    if (out.length === 0) break;
  }
  return out;
}

/**
 * 把多條 way(以 OSM node id 串接)組成封閉環。用於 multipolygon relation 的 outer。
 * 回傳每個環的點序列;無法閉合的片段丟棄。
 */
export function assembleRings(parts: { nodes: number[]; pts: Pt[] }[]): Pt[][] {
  const pool = parts.map((p) => ({ nodes: [...p.nodes], pts: [...p.pts] }));
  const rings: Pt[][] = [];
  while (pool.length) {
    const cur = pool.shift()!;
    let guard = 0;
    while (cur.nodes[0] !== cur.nodes[cur.nodes.length - 1] && guard++ < 1000) {
      const tail = cur.nodes[cur.nodes.length - 1];
      const i = pool.findIndex((p) => p.nodes[0] === tail || p.nodes[p.nodes.length - 1] === tail);
      if (i < 0) break;
      const nxt = pool.splice(i, 1)[0];
      if (nxt.nodes[0] !== tail) {
        nxt.nodes.reverse();
        nxt.pts.reverse();
      }
      cur.nodes.push(...nxt.nodes.slice(1));
      cur.pts.push(...nxt.pts.slice(1));
    }
    if (cur.nodes[0] === cur.nodes[cur.nodes.length - 1] && cur.pts.length >= 4) rings.push(cur.pts);
  }
  return rings;
}

/** 32 位元雜湊(由 OSM id 決定配色與小變化,保證每次建置一致) */
export function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 點是否在多邊形內(射線法,環不需封閉) */
export function pointInPolygon(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
