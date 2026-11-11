// 屋頂附加物(decisions/0015 第三批):鐵皮加蓋、水塔、屋突。純幾何,位置與有無由 OSM id 決定,每次載入都一樣。
// 擺放:以屋頂外框最長邊為長軸,在長軸兩端或中央找一個四角都落在屋頂內的矩形;放不下就不放。
import {
  KIND, ROOF_BIG_TANK_H, TEMPLE_EAVE, TEMPLE_FLARE, TEMPLE_RECT_MIN, TEMPLE_RIDGE_MAX, TEMPLE_RIDGE_RATIO, ROOF_BIG_TANK_R, ROOF_BOX_H, ROOF_BOX_MIN_FLOORS, ROOF_MIN_AREA, ROOF_SHED_CHANCE,
  ROOF_SHED_MAX_FLOORS, ROOF_SHED_RIDGE, ROOF_SHED_WALL, ROOF_TANK_H, ROOF_TANK_R, type BuildingKind,
} from '../../config/buildings';
import { hash32, pointInPolygon, signedArea, type Pt } from './geom';
import type { MeshBuilder } from './mesh';
import type { RoofSurface } from './extrude';

type Rgb = [number, number, number];
type V3 = [number, number, number];

/** 屋頂上的矩形:中心 (c),長軸 a / 短軸 b 方向的半長 */
interface Spot {
  c: Pt;
  ha: number;
  hb: number;
}

/** 屋頂座標系:長軸 a(最長邊方向)、短軸 b,以及屋頂在兩軸上的投影範圍 */
interface Frame {
  a: Pt;
  b: Pt;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

export interface RoofPropColors {
  /** 屋突外牆(和建築同色) */
  wall: Rgb;
  shed: Rgb[];
  tank: Rgb;
  /** 廟宇斜屋頂 */
  roof: Rgb;
}

/** 屋頂附加物離屋頂邊緣至少多遠(公尺);fit() 檢查時用 MARGIN,靠邊擺放時中心離邊 EDGE + 半長(多留一點給圓角) */
const MARGIN = 0.4;
const EDGE = MARGIN + 0.3;
const TANK_SEGMENTS = 8;

export function addRoofProps(mb: MeshBuilder, roof: RoofSurface, kind: BuildingKind, floors: number, id: number, colors: RoofPropColors) {
  const ring = roof.ring;
  if (signedArea(ring) < ROOF_MIN_AREA) return;
  const rnd = (k: number) => hash32(id * 31 + k) / 4294967296;
  const f = frameOf(ring);
  const y = roof.y;
  const midB = (f.b0 + f.b1) / 2;
  const lenA = f.a1 - f.a0;
  const lenB = f.b1 - f.b0;
  const atEnd = rnd(3) < 0.5;

  if (kind === KIND.Temple) {
    // 廟宇:外框接近矩形才加雙斜屋頂(屋脊沿長軸、兩端上翹),不規則外框維持平頂
    if (signedArea(ring) / (lenA * lenB) < TEMPLE_RECT_MIN) return;
    const s: Spot = { c: toWorld(f, (f.a0 + f.a1) / 2, midB), ha: lenA / 2, hb: lenB / 2 };
    gableRoof(mb, f, s, y, Math.min(TEMPLE_RIDGE_MAX, lenB * TEMPLE_RIDGE_RATIO), colors.wall, colors.roof, TEMPLE_EAVE, TEMPLE_FLARE);
    return;
  }

  if ((kind === KIND.House || kind === KIND.Generic) && floors <= ROOF_SHED_MAX_FLOORS) {
    const tankHalf = ROOF_TANK_R + 0.1;
    let shed: Spot | null = null;
    if (rnd(1) < (ROOF_SHED_CHANCE[kind] ?? 0)) {
      // 鐵皮加蓋佔屋頂長度 45–75%,靠某一端;放不下就逐步縮小寬度
      const ha = (lenA * (0.45 + 0.3 * rnd(2))) / 2;
      for (let hb = lenB * 0.42; hb > 1.2 && !shed; hb *= 0.8) {
        const ca = atEnd ? f.a0 + EDGE + ha : f.a1 - EDGE - ha;
        shed = fit(ring, f, ca, midB, ha, hb);
      }
    }
    if (shed) addShed(mb, f, shed, y, colors.shed[hash32(id * 5 + 1) % colors.shed.length]);
    if (rnd(4) < 0.8) {
      // 水塔:放在加蓋另一端的屋頂上;沒有空間就放在加蓋的屋脊上(架在鐵架上的樣子,鐵架不畫)
      const ca = atEnd ? f.a1 - EDGE - tankHalf : f.a0 + EDGE + tankHalf;
      const spot = fit(ring, f, ca, midB, tankHalf, tankHalf);
      if (spot) addTank(mb, spot.c, ROOF_TANK_R, y, y + ROOF_TANK_H, colors.tank);
      else if (shed) addTank(mb, shed.c, ROOF_TANK_R, y + ROOF_SHED_WALL + ROOF_SHED_RIDGE, y + ROOF_SHED_WALL + ROOF_SHED_RIDGE + ROOF_TANK_H, colors.tank);
    }
    return;
  }

  if ((kind === KIND.Apartment || kind === KIND.Commercial || kind === KIND.Public) && floors >= ROOF_BOX_MIN_FLOORS) {
    // 屋突在屋頂中央偏一端,1–2 個大水塔排在旁邊
    const ha = Math.min(4, lenA * 0.2);
    const hb = Math.min(3, lenB * 0.25);
    const ca = (f.a0 + f.a1) / 2 + (atEnd ? -1 : 1) * lenA * 0.12;
    const box = fit(ring, f, ca, midB, ha, hb);
    if (!box) return;
    addBox(mb, f, box, y, y + ROOF_BOX_H, colors.wall);
    const tanks = rnd(5) < 0.5 ? 1 : 2;
    const half = ROOF_BIG_TANK_R + 0.2;
    for (let i = 0; i < tanks; i++) {
      const tc = ca + (atEnd ? 1 : -1) * (ha + half + 0.3);
      const tb = midB + (tanks === 2 ? (i ? 1 : -1) * (half + 0.1) : 0);
      const spot = fit(ring, f, tc, tb, half, half);
      if (spot) addTank(mb, spot.c, ROOF_BIG_TANK_R, y, y + ROOF_BIG_TANK_H, colors.tank);
    }
  }
}

/** 長軸取屋頂外框最長的邊 */
export function frameOf(ring: Pt[]): Frame {
  let best = 0;
  let a: Pt = [1, 0];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > best) {
      best = l;
      a = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    }
  }
  const b: Pt = [-a[1], a[0]];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of ring) {
    const pa = p[0] * a[0] + p[1] * a[1];
    const pb = p[0] * b[0] + p[1] * b[1];
    a0 = Math.min(a0, pa);
    a1 = Math.max(a1, pa);
    b0 = Math.min(b0, pb);
    b1 = Math.max(b1, pb);
  }
  return { a, b, a0, a1, b0, b1 };
}

