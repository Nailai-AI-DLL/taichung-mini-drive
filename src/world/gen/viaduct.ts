// 高架捷運的幾何(decisions/0030):橋面 + 兩側護欄、墩柱 + 帽梁、跨在路上的車站。全部是方塊,畫進街道傢俱的網格。
import { VIADUCT } from '../../config/viaduct';
import { hexToRgb } from '../../config/palette';
import type { FurnitureCollision } from '../../physics/world';
import { addBox, quad } from './furniture';
import type { Pt } from './geom';
import type { MeshBuilder } from './mesh';

export interface ViaductSrc {
  /** 橋面的一小段(兩端點) */
  spans: [Pt, Pt][];
  /** 墩柱:位置、橋的方向(弧度) */
  piers: { p: Pt; a: number }[];
  /** bridges = 空橋 [站體端, 建築端](decisions/0033) */
  stations: { name: string; p: Pt; a: number; bridges?: [Pt, Pt][] }[];
}

/** 把中心線切成不超過 maxLen 的小段(依中點分到格子用) */
export function viaductSpans(line: Pt[], maxLen = VIADUCT.spanLen): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) out.push([[a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n]]);
  }
  return out;
}

type Rgb = [number, number, number];

/**
 * 沿 d 方向擠出的斷面(長 2 × hl):prof = 斷面頂點 [橫向偏移(d 的左側為正), 高度],逆時針、凸多邊形。
 * 兩端封口。用在船底形裙板這種不是長方體的形狀。
 */
function addSection(mb: MeshBuilder, c: Pt, d: Pt, hl: number, prof: [number, number][], rgb: Rgb) {
  const n: Pt = [-d[1], d[0]];
  const P = (s: number, o: number, y: number): [number, number, number] => [c[0] + d[0] * hl * s + n[0] * o, y, c[1] + d[1] * hl * s + n[1] * o];
  for (let i = 0; i < prof.length; i++) {
    const [o0, y0] = prof[i], [o1, y1] = prof[(i + 1) % prof.length];
    // 斷面邊的外法向量(斷面逆時針 → 右手邊朝外)
    const eo = o1 - o0, ey = y1 - y0, l = Math.hypot(eo, ey) || 1;
    const no = ey / l, ny = -eo / l;
    quad(mb, [P(-1, o0, y0), P(1, o0, y0), P(1, o1, y1), P(-1, o1, y1)], [n[0] * no, ny, n[1] * no], rgb);
  }
  for (const s of [-1, 1]) {
    const vs = prof.map(([o, y]) => P(s, o, y));
    for (let k = 1; k + 1 < vs.length; k++) quad(mb, [vs[0], vs[k], vs[k + 1], vs[k + 1]], [d[0] * s, 0, d[1] * s], rgb);
  }
}

/** 弧形屋簷(CJ930 標的站):沿長邊分段,中段拱起、兩端往下包;每段一塊板 */
function addArchRoof(mb: MeshBuilder, c: Pt, d: Pt, hl: number, hw: number, y0: number, th: number, cfg: typeof VIADUCT, rgb: Rgb) {
  const n: Pt = [-d[1], d[0]];
  const N = cfg.archSegments;
  const h = (t: number) => y0 + cfg.archRise * Math.cos((t * Math.PI) / 2) - cfg.archDrop * t ** 6;
  const P = (t: number, o: number, y: number): [number, number, number] => [c[0] + d[0] * hl * t + n[0] * o, y, c[1] + d[1] * hl * t + n[1] * o];
  for (let k = 0; k < N; k++) {
    const t0 = -1 + (2 * k) / N, t1 = -1 + (2 * (k + 1)) / N;
    const a = h(t0), b = h(t1);
    const slope = (b - a) / ((t1 - t0) * hl);
    const nl = Math.hypot(slope, 1);
    quad(mb, [P(t0, -hw, a + th), P(t1, -hw, b + th), P(t1, hw, b + th), P(t0, hw, a + th)], [(-d[0] * slope) / nl, 1 / nl, (-d[1] * slope) / nl], rgb);
    quad(mb, [P(t0, -hw, a), P(t0, hw, a), P(t1, hw, b), P(t1, -hw, b)], [(d[0] * slope) / nl, -1 / nl, (d[1] * slope) / nl], rgb);
    for (const s of [-1, 1]) quad(mb, [P(t0, hw * s, a), P(t1, hw * s, b), P(t1, hw * s, b + th), P(t0, hw * s, a + th)], [n[0] * s, 0, n[1] * s], rgb);
  }
  for (const [t, s] of [[-1, -1], [1, 1]] as const) quad(mb, [P(t, -hw, h(t)), P(t, hw, h(t)), P(t, hw, h(t) + th), P(t, -hw, h(t) + th)], [d[0] * s, 0, d[1] * s], rgb);
}

/**
 * 車站(decisions/0033):船底形裙板 → 白色百葉帶 → 玻璃帶(白色直框)→ 屋頂(平薄或弧形);兩端也是玻璃帶;
 * 空橋:下半實牆、上半一圈帶狀窗。
 */
