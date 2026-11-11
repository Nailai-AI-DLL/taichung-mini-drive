// 建築擠出:圓角、外牆、屋頂、女兒牆。建置端與執行端共用。
import { signedArea, type Pt } from './geom';
import { packBuildingCode, type MeshBuilder } from './mesh';
import { FLOOR_HEIGHT, KIND } from '../../config/buildings';

/** 不畫窗、不畫店面的建築代碼:女兒牆、最上面不滿一層的那段牆(否則窗會被屋頂線切半或畫在女兒牆上) */
export const PLAIN_CODE = packBuildingCode(KIND.Low, false, 0);

/** 圓角半徑上限與每個角的分段數(可愛化:建築轉角圓潤) */
const CORNER_RADIUS = 1.2;
const CORNER_SEGMENTS = 2;
/** 轉折超過約 60°(兩面牆外側法向量夾角餘弦 < 0.5)的轉角,牆面頂點分開、各用自己的法向量,轉角才是硬邊;
 *  圓角每段只轉約 45°,仍然共用頂點、平滑著色 */
const SHARP_COS = 0.5;
/** 女兒牆:高度與內縮(公尺) */
export const PARAPET_HEIGHT = 0.6;
const PARAPET_INSET = 0.35;

/**
 * 轉角圓角:每個頂點往兩側各退 d(不超過相鄰邊長的 30%),中間用二次貝茲曲線補成弧。
 * ring 需為 signedArea > 0 的繞向。sharp[i] = true 的頂點不做圓角(和隔壁建築相接的轉角,
 * 削掉會在連棟透天之間留下星形破洞;decisions/0015 §10.6)。
 */
export function roundCorners(ring: Pt[], radius = CORNER_RADIUS, segments = CORNER_SEGMENTS, sharp?: readonly boolean[]): Pt[] {
  const n = ring.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const d = Math.min(radius, l1 * 0.3, l2 * 0.3);
    // 幾乎共線的頂點不需要圓角
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    if (sharp?.[i] || d < 0.05 || Math.abs(cross) < 1e-6 * l1 * l2 + 1e-9) {
      out.push(cur);
      continue;
    }
    const a: Pt = [cur[0] + ((prev[0] - cur[0]) * d) / l1, cur[1] + ((prev[1] - cur[1]) * d) / l1];
    const b: Pt = [cur[0] + ((next[0] - cur[0]) * d) / l2, cur[1] + ((next[1] - cur[1]) * d) / l2];
    for (let k = 0; k <= segments; k++) {
      const t = k / segments;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * cur[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cur[1] + t * t * b[1]]);
    }
  }
  return out;
}

/** 多邊形內縮(沿斜接方向移動頂點);太窄或自交時回傳 null */
export function insetRing(ring: Pt[], d: number): Pt[] | null {
  const n = ring.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    // signedArea > 0 時內側在行進方向左手邊:(-dz, dx)
    const n1 = leftNormal(prev, cur);
    const n2 = leftNormal(cur, next);
    let mx = n1[0] + n2[0];
    let mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return null;
    mx /= ml;
    mz /= ml;
    const dot = mx * n1[0] + mz * n1[1];
    if (dot < 0.3) return null; // 太尖的角,放棄女兒牆
    out.push([cur[0] + (mx * d) / dot, cur[1] + (mz * d) / dot]);
  }
  // 內縮後面積要明顯為正且變小,否則視為自交
  const a0 = signedArea(ring);
  const a1 = signedArea(out);
  if (!(a1 > 0 && a1 < a0)) return null;
  return out;
}

function leftNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
}

/**
 * 擠出建築:轉角圓角 → 外牆 → 屋頂(女兒牆內縮處為屋頂色)→ 女兒牆。
 * holes 是中庭(OSM multipolygon 的內環):中庭牆面朝向中庭內側,屋頂挖空;有中庭時不做女兒牆。
 * sharp 與 ring0 的頂點一一對應:true = 這個轉角不做圓角(和隔壁建築相接)。
 * parapet = false 時不做女兒牆(有斜屋頂的廟宇,否則女兒牆會從屋簷穿出)。
 * 高度不是層高的倍數時,最後一個整層以上的那段牆另外擠出、用 PLAIN_CODE,窗不會被切半。
 * 窗格、店面不做幾何,由執行端材質依高度與沿牆距離畫出(src/render/building-material.ts)。
 * 回傳屋頂面(放屋頂附加物用):外框、屋頂高度、有沒有女兒牆;有中庭時回傳 null。
 */