function toWorld(f: Frame, pa: number, pb: number): Pt {
  return [f.a[0] * pa + f.b[0] * pb, f.a[1] * pa + f.b[1] * pb];
}

/** 矩形(四邊各往外留 MARGIN)完全在屋頂內:四角都在屋頂內,而且四條邊不和屋頂外框相交(凹形外框也正確) */
function fit(ring: Pt[], f: Frame, ca: number, cb: number, ha: number, hb: number): Spot | null {
  if (ha <= 0 || hb <= 0) return null;
  const ea = ha + MARGIN, eb = hb + MARGIN;
  const c = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sa, sb]) => toWorld(f, ca + sa * ea, cb + sb * eb));
  if (!c.every((p) => pointInPolygon(p, ring))) return null;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < ring.length; j++) {
      if (segmentsCross(c[i], c[(i + 1) % 4], ring[j], ring[(j + 1) % ring.length])) return null;
    }
  }
  return { c: toWorld(f, ca, cb), ha, hb };
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 矩形在世界座標的四角(逆時針,從 -a -b 開始) */
function corners(f: Frame, s: Spot): Pt[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sa, sb]) => [
    s.c[0] + f.a[0] * sa * s.ha + f.b[0] * sb * s.hb,
    s.c[1] + f.a[1] * sa * s.ha + f.b[1] * sb * s.hb,
  ]);
}

/** 一個平面多邊形(扇形三角化),法向量 n,保證右手定則朝向 n */
function face(mb: MeshBuilder, pts: V3[], n: V3, rgb: Rgb) {
  const base = mb.vertexCount;
  for (const p of pts) mb.vertex(p[0], p[1], p[2], n[0], n[1], n[2], rgb);
  const [p0, p1, p2] = pts;
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  for (let i = 1; i + 1 < pts.length; i++) {
    if (dot >= 0) mb.tri(base, base + i, base + i + 1);
    else mb.tri(base, base + i + 1, base + i);
  }
}

function sides(mb: MeshBuilder, c: Pt[], y0: number, y1: number, rgb: Rgb) {
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const l = Math.hypot(dx, dz) || 1;
    // 逆時針環的外側在右手邊
    face(mb, [[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], [dz / l, 0, -dx / l], rgb);
  }
}

