// 下沉地標(秋紅谷,decisions/0035):外框避開道路、地面挖洞。
// 驗收抓到:停車場車道沿著外框內側走 130 m、臺灣大道人行道被外框蓋進 3.7 m,挖洞後路面懸空、擋牆截斷道路。
import { describe, expect, it } from 'vitest';
import { clearSinkOffRoads } from '../../tools/map-build/lib/sink';
import { groundGeometry } from '../../src/render/scene';
import { loadWorld } from '../helpers/load-map';
import { QUANT } from '../../src/map/types';
import { pointInPolygon, signedArea, type Pt } from '../../src/world/gen/geom';

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** 道路中心線每 1 m 取樣:回傳「走廊外緣到外框」的最小距離(負 = 壓進外框;中心線在外框內也算負) */
function worstClearance(ring: Pt[], roads: { pts: Pt[]; width: number; sidewalk: number }[]) {
  let worst = Infinity;
  for (const r of roads)
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [a, b] = [r.pts[i], r.pts[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let k = 0; k <= n; k++) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        let d = Infinity;
        for (let j = 0; j < ring.length; j++) d = Math.min(d, segDist(p, ring[j], ring[(j + 1) % ring.length]));
        worst = Math.min(worst, pointInPolygon(p, ring) ? -d : d - (r.width / 2 + r.sidewalk));
      }
    }
  return worst;
}

describe('clearSinkOffRoads', () => {
  const square: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  it('外框內側沿邊走的車道:整條路被排到外框外', () => {
    const road = { pts: [[-10, 5], [110, 5]] as Pt[], width: 4, sidewalk: 0 };
    const { ring } = clearSinkOffRoads(square, [road]);
    expect(worstClearance(ring, [road])).toBeGreaterThanOrEqual(0);
    // 路的另一側(外框大部分)保留
    expect(Math.abs(signedArea(ring))).toBeGreaterThan(100 * 100 * 0.85);
  });
  it('外框外的路,人行道壓進外框:外框退開', () => {
    const road = { pts: [[-10, -3], [110, -3]] as Pt[], width: 6, sidewalk: 3 };
    const { ring } = clearSinkOffRoads(square, [road]);
    expect(worstClearance(ring, [road])).toBeGreaterThanOrEqual(0);
  });
  it('遠處的路:外框不變', () => {
    const road = { pts: [[-10, -40], [110, -40]] as Pt[], width: 6, sidewalk: 3 };
    const { ring, moved } = clearSinkOffRoads(square, [road]);
    expect(moved).toBe(0);
    expect(Math.abs(signedArea(ring))).toBeCloseTo(100 * 100, -2);
  });
});

describe('範圍 A 的下沉地標', () => {
  const world = loadWorld('range-a');
  const sinks = world.json.landmarks.filter((l) => l.sink);
  const ringsOf = (l: (typeof sinks)[number]) =>
    l.rings.map((r) => {
      const out: Pt[] = [];
      for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT + l.x, r[i + 1] / QUANT + l.z]);
      return out;
    });
  const roads = world.json.roads.map((r) => {
    const pts: Pt[] = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i] / QUANT, r.pts[i + 1] / QUANT]);
    return { pts, width: r.width, sidewalk: r.sidewalk };
  });

  it('有秋紅谷', () => expect(sinks.map((l) => l.id)).toContain('maple-garden'));

  it('外框不碰任何道路的路面 + 人行道', () => {
    for (const l of sinks) for (const ring of ringsOf(l)) expect(worstClearance(ring, roads), l.id).toBeGreaterThanOrEqual(0);
  });

  it('地面在外框挖洞:外框內側沒有地面、外側有', () => {
    const geo = groundGeometry(world.json.meta.bounds, sinks.flatMap(ringsOf));
    const pos = geo.attributes.position;
    const idx = geo.index!;
    const tris: Pt[][] = [];
    for (let i = 0; i < idx.count; i += 3) {
      const t = [0, 1, 2].map((k) => [pos.getX(idx.getX(i + k)), pos.getZ(idx.getX(i + k))] as Pt);
      tris.push(t);
      for (let k = 0; k < 3; k++) expect(pos.getY(idx.getX(i + k))).toBeCloseTo(0, 6);
    }
    const covered = (p: Pt) => tris.some((t) => pointInPolygon(p, t));
    for (const l of sinks)
      for (const ring of ringsOf(l)) {
        const cw = signedArea(ring) < 0;
        for (let i = 0; i < ring.length; i++) {
          const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
          const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          // 邊的法向量(兩側各取 1 m)
          const n: Pt = [(-(b[1] - a[1]) / len) * (cw ? -1 : 1), ((b[0] - a[0]) / len) * (cw ? -1 : 1)];
          const p1: Pt = [m[0] + n[0], m[1] + n[1]];
          const p2: Pt = [m[0] - n[0], m[1] - n[1]];
          const [inner, outer] = pointInPolygon(p1, ring) ? [p1, p2] : [p2, p1];
          expect(covered(inner), `${l.id} 第 ${i} 邊內側不該有地面`).toBe(false);
          expect(covered(outer), `${l.id} 第 ${i} 邊外側要有地面`).toBe(true);
        }
      }
  });
});
