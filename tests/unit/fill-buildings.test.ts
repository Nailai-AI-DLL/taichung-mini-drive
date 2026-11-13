// 補虛構建築(decisions/0027,Cooper 2026-11-13:大路跟巷弄都補起來)
import { describe, expect, it } from 'vitest';
import { FILL_TIERS, fillBuildings, type FillRoad } from '../../tools/map-build/lib/fill-buildings';
import { FLOOR_HEIGHT } from '../../src/config/buildings';
import { pointInPolygon, type Pt } from '../../src/world/gen/geom';

const B: [number, number, number, number] = [-500, -500, 500, 500];
const road = (id: number, pts: Pt[], width: number, highway = 'residential'): FillRoad => ({ id, pts, width, sidewalk: 2, highway });
const none = { solid: [], keepOut: [] };
const dist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};

describe('補虛構建築', () => {
  it('空的路兩側都排滿;每棟都在人行道外、不壓到路', () => {
    const r = road(1, [[-200, 0], [200, 0]], 12);
    const f = fillBuildings([r], none, B);
    expect(f.length).toBeGreaterThan(20);
    expect(f.some((b) => b.ring[0][1] > 0)).toBe(true);
    expect(f.some((b) => b.ring[0][1] < 0)).toBe(true);
    for (const b of f) for (const p of b.ring) expect(Math.abs(p[1])).toBeGreaterThanOrEqual(12 / 2 + 2);
  });

  it('樓層依地段:巷弄 3–5 層、大路 5–14 層、很寬的路 15–35 層', () => {
    const floors = (w: number) => fillBuildings([road(1, [[-300, 0], [300, 0]], w)], none, B).map((b) => Math.round(b.h / FLOOR_HEIGHT));
    for (const [w, tier] of [[6, 'alley'], [14, 'main'], [30, 'tower']] as const) {
      const fl = floors(w);
      expect(fl.length).toBeGreaterThan(5);
      expect(Math.min(...fl)).toBeGreaterThanOrEqual(FILL_TIERS[tier].floors[0]);
      expect(Math.max(...fl)).toBeLessThanOrEqual(FILL_TIERS[tier].floors[1]);
    }
  });

  it('附近既有高樓多(例:七期)→ 大路排高樓、巷弄也不排透天', () => {
    const tall: Pt[][] = [0, 1, 2].map((i) => [[i * 30, 100], [i * 30 + 10, 100], [i * 30 + 10, 110], [i * 30, 110]]);
    const obstacles = { solid: tall, keepOut: [], heights: [60, 60, 60] };
    const main = fillBuildings([road(1, [[-150, 0], [150, 0]], 12)], obstacles, B);
    expect(main.every((b) => b.tier === 'tower')).toBe(true);
    const alley = fillBuildings([road(1, [[-150, 0], [150, 0]], 6)], obstacles, B);
    expect(Math.min(...alley.map((b) => b.h / FLOOR_HEIGHT))).toBeGreaterThanOrEqual(8);
  });

  it('避開既有建築、綠地 / 水面、其他道路(含高架)與河道;補的建築彼此不重疊', () => {
    const existing: Pt[] = [[-40, 10], [0, 10], [0, 40], [-40, 40]];
    const park: Pt[] = [[20, 8], [120, 8], [120, 80], [20, 80]];
    const cross = { ...road(2, [[150, -200], [150, 200]], 10, 'primary'), bridge: true };
    const roads = [road(1, [[-200, 0], [200, 0]], 12), cross];
    const f = fillBuildings(roads, { solid: [existing], keepOut: [park], waterways: [{ pts: [[-150, -200], [-150, 200]], w: 6 }] }, B);
    for (const b of f) {
      const c: Pt = [(b.ring[0][0] + b.ring[2][0]) / 2, (b.ring[0][1] + b.ring[2][1]) / 2];
      for (const p of [...b.ring, c]) {
        expect(pointInPolygon(p, existing)).toBe(false);
        expect(pointInPolygon(p, park)).toBe(false);
        expect(dist(p, [150, -200], [150, 200])).toBeGreaterThanOrEqual(10 / 2 + 2);
        expect(dist(p, [-150, -200], [-150, 200])).toBeGreaterThanOrEqual(3);
      }
    }
    for (let i = 0; i < f.length; i++)
      for (let j = i + 1; j < f.length; j++) {
        const c: Pt = [(f[j].ring[0][0] + f[j].ring[2][0]) / 2, (f[j].ring[0][1] + f[j].ring[2][1]) / 2];
        expect(pointInPolygon(c, f[i].ring)).toBe(false);
      }
  });

  it('不沿服務道路排,也不蓋到服務道路的路面;同樣輸入結果一樣', () => {
    const svc = road(1, [[-100, 0], [100, 0]], 5, 'service');
    expect(fillBuildings([svc], none, B).length).toBe(0);
    const roads = [road(2, [[-200, 30], [200, 30]], 10), svc];
    const f = fillBuildings(roads, none, B);
    for (const b of f) for (const p of b.ring) expect(dist(p, [-100, 0], [100, 0])).toBeGreaterThanOrEqual(2.5);
    expect(JSON.stringify(fillBuildings(roads, none, B))).toBe(JSON.stringify(f));
  });
});