function addBox(mb: MeshBuilder, f: Frame, s: Spot, y0: number, y1: number, rgb: Rgb) {
  const c = ccw(corners(f, s));
  sides(mb, c, y0, y1, rgb);
  face(mb, c.map((p) => [p[0], y1, p[1]] as V3), [0, 1, 0], shade(rgb, 0.97));
}

/** 鐵皮加蓋:四面牆 + 屋脊沿長軸的雙斜屋頂 */
function addShed(mb: MeshBuilder, f: Frame, s: Spot, y: number, rgb: Rgb) {
  sides(mb, ccw(corners(f, s)), y, y + ROOF_SHED_WALL, rgb);
  gableRoof(mb, f, s, y + ROOF_SHED_WALL, ROOF_SHED_RIDGE, rgb, shade(rgb, 0.92), 0, 0);
}

/**
 * 雙斜屋頂:屋脊沿長軸、高出簷口 ridge 公尺;兩端是三角形山牆(牆色)。
 * eave = 屋簷往外伸出多少(沿坡面往下延伸;有伸出時整片坡面另加朝下的底面,從街上仰看才不會透空);
 * flare = 屋脊兩端上翹多少(廟宇燕尾的簡化)。
 */
function gableRoof(mb: MeshBuilder, f: Frame, s: Spot, y: number, ridge: number, wallRgb: Rgb, roofRgb: Rgb, eave: number, flare: number) {
  const at = (pa: number, pb: number, h: number): V3 => {
    const p = toWorld(f, pa, pb);
    return [s.c[0] + p[0], h, s.c[1] + p[1]];
  };
  const ridgeY = y + ridge;
  // 山牆(長軸兩端)
  face(mb, [at(-s.ha, -s.hb, y), at(-s.ha, s.hb, y), at(-s.ha, 0, ridgeY)], [-f.a[0], 0, -f.a[1]], wallRgb);
  face(mb, [at(s.ha, -s.hb, y), at(s.ha, s.hb, y), at(s.ha, 0, ridgeY)], [f.a[0], 0, f.a[1]], wallRgb);
  const k = ridge / s.hb;
  const nl = Math.hypot(1, k);
  const ea = s.ha + eave;
  const eb = s.hb + eave;
  const eaveY = y - eave * k;
  const under = shade(roofRgb, 0.8);
  for (const side of [-1, 1]) {
    const slope = [at(-ea, side * eb, eaveY), at(ea, side * eb, eaveY), at(ea, 0, ridgeY + flare), at(-ea, 0, ridgeY + flare)];
    const n: V3 = [(side * f.b[0] * k) / nl, 1 / nl, (side * f.b[1] * k) / nl];
    // 上翹時屋脊中段不翹:多一個中點,兩端拉高
    const mid = at(0, 0, ridgeY);
    const parts = flare > 0 ? [[slope[0], slope[1], mid], [slope[1], slope[2], mid], [slope[3], slope[0], mid]] : [slope];
    for (const pts of parts) {
      face(mb, pts, n, roofRgb);
      // 屋簷伸出時加朝下的底面(兩側與山牆端的屋簷都蓋到),從街上仰看才不會透空
      if (eave > 0) face(mb, pts, [-n[0], -n[1], -n[2]], under);
    }
  }
}

/** 圓桶水塔:側面平滑法向量 + 頂蓋 */
function addTank(mb: MeshBuilder, c: Pt, r: number, y0: number, y1: number, rgb: Rgb) {
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i <= TANK_SEGMENTS; i++) {
    const t = (i / TANK_SEGMENTS) * Math.PI * 2;
    const nx = Math.cos(t), nz = Math.sin(t);
    bottom.push(mb.vertex(c[0] + nx * r, y0, c[1] + nz * r, nx, 0, nz, rgb));
    top.push(mb.vertex(c[0] + nx * r, y1, c[1] + nz * r, nx, 0, nz, rgb));
  }
  for (let i = 0; i < TANK_SEGMENTS; i++) {
    // 角度遞增是從 +x 轉向 +z;外側法向量朝外時三角形繞向為 (b_i, t_i, b_i+1)
    mb.tri(bottom[i], top[i], bottom[i + 1]);
    mb.tri(bottom[i + 1], top[i], top[i + 1]);
  }
  const cap: Pt[] = [];
  for (let i = 0; i < TANK_SEGMENTS; i++) {
    const t = (i / TANK_SEGMENTS) * Math.PI * 2;
    cap.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]);
  }
  mb.flatPolygon(cap, y1, shade(rgb, 1.04));
}

function ccw(r: Pt[]): Pt[] {
  return signedArea(r) > 0 ? r : [...r].reverse();
}

function shade(rgb: Rgb, k: number): Rgb {
  return [Math.min(255, Math.round(rgb[0] * k)), Math.min(255, Math.round(rgb[1] * k)), Math.min(255, Math.round(rgb[2] * k))];
}
