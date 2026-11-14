// 知名地點(decisions/0031,Cooper 2026-11-14:17 個全做 + 蔦屋書店;接送點混合)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { placePickup, PLACE_CURB } from '../../tools/map-build/lib/places';
import { fillBuildings } from '../../tools/map-build/lib/fill-buildings';
import { pickPlace } from '../../src/game/pickup';
import { placeWallRgb } from '../../src/world/chunks';
import { signWidth } from '../../src/render/place-signs';
import { PICKUP } from '../../src/config/pickup';
import { mulberry32 } from '../../src/traffic/traffic';
import { pointInPolygon, type Pt } from '../../src/world/gen/geom';
import type { WorldJson } from '../../src/map/types';

const road = (name: string, pts: Pt[], width = 12, highway = 'residential') => ({ name, highway, width, pts });

describe('接送點(建置)', () => {
  const main = road('大路', [[-200, 0], [200, 0]]);
  it('地點在路旁:接送點在地點那一側的車道邊緣外', () => {
    const r = placePickup([20, 50], [main], [])!;
    expect(r.road).toBe('大路');
    expect(r.p[0]).toBeCloseTo(20);
    expect(r.p[1]).toBeCloseTo(6 + PLACE_CURB);
  });

  it('那一側被建築佔住就換對面;服務道路、窄巷、沒名字的路不選', () => {
    const blocked: Pt[] = [[0, 5], [40, 5], [40, 30], [0, 30]];
    const r = placePickup([20, 50], [main, road('停車場', [[0, 40], [40, 40]], 5, 'service'), road('', [[0, 45], [40, 45]])], [blocked])!;
    expect(r.p[1]).toBeCloseTo(-(6 + PLACE_CURB));
    expect(placePickup([20, 50], [road('停車場', [[0, 40], [40, 40]], 5, 'service')], [])).toBeNull();
  });

  it('捷運站(在分隔島上):接送點取馬路對面的外側路邊,不落在分隔島', () => {
    // 兩條單向車道中心線 z = ±12、各寬 16;站在 z = 0;分隔島 z ∈ (−4, 4)
    const lanes = [road('文心路', [[-200, -12], [200, -12]], 16), road('文心路', [[200, 12], [-200, 12]], 16)];
    const r = placePickup([0, 0], lanes, [], true)!;
    expect(Math.abs(r.p[1])).toBeCloseTo(12 + 8 + PLACE_CURB);
  });

  it('接送點不會落在別條路的路面上', () => {
    const cross = road('橫路', [[20, -200], [20, 200]], 20);
    const r = placePickup([20, 50], [main, cross], [])!;
    expect(Math.abs(r.p[0] - 20)).toBeGreaterThan(10);
  });
});

describe('知名地點周圍不補虛構建築', () => {
  it('淨空圓內沒有補的建築', () => {
    const r = { id: 1, pts: [[-200, 0], [200, 0]] as Pt[], width: 12, sidewalk: 2, highway: 'residential' };
    const f = fillBuildings([r], { solid: [], keepOut: [], clear: [{ p: [0, 30], r: 60 }] }, [-500, -500, 500, 500]);
    expect(f.length).toBeGreaterThan(5);
    for (const b of f) for (const p of b.ring) expect(Math.hypot(p[0], p[1] - 30)).toBeGreaterThanOrEqual(60);
  });
});

describe('遊戲端', () => {
  const places = [{ name: '近', px: 100, pz: 0 }, { name: '中', px: 400, pz: 0 }, { name: '遠', px: 2000, pz: 0 }];
  it('只挑距離範圍內的知名地點;沒有就回傳 null', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 20; i++) expect(pickPlace(places, { x: 0, z: 0 }, rand)).toEqual({ x: 400, z: 0, label: '中' });
    expect(pickPlace(places, { x: 5000, z: 0 }, rand)).toBeNull();
    expect(PICKUP.placeShare).toBeGreaterThan(0.5);
    expect(PICKUP.placeShare).toBeLessThan(1);
  });

  it('外牆色是代表色往白色調淡;招牌寬度隨字數,半形字較窄', () => {
    const c = placeWallRgb('#C8102E');
    expect(c[0]).toBeGreaterThan(0xc8);
    expect(c[1]).toBeGreaterThan(0x10);
    expect(c[0]).toBeGreaterThan(c[1]);
    expect(signWidth('新光三越', 3)).toBeCloseTo(15);
    expect(signWidth('IKEA', 3)).toBeLessThan(signWidth('新光三越', 3));
  });
});

describe('實際地圖', () => {
  const w = JSON.parse(readFileSync(new URL('../../public/map/range-a/world.json', import.meta.url), 'utf8')) as WorldJson;
  const deq = (v: number[]) => v.reduce<Pt[]>((o, _, i) => (i % 2 ? o : [...o, [v[i] / 10, v[i + 1] / 10]]), []);

  it('18 個知名地點都在;Cooper 點名的 7 類都有', () => {
    const names = w.places!.map((p) => p.name);
    expect(names.length).toBe(18);
    for (const n of ['大遠百', '新光三越', '老虎城', '麥當勞', '蔦屋書店', '金錢豹', '捷運市政府站']) expect(names).toContain(n);
  });

  it('每個接送點都站得了人:在地圖內、不在任何路面上、不在建築裡,離地點不超過 150 m', () => {
    const [x0, z0, x1, z1] = w.meta.bounds;
    const rings = w.buildings.map((b) => deq(b.rings[0]));
    for (const p of w.places!) {
      expect(p.px > x0 + 20 && p.px < x1 - 20 && p.pz > z0 + 20 && p.pz < z1 - 20, p.name).toBe(true);
      expect(Math.hypot(p.x - p.px, p.z - p.pz), p.name).toBeLessThan(150);
      for (const r of w.roads) {
        const pts = deq(r.pts);
        for (let i = 0; i + 1 < pts.length; i++) {
          const [a, b] = [pts[i], pts[i + 1]];
          if (Math.abs(a[0] - p.px) > 300 || Math.abs(a[1] - p.pz) > 300) continue;
          const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((p.px - a[0]) * dx + (p.pz - a[1]) * dz) / l2));
          expect(Math.hypot(p.px - a[0] - t * dx, p.pz - a[1] - t * dz), `${p.name} 在 ${r.name} 路面上`).toBeGreaterThanOrEqual(r.width / 2 + 0.3);
        }
      }
      expect(rings.some((r) => Math.abs(r[0][0] - p.px) < 300 && Math.abs(r[0][1] - p.pz) < 300 && pointInPolygon([p.px, p.pz], r)), `${p.name} 在建築裡`).toBe(false);
    }
  }, 60000);

  it('有建築的地點:那棟建築帶外牆色,周圍 30 m 內沒有補的建築', () => {
    const fills = w.buildings.filter((b) => b.f).map((b) => deq(b.rings[0]));
    for (const p of w.places!.filter((x) => x.b !== undefined)) {
      const b = w.buildings.find((x) => x.id === p.b)!;
      expect(b.k, p.name).toBe(p.color);
      const ring = deq(b.rings[0]);
      for (const f of fills) {
        if (Math.abs(f[0][0] - p.x) > 400 || Math.abs(f[0][1] - p.z) > 400) continue;
        for (const q of f) for (const v of ring) expect(Math.hypot(q[0] - v[0], q[1] - v[1]), `${p.name} 旁邊有補的建築`).toBeGreaterThan(8);
      }
    }
  }, 60000);
});