export function addStation(mb: MeshBuilder, s: ViaductSrc['stations'][number], cfg = VIADUCT) {
  const c = cfg.colors;
  const rgb = (k: keyof typeof c) => hexToRgb(c[k]);
  const d: Pt = [Math.cos(s.a), Math.sin(s.a)];
  const [hl, hw] = cfg.stationHalf;
  const [hy0, hy1, hb] = cfg.hull;
  // 裙板:倒梯形斷面(底窄頂寬)
  addSection(mb, s.p, d, hl - 2, [[-hb, hy0], [hb, hy0], [hw, hy1], [-hw, hy1]], rgb('hull'));
  addBox(mb, s.p, d, hl, hw, cfg.louver[0], cfg.louver[1], rgb('louver'), false);
  // 百葉的水平細線(每 0.85 m 一條,凸出一點)
  for (let y = cfg.louver[0] + 0.85; y < cfg.louver[1] - 0.3; y += 0.85) addBox(mb, s.p, d, hl + 0.12, hw + 0.12, y - 0.12, y, rgb('mullion'), false);
  addBox(mb, s.p, d, hl - 0.2, hw - 0.2, cfg.glass[0], cfg.glass[1], rgb('glass'), false);
  // 玻璃帶的白色直框:長邊每 6 m、兩端每 7 m
  const n: Pt = [-d[1], d[0]];
  for (let u = -hl + 3; u <= hl - 3; u += 6)
    for (const side of [-1, 1]) addBox(mb, [s.p[0] + d[0] * u + n[0] * hw * side, s.p[1] + d[1] * u + n[1] * hw * side], d, 0.2, 0.25, cfg.glass[0], cfg.glass[1], rgb('mullion'), false);
  for (let o = -hw + 3.5; o <= hw - 3.5; o += 7)
    for (const end of [-1, 1]) addBox(mb, [s.p[0] + d[0] * hl * end + n[0] * o, s.p[1] + d[1] * hl * end + n[1] * o], d, 0.25, 0.2, cfg.glass[0], cfg.glass[1], rgb('mullion'), false);
  const [ry0, ry1, over] = cfg.roof;
  if (cfg.archStations.includes(s.name)) addArchRoof(mb, s.p, d, hl + over, hw + over, ry0, ry1 - ry0, cfg, rgb('roof'));
  else addBox(mb, s.p, d, hl + over, hw + over, ry0, ry1, rgb('roof'));
  // 空橋
  const [by0, by1, bw] = cfg.bridge, [wy0, wy1] = cfg.bridgeWindow;
  for (const [a, b] of s.bridges ?? []) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const bd: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    addBox(mb, m, bd, len / 2 + 0.5, bw, by0, by1, rgb('bridgeWall'));
    addBox(mb, m, bd, len / 2 + 0.3, bw + 0.08, wy0, wy1, rgb('bridgeGlass'), false);
  }
}

export function addViaduct(mb: MeshBuilder, v: ViaductSrc, cfg = VIADUCT) {
  const c = cfg.colors;
  const deck = hexToRgb(c.deck), parapet = hexToRgb(c.parapet), rail = hexToRgb(c.rail), pier = hexToRgb(c.pier);
  const top = cfg.deckY + cfg.deckDepth;
  for (const [a, b] of v.spans) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n: Pt = [-d[1], d[0]];
    // 每段兩端多伸 0.15 m,彎道處不會露縫
    const hl = len / 2 + 0.15;
    addBox(mb, m, d, hl, cfg.deckWidth / 2, cfg.deckY, top, deck);
    // 護欄 = 綠線的防護牆:淡黃綠板 + 頂上綠框(照片目視,decisions/0033)
    const off = cfg.deckWidth / 2 - cfg.parapetW / 2;
    for (const s of [1, -1]) {
      const pc: Pt = [m[0] + n[0] * off * s, m[1] + n[1] * off * s];
      addBox(mb, pc, d, hl, cfg.parapetW / 2, top, top + cfg.parapetH, parapet, false);
      addBox(mb, pc, d, hl, cfg.parapetW / 2 + 0.06, top + cfg.parapetH, top + cfg.parapetH + 0.18, rail, false);
    }
  }
  for (const p of v.piers) {
    const d: Pt = [Math.cos(p.a), Math.sin(p.a)];
    addBox(mb, p.p, d, cfg.pierHalf[0], cfg.pierHalf[1], 0, cfg.deckY - cfg.capH, pier, false);
    // 帽梁橫跨橋面:長邊垂直於橋
    addBox(mb, p.p, [-d[1], d[0]], cfg.capHalf[0], cfg.capHalf[1], cfg.deckY - cfg.capH, cfg.deckY, pier);
  }
  for (const s of v.stations) addStation(mb, s, cfg);
}

/** 墩柱的碰撞:每根一個長方體(橋面、車站在車子上方,不做碰撞) */
export function viaductCollision(v: ViaductSrc, cfg = VIADUCT): FurnitureCollision['boxes'] {
  return v.piers.map((p) => ({ x: p.p[0], z: p.p[1], a: p.a, hx: cfg.pierHalf[0], hz: cfg.pierHalf[1], h: cfg.pierHitH }));
}