export function extrude(
  mb: MeshBuilder,
  ring0: Pt[],
  height: number,
  rgb: [number, number, number],
  roofRgb: [number, number, number],
  holes0: Pt[][] = [],
  sharp0?: readonly boolean[],
  parapet = true,
) {
  const flip = signedArea(ring0) <= 0;
  const ccw = flip ? [...ring0].reverse() : ring0;
  const sharp = sharp0 && flip ? [...sharp0].reverse() : sharp0;
  const ring = roundCorners(ccw, CORNER_RADIUS, CORNER_SEGMENTS, sharp);
  // 中庭:先轉成逆時針做圓角,再反轉成順時針;順時針環用 addWalls 的公式,法向量正好朝向中庭內側
  const holes = holes0.map((h) => roundCorners(signedArea(h) > 0 ? h : [...h].reverse()).reverse());
  const area = signedArea(ring);
  const inner = parapet && !holes.length && area > 150 && height > 5 ? insetRing(ring, PARAPET_INSET) : null;
  const top = inner ? height + PARAPET_HEIGHT : height;
  const code = mb.code;
  const fullTop = Math.floor(height / FLOOR_HEIGHT + 1e-6) * FLOOR_HEIGHT;
  const split = fullTop >= FLOOR_HEIGHT && height - fullTop > 0.01;
  for (const r of [ring, ...holes]) {
    addWalls(mb, r, 0, split ? fullTop : top, rgb);
    if (split) {
      mb.code = PLAIN_CODE;
      addWalls(mb, r, fullTop, top, rgb);
      mb.code = code;
    }
  }
  if (inner) {
    // 女兒牆頂面(外環與內環之間)、內側牆面、屋頂;女兒牆不畫窗
    mb.code = PLAIN_CODE;
    addRim(mb, ring, inner, top, rgb);
    addWalls(mb, [...inner].reverse(), height, top, rgb);
    mb.code = code;
    mb.flatPolygon(inner, height, roofRgb);
  } else {
    mb.flatPolygon(ring, height, roofRgb, holes);
  }
  return holes.length ? null : { ring: inner ?? ring, y: height };
}

export type RoofSurface = NonNullable<ReturnType<typeof extrude>>;

/**
 * 牆面:每個環點只建上下兩個頂點,相鄰牆面共用,法向量取兩側牆面平均。
 * 圓角處因此是平滑著色,看起來更圓潤;頂點數約為「每邊 4 點」做法的一半。
 * 轉折 > 60° 的硬轉角(沒做圓角的)例外:兩面牆各建一組頂點,否則牆面在轉角附近會出現明暗漸層。
 * 內牆(女兒牆內側)傳入反轉後的環,同一公式即朝向內側。
 */
function addWalls(mb: MeshBuilder, r: Pt[], y0: number, y1: number, rgb: [number, number, number]) {
  const wall: [number, number, number] = [Math.round(rgb[0] * 0.95), Math.round(rgb[1] * 0.95), Math.round(rgb[2] * 0.95)];
  const n = r.length;
  // 每條邊的外側法向量:逆時針環的外側在右手邊 (dz, -dx)
  const en: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = r[i];
    const b = r[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    en.push([dz / len, -dx / len]);
  }
  // 多建一組和第 0 點重合的收尾頂點:沿牆距離 u 才能一路累加,最後一面牆不會從周長跳回 0。
  // 每面牆 i 的起點 / 終點頂點(下、上);平滑轉角兩面牆共用,硬轉角各建一組
  const bs: number[] = [], ts: number[] = [], be: number[] = [], te: number[] = [];
  let u = 0;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    if (i > 0) u += Math.hypot(r[k][0] - r[i - 1][0], r[k][1] - r[i - 1][1]);
    const e0 = en[(k + n - 1) % n];
    const e1 = en[k];
    const pair = (nx: number, nz: number) => [mb.vertex(r[k][0], y0, r[k][1], nx, 0, nz, wall, u), mb.vertex(r[k][0], y1, r[k][1], nx, 0, nz, wall, u)];
    if (e0[0] * e1[0] + e0[1] * e1[1] < SHARP_COS) {
      if (i > 0) [be[i - 1], te[i - 1]] = pair(e0[0], e0[1]);
      if (i < n) [bs[i], ts[i]] = pair(e1[0], e1[1]);
    } else {
      let nx = e0[0] + e1[0];
      let nz = e0[1] + e1[1];
      const l = Math.hypot(nx, nz) || 1;
      const [b, t] = pair(nx / l, nz / l);
      if (i > 0) [be[i - 1], te[i - 1]] = [b, t];
      if (i < n) [bs[i], ts[i]] = [b, t];
    }
  }
  for (let i = 0; i < n; i++) {
    const [nx, nz] = en[i];
    pushFacing(mb, bs[i], be[i], te[i], nx, nz);
    pushFacing(mb, bs[i], te[i], ts[i], nx, nz);
  }
}

/** 外環與內環之間的水平環帶(兩環點數相同,一一對應) */
function addRim(mb: MeshBuilder, outer: Pt[], inner: Pt[], y: number, rgb: [number, number, number]) {
  const n = outer.length;
  const o = outer.map((p) => mb.vertex(p[0], y, p[1], 0, 1, 0, rgb));
  const q = inner.map((p) => mb.vertex(p[0], y, p[1], 0, 1, 0, rgb));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [a, b, c, d] = [o[i], o[j], q[j], q[i]];
    if (mb.isUpward(a, b, c)) {
      mb.tri(a, b, c);
      mb.tri(a, c, d);
    } else {
      mb.tri(a, c, b);
      mb.tri(a, d, c);
    }
  }
}

/** 加三角形,並保證右手定則法向量與 (nx, 0, nz) 同向 */
function pushFacing(mb: MeshBuilder, a: number, b: number, c: number, nx: number, nz: number) {
  const p = mb.pos;
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const cx = uy * vz - uz * vy;
  const cz = ux * vy - uy * vx;
  if (cx * nx + cz * nz >= 0) mb.tri(a, b, c);
  else mb.tri(a, c, b);
}
