// 高架捷運的幾何(decisions/0030):橋面 + 兩側護欄、墩柱 + 帽梁、跨在路上的車站。全部是方塊,畫進街道傢俱的網格。
import { VIADUCT } from '../../config/viaduct';
import { hexToRgb } from '../../config/palette';
import type { FurnitureCollision } from '../../physics/world';
import { addBox } from './furniture';
import type { Pt } from './geom';
import type { MeshBuilder } from './mesh';

export interface ViaductSrc {
  /** 橋面的一小段(兩端點) */
  spans: [Pt, Pt][];
  /** 墩柱:位置、橋的方向(弧度) */
  piers: { p: Pt; a: number }[];
  stations: { name: string; p: Pt; a: number }[];
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

export function addViaduct(mb: MeshBuilder, v: ViaductSrc, cfg = VIADUCT) {
  const c = cfg.colors;
  const deck = hexToRgb(c.deck), parapet = hexToRgb(c.parapet), pier = hexToRgb(c.pier), station = hexToRgb(c.station), roof = hexToRgb(c.roof), band = hexToRgb(c.band);
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
    const off = cfg.deckWidth / 2 - cfg.parapetW / 2;
    for (const s of [1, -1]) addBox(mb, [m[0] + n[0] * off * s, m[1] + n[1] * off * s], d, hl, cfg.parapetW / 2, top, top + cfg.parapetH, parapet, false);
  }
  for (const p of v.piers) {
    const d: Pt = [Math.cos(p.a), Math.sin(p.a)];
    addBox(mb, p.p, d, cfg.pierHalf[0], cfg.pierHalf[1], 0, cfg.deckY - cfg.capH, pier, false);
    // 帽梁橫跨橋面:長邊垂直於橋
    addBox(mb, p.p, [-d[1], d[0]], cfg.capHalf[0], cfg.capHalf[1], cfg.deckY - cfg.capH, cfg.deckY, pier);
  }
  for (const s of v.stations) {
    const d: Pt = [Math.cos(s.a), Math.sin(s.a)];
    const [hl, hw] = cfg.stationHalf, [y0, y1] = cfg.stationY;
    addBox(mb, s.p, d, hl, hw, y0, y1, station);
    // 腰帶(綠線的綠)與屋頂
    addBox(mb, s.p, d, hl + 0.1, hw + 0.1, y0 + 2.2, y0 + 3.4, band, false);
    addBox(mb, s.p, d, hl + cfg.roofOver, hw + cfg.roofOver, y1, y1 + cfg.roofH, roof);
  }
}

/** 墩柱的碰撞:每根一個長方體(橋面、車站在車子上方,不做碰撞) */
export function viaductCollision(v: ViaductSrc, cfg = VIADUCT): FurnitureCollision['boxes'] {
  return v.piers.map((p) => ({ x: p.p[0], z: p.p[1], a: p.a, hx: cfg.pierHalf[0], hz: cfg.pierHalf[1], h: cfg.pierHitH }));
}
