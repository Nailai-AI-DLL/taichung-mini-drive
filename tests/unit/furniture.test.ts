// 街道傢俱(decisions/0015 第四批):擺放規則、幾何、範圍 A 實際資料
import { describe, expect, it } from 'vitest';
import { placeFurniture, treeKindOf, type FurnitureRoad } from '../../tools/map-build/lib/furniture';
import { BUS_SHELTER_D, BUS_SHELTER_L, CLEAR_CROSSWALK, SIGN_CHANCE, SIGN_COLORS, SIGN_SPACING, CLEAR_LIGHT, CLEAR_ROAD, LIGHT_ARM, LIGHT_H, PALM_MIN_WIDTH, SCOOTER_GROUP_MAX, SCOOTER_GROUP_MIN, SIGN_BOTTOM, SIGN_TOP_GAP, TREE_SPACING, TREE_SPECIES } from '../../src/config/furniture';
import { MeshBuilder } from '../../src/world/gen/mesh';
import { addBusStop, addSign, addSignal, addStreetLight, addTree, scooterPoses, scooterTemplate, type FurnitureColors } from '../../src/world/gen/furniture';
import { PLAIN_CODE } from '../../src/world/gen/extrude';
import { buildChunk, colliderMeshes, furnitureCollision, type ChunkSrc } from '../../src/world/chunks';
import R from '@dimforge/rapier3d-compat';
import { addStaticFurniture, createPhysicsWorld, FIXED_DT, removeBody } from '../../src/physics/world';
import { Vehicle } from '../../src/vehicle/vehicle';
import { LIGHT_HIT_R, SCOOTER_LEN, SCOOTER_SLOT, SIGNAL_HIT_R, TREE_HIT_R } from '../../src/config/furniture';
import { pointInPolygon, type Pt } from '../../src/world/gen/geom';
import { loadWorld } from '../helpers/load-map';
import { PALETTE } from '../../src/config/palette';

const road = (id: number, pts: Pt[], o: Partial<FurnitureRoad> = {}): FurnitureRoad => ({ id, highway: 'secondary', width: 12, sidewalk: 3, lit: false, bridge: false, pts, ...o });
const noObstacles = { rings: [], water: [] };

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const roadDist = (p: Pt, pts: Pt[]) => Math.min(...pts.slice(1).map((b, i) => segDist(p, pts[i], b)));

describe('擺放規則', () => {
  it('直路兩側種樹,樹距約 TREE_SPACING,都在人行道上(路緣外、人行道外緣內)', () => {
    const r = road(1, [[0, 0], [200, 0]]);
    const f = placeFurniture([r], noObstacles, []);
    const left = f.trees.filter((p) => p[1] < 0).sort((a, b) => a[0] - b[0]);
    const right = f.trees.filter((p) => p[1] > 0);
    expect(left.length).toBeGreaterThan(18);
    expect(right.length).toBeGreaterThan(18);
    for (const p of f.trees) {
      const d = Math.abs(p[1]);
      expect(d).toBeGreaterThan(r.width / 2);
      expect(d).toBeLessThan(r.width / 2 + r.sidewalk);
    }
    const gaps = left.slice(1).map((p, i) => p[0] - left[i][0]);
    expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeCloseTo(TREE_SPACING, 0);
  });

  it('巷弄、人行道太窄、橋上不種樹', () => {
    expect(placeFurniture([road(1, [[0, 0], [200, 0]], { highway: 'residential' })], noObstacles, []).trees).toHaveLength(0);
    expect(placeFurniture([road(1, [[0, 0], [200, 0]], { sidewalk: 1.5 })], noObstacles, []).trees).toHaveLength(0);
    const bridge = placeFurniture([road(1, [[0, 0], [200, 0]], { bridge: true })], noObstacles, []);
    expect(bridge.trees.length + bridge.lights.length).toBe(0);
  });

  it('十字路口:傢俱不在任何一條路的車道上,橫交道路另留 CLEAR_ROAD 淨空', () => {
    const a = road(1, [[-100, 0], [100, 0]]);
    // 橫交的是巷弄(本身不種樹、不立燈),所有傢俱都屬於 a
    const b = road(2, [[0, -100], [0, 100]], { highway: 'residential', width: 8 });
    const f = placeFurniture([a, b], noObstacles, []);
    const all: Pt[] = [...f.trees, ...f.lights.map((l) => l.p)];
    expect(all.length).toBeGreaterThan(20);
    for (const p of all) {
      expect(roadDist(p, a.pts)).toBeGreaterThanOrEqual(a.width / 2);
      expect(roadDist(p, b.pts)).toBeGreaterThanOrEqual(b.width / 2 + CLEAR_ROAD - 1e-6);
    }
    // 淨空邊緣附近確實有樹(不是整段路口都空掉)
    expect(f.trees.some((p) => Math.abs(p[0]) < b.width / 2 + CLEAR_ROAD + TREE_SPACING)).toBe(true);
  });

  it('水面、水道、路口鋪面上不放(驗收 2026-11-01 抓到的兩種)', () => {
    const r = road(1, [[0, 0], [200, 0]], { width: 20 });
    const pond: Pt[] = [[20, -20], [60, -20], [60, -8], [20, -8]];
    const stream = { pts: [[120, -30], [120, 30]] as Pt[], w: 8 };
    const junction: Pt[] = [[150, -15], [180, -15], [180, 15], [150, 15]];
    const f = placeFurniture([r], { rings: [], water: [pond], waterways: [stream], junctions: [junction] }, []);
    const all: Pt[] = [...f.trees, ...f.lights.map((l) => l.p)];
    expect(all.length).toBeGreaterThan(20);
    for (const p of all) {
      expect(pointInPolygon(p, pond)).toBe(false);
      expect(Math.abs(p[0] - 120)).toBeGreaterThan(4);
      expect(pointInPolygon(p, junction)).toBe(false);
    }
  });

  it('樹與路燈至少隔 CLEAR_LIGHT;窄路的路燈立在 leftNormal 的反側(行車方向右側)', () => {
    const f = placeFurniture([road(1, [[0, 0], [320, 0]], { width: 20 })], noObstacles, []);
    for (const t of f.trees) for (const l of f.lights) expect(Math.hypot(t[0] - l.p[0], t[1] - l.p[1])).toBeGreaterThanOrEqual(CLEAR_LIGHT - 1e-6);
    // 沿 +x 行駛:leftNormal = (0, -1),右側是 +z
    const narrow = placeFurniture([road(1, [[0, 0], [640, 0]], { width: 10 })], noObstacles, []);
    expect(narrow.lights.length).toBeGreaterThan(5);
    for (const l of narrow.lights) expect(l.p[1]).toBeGreaterThan(0);
  });

  it('機車排:只停在店面建築前、人行道靠建築側,每排 3–9 台,車頭朝建築;沒有店面就不停', () => {
    const r = road(1, [[0, 0], [200, 0]], { highway: 'residential', width: 10 });
    // 南側(+z)整排店面,外牆貼著人行道外緣(z = 8)
    const shop: Pt[] = [[0, 8.2], [200, 8.2], [200, 20], [0, 20]];
    const f = placeFurniture([r], { rings: [shop], water: [], shops: [shop] }, []);
    expect(f.scooters.length).toBeGreaterThan(5);
    for (const s of f.scooters) {
      expect(s.n).toBeGreaterThanOrEqual(SCOOTER_GROUP_MIN);
      expect(s.n).toBeLessThanOrEqual(SCOOTER_GROUP_MAX);
      expect(s.p[1]).toBeGreaterThan(r.width / 2 + SCOOTER_LEN / 2);
      expect(s.p[1]).toBeLessThan(r.width / 2 + r.sidewalk);
      expect(Math.sin(s.f)).toBeGreaterThan(0.99); // 朝 +z(建築)
      expect(Math.abs(Math.sin(s.a))).toBeLessThan(0.01); // 沿道路排
    }
    expect(placeFurniture([r], { rings: [shop], water: [] }, []).scooters).toHaveLength(0);
  });

  it('樹種:同路名同一種;椰子只在寬路;五種都抽得到', () => {
    expect(treeKindOf({ id: 1, name: '五權路', width: 12 })).toBe(treeKindOf({ id: 999, name: '五權路', width: 12 }));
    const kinds = new Set<number>();
    for (let i = 0; i < 400; i++) {
      kinds.add(treeKindOf({ id: i, width: 20 }));
      expect(treeKindOf({ id: i, width: PALM_MIN_WIDTH - 1 })).not.toBe(TREE_SPECIES.Palm);
    }
    expect(kinds.size).toBe(5);
    const f = placeFurniture([road(1, [[0, 0], [200, 0]], { name: '測試路' })], noObstacles, []);
    expect(new Set(f.treeKinds).size).toBe(1);
    // 抽到椰子的路名,寬段 + 窄段:整條路要同一種(看最窄的寬度,所以都不是椰子)
    let name = '';
    for (let i = 0; !name; i++) if (treeKindOf({ id: 0, name: `路${i}`, width: 20 }) === TREE_SPECIES.Palm) name = `路${i}`;
    const mixed = placeFurniture([road(1, [[0, 0], [200, 0]], { name, width: 20 }), road(2, [[0, 300], [200, 300]], { name, width: 10 })], noObstacles, []);
    expect(new Set(mixed.treeKinds).size).toBe(1);
    expect(mixed.treeKinds[0]).not.toBe(TREE_SPECIES.Palm);
    expect(f.treeKinds).toHaveLength(f.trees.length);
  });

  it('公車站:車道上的站點放到行車方向右側路緣;有候車亭且人行道夠寬做候車亭;同一站重複的只放一個;樹會讓開', () => {
    const r = road(1, [[0, 0], [200, 0]], { width: 12, sidewalk: 3 });
    const f = placeFurniture([r], noObstacles, [], [
      { p: [100, 0], shelter: false }, // 在中心線上 → 右側(+z)
      { p: [101, 2], shelter: false }, // 重複(6 m 內)
      { p: [50, -9], shelter: true }, // 路的左側(-z)人行道上
    ]);
    expect(f.busStops).toHaveLength(2);
    const pole = f.busStops.find((b) => !b.shelter)!;
    expect(pole.p[1]).toBeGreaterThan(r.width / 2);
    expect(pole.p[1]).toBeLessThan(r.width / 2 + 1.5);
    expect(Math.sin(pole.a)).toBeLessThan(-0.99); // 朝車道(-z)
    const sh = f.busStops.find((b) => b.shelter)!;
    expect(sh.p[1]).toBeLessThan(-r.width / 2);
    expect(Math.sin(sh.a)).toBeGreaterThan(0.99);
    for (const t of f.trees) for (const b of f.busStops) expect(Math.hypot(t[0] - b.p[0], t[1] - b.p[1])).toBeGreaterThanOrEqual(BUS_SHELTER_L / 2 + 1 - 1e-6);
    // 候車亭有一角壓到建築:只放站牌
    const wall: Pt[] = [[40, -7.9], [60, -7.9], [60, -20], [40, -20]];
    const blocked = placeFurniture([r], { rings: [wall], water: [] }, [], [{ p: [50, -9], shelter: true }]);
    expect(blocked.busStops).toHaveLength(1);
    expect(blocked.busStops[0].shelter).toBe(false);
    // 人行道太窄:只放站牌
    expect(placeFurniture([road(1, [[0, 0], [200, 0]], { sidewalk: 1.5 })], noObstacles, [], [{ p: [50, -7], shelter: true }]).busStops[0].shelter).toBe(false);
  });

  it('直式招牌:只掛在店面建築面向道路的外牆,伸出方向朝道路,高度在二樓以上、不超過屋頂', () => {
    const r = road(1, [[0, 0], [200, 0]], { highway: 'residential', width: 10, sidewalk: 3 });
    const shop: Pt[] = [[20, 8.5], [60, 8.5], [60, 25], [20, 25]];
    const f = placeFurniture([r], { rings: [shop], water: [], shopBuildings: [{ ring: shop, h: 12.8, id: 7 }] }, []);
    expect(f.signs.length).toBeGreaterThan(0);
    for (const s of f.signs) {
      expect(s.p[1]).toBeCloseTo(8.5, 5); // 只在臨路那面
      expect(Math.sin(s.a)).toBeLessThan(-0.99); // 朝 -z(道路)
      expect(s.y0).toBe(SIGN_BOTTOM);
      expect(s.y1).toBeLessThanOrEqual(12.8 - SIGN_TOP_GAP + 1e-9);
    }
    expect(placeFurniture([r], { rings: [shop], water: [], shopBuildings: [{ ring: shop, h: 4, id: 7 }] }, []).signs).toHaveLength(0);
    // 矮的店面(6 m):頂端被屋頂壓住
    const low = placeFurniture([r], { rings: [shop], water: [], shopBuildings: [{ ring: shop, h: 6, id: 7 }] }, []);
    expect(low.signs.length).toBeGreaterThan(0);
    for (const s of low.signs) expect(s.y1).toBeLessThanOrEqual(6 - SIGN_TOP_GAP + 1e-9);
    // 外牆前面有一棟小亭子:板身會插進去的位置不掛
    const kiosk: Pt[] = [[28, 7.2], [44, 7.2], [44, 8.0], [28, 8.0]];
    const k = placeFurniture([r], { rings: [shop, kiosk], water: [], shopBuildings: [{ ring: shop, h: 12.8, id: 7 }] }, []);
    expect(k.signs.length).toBeGreaterThan(0);
    for (const s of k.signs) expect(s.p[0] > 27.5 && s.p[0] < 44.5).toBe(false);
    // 同一棟重複描繪(兩個 id、同一個外框):同一位置只掛一面
    const dup = placeFurniture([r], { rings: [shop, shop], water: [], shopBuildings: [{ ring: shop, h: 12.8, id: 7 }, { ring: shop, h: 12.8, id: 7 }] }, []);
    for (let i = 0; i < dup.signs.length; i++)
      for (let j = i + 1; j < dup.signs.length; j++) expect(Math.hypot(dup.signs[i].p[0] - dup.signs[j].p[0], dup.signs[i].p[1] - dup.signs[j].p[1])).toBeGreaterThanOrEqual(0.5);
    // 外牆貼著車道的窄街(舊城區):招牌照樣掛,可以伸到車道上方(0015 §11.10)
    const tight = road(1, [[0, 0], [200, 0]], { highway: 'residential', width: 10, sidewalk: 0.5 });
    const near: Pt[] = [[20, 5.8], [60, 5.8], [60, 25], [20, 25]];
    expect(placeFurniture([tight], { rings: [near], water: [], shopBuildings: [{ ring: near, h: 12.8, id: 7 }] }, []).signs.length).toBeGreaterThan(0);
    expect(placeFurniture([r], { rings: [shop], water: [] }, []).signs).toHaveLength(0);
  });

  it('招牌密度:每 SIGN_SPACING 一個位置,掛的比例約 SIGN_CHANCE(Cooper 2026-11-01:少一點)', () => {
    const r = road(1, [[0, 0], [2000, 0]], { highway: 'residential', width: 10, sidewalk: 3 });
    const shop: Pt[] = [[0, 8.5], [2000, 8.5], [2000, 25], [0, 25]];
    const f = placeFurniture([r], { rings: [shop], water: [], shopBuildings: [{ ring: shop, h: 12.8, id: 7 }] }, []);
    const slots = Math.floor((2000 - 2) / SIGN_SPACING) + 1;
    const ratio = f.signs.filter((x) => Math.abs(x.p[1] - 8.5) < 0.01).length / slots;
    expect(ratio).toBeGreaterThan(SIGN_CHANCE - 0.1);
    expect(ratio).toBeLessThan(SIGN_CHANCE + 0.1);
  });

  it('建築裡、建築外牆旁不放', () => {
    const r = road(1, [[0, 0], [200, 0]]);
    const house: Pt[] = [[50, -7], [90, -7], [90, -30], [50, -30]];
    const f = placeFurniture([r], { rings: [house], water: [] }, []);
    for (const p of f.trees) expect(p[0] > 49 && p[0] < 91 && p[1] < 0).toBe(false);
  });

  it('號誌桿:有號誌的穿越道兩端各一支,懸臂朝向車道;沒號誌的不放,且樹會避開穿越道', () => {
    const r = road(1, [[0, 0], [200, 0]]);
    const cross = { p: [100, 0] as Pt, v: [0, 1] as Pt, reach: 6, sig: true };
    const f = placeFurniture([r], noObstacles, [cross]);
    expect(f.signals).toHaveLength(2);
    for (const s of f.signals) {
      expect(Math.abs(s.p[0] - 100)).toBeLessThan(1e-6);
      // 懸臂方向 · (中心 - 桿子) > 0
      expect(Math.cos(s.a) * (100 - s.p[0]) + Math.sin(s.a) * (0 - s.p[1])).toBeGreaterThan(0);
    }
    const plain = placeFurniture([r], noObstacles, [{ ...cross, sig: false }]);
    expect(plain.signals).toHaveLength(0);
    // 沒號誌的穿越道:樹、路燈也要讓開(CLEAR_CROSSWALK)
    for (const p of [...plain.trees, ...plain.lights.map((l) => l.p)]) expect(Math.abs(p[0] - 100)).toBeGreaterThanOrEqual(CLEAR_CROSSWALK - 1e-6);
  });

  it('路燈:寬路兩側、窄路一側,懸臂朝向車道;結果固定(同輸入同輸出)', () => {
    const wide = placeFurniture([road(1, [[0, 0], [320, 0]], { width: 20 })], noObstacles, []);
    expect(wide.lights.some((l) => l.p[1] > 0) && wide.lights.some((l) => l.p[1] < 0)).toBe(true);
    const narrow = placeFurniture([road(1, [[0, 0], [320, 0]], { width: 10 })], noObstacles, []);
    expect(new Set(narrow.lights.map((l) => Math.sign(l.p[1]))).size).toBe(1);
    for (const l of [...wide.lights, ...narrow.lights]) expect(Math.sin(l.a) * -l.p[1]).toBeGreaterThan(0);
    expect(placeFurniture([road(1, [[0, 0], [320, 0]], { width: 20 })], noObstacles, [])).toEqual(wide);
  });
});

describe('幾何', () => {
  const c: FurnitureColors = { crown: [[150, 170, 140]], trunk: [100, 80, 60], pole: [180, 180, 180], lampHead: [230, 230, 220], signalBox: [100, 100, 100], lamps: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    speciesCrown: [[150, 170, 140], [160, 180, 140], [130, 160, 130], [150, 175, 120], [120, 150, 130]], palmTrunk: [190, 180, 160],
    signBoards: [[200, 120, 100], [210, 180, 90], [110, 140, 170], [238, 234, 224], [130, 160, 125], [200, 140, 90]], signText: [247, 244, 236], signTextOnWhite: [166, 90, 79],
    busBlue: [94, 134, 174], busRoof: [110, 142, 173], busGlass: [195, 211, 218] };

  it('樹冠、號誌燈箱每個三角形的法向量都朝外(背面剔除時不會破洞)', () => {
    const mb = new MeshBuilder();
    addTree(mb, [10, 20], c);
    addStreetLight(mb, [0, 0], 0.3, c);
    addSignal(mb, [30, 0], 1.2, 4, c);
    for (let k = 0; k < 5; k++) addTree(mb, [50 + k * 10, 0], c, k);
    addSign(mb, [0, 30], 0.4, 3.4, 7.5, 2, c);
    addBusStop(mb, [10, 30], 1.1, false, c);
    addBusStop(mb, [20, 30], -0.6, true, c);
    const p = mb.pos, n = mb.nor;
    for (let i = 0; i < mb.idx.length; i += 3) {
      const [a, b, d] = [mb.idx[i], mb.idx[i + 1], mb.idx[i + 2]];
      const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
      const vx = p[d * 3] - p[a * 3], vy = p[d * 3 + 1] - p[a * 3 + 1], vz = p[d * 3 + 2] - p[a * 3 + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const nx = n[a * 3] + n[b * 3] + n[d * 3], ny = n[a * 3 + 1] + n[b * 3 + 1] + n[d * 3 + 1], nz = n[a * 3 + 2] + n[b * 3 + 2] + n[d * 3 + 2];
      expect(cx * nx + cy * ny + cz * nz).toBeGreaterThan(0);
    }
  });

  it('機車樣板:法向量朝外、代碼 PLAIN_CODE、車頭朝 +x(把手在 +x 側)', () => {
    const t = scooterTemplate([70, 70, 70], [200, 100, 90]);
    for (let i = 0; i < t.index.length; i += 3) {
      const [a, b, d] = [t.index[i], t.index[i + 1], t.index[i + 2]];
      const P = (k: number) => [t.position[k * 3], t.position[k * 3 + 1], t.position[k * 3 + 2]];
      const [pa, pb, pd] = [P(a), P(b), P(d)];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const n = [0, 1, 2].map((j) => t.normal[a * 3 + j] + t.normal[b * 3 + j] + t.normal[d * 3 + j]);
      expect(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2]).toBeGreaterThan(0);
    }
    for (let i = 1; i < t.wall!.length; i += 2) expect(t.wall![i]).toBe(PLAIN_CODE);
    const top: number[] = [];
    for (let i = 0; i < t.position.length; i += 3) if (t.position[i + 1] > 1.0) top.push(t.position[i]);
    expect(Math.min(...top)).toBeGreaterThan(0.3);
  });

  it('機車擺放:每排展開成 n 台,沿排列方向每台 SCOOTER_SLOT,車頭大致朝 f;同輸入同輸出', () => {
    const rows = [{ p: [10, 20] as Pt, a: 0, n: 4, f: Math.PI / 2 }, { p: [50, 0] as Pt, a: Math.PI / 2, n: 3, f: 0 }];
    const out = scooterPoses(rows, 6);
    expect(out.length).toBe(7 * 4);
    for (let i = 0; i < 4; i++) {
      expect(out[i * 4]).toBeCloseTo(10 + i * SCOOTER_SLOT, 0);
      expect(Math.abs(out[i * 4 + 1] - 20)).toBeLessThan(0.15);
      expect(Math.abs(out[i * 4 + 2] - Math.PI / 2)).toBeLessThan(0.13);
      expect(out[i * 4 + 3]).toBeGreaterThanOrEqual(0);
      expect(out[i * 4 + 3]).toBeLessThan(6);
    }
    expect(out[4 * 4 + 1]).toBeCloseTo(0, 0);
    expect(scooterPoses(rows, 6)).toEqual(out);
  });

  it('五種樹形的幾何都不一樣(頂點數不同)', () => {
    const counts = [0, 1, 2, 3, 4].map((k) => {
      const mb = new MeshBuilder();
      addTree(mb, [3, 3], c, k);
      return mb.vertexCount;
    });
    expect(new Set(counts).size).toBe(5);
  });

  it('招牌底色數 = SIGN_COLORS', () => {
    expect(PALETTE.signBoards.length).toBe(SIGN_COLORS);
  });

  it('路燈燈頭在懸臂朝向那一側', () => {
    const mb = new MeshBuilder();
    const a = 0.7;
    addStreetLight(mb, [5, 5], a, c);
    let far = 0;
    for (let i = 0; i < mb.pos.length; i += 3) {
      const dx = mb.pos[i] - 5, dz = mb.pos[i + 2] - 5;
      if (mb.pos[i + 1] > LIGHT_H - 0.5 && Math.hypot(dx, dz) > 0.5) {
        far++;
        expect(dx * Math.cos(a) + dz * Math.sin(a)).toBeGreaterThan(0.4);
      }
    }
    expect(far).toBeGreaterThan(4);
    expect(Math.max(...mb.pos.filter((_, i) => i % 3 === 0)) - 5).toBeGreaterThan(LIGHT_ARM * Math.cos(a) * 0.9);
  });

  it('樹:大小與色調由位置決定(同位置一樣、不同位置會變)', () => {
    const a = new MeshBuilder(), b = new MeshBuilder(), d = new MeshBuilder();
    addTree(a, [5, 5], c);
    addTree(b, [5, 5], c);
    addTree(d, [50, 5], c);
    expect(a.pos).toEqual(b.pos);
    const top = (m: MeshBuilder) => Math.max(...m.pos.filter((_, i) => i % 3 === 1));
    expect(top(a)).not.toBeCloseTo(top(d), 3);
  });
});

describe('碰撞(Cooper 2026-11-01:要碰撞)', () => {
  const src = (trees: Pt[], lights: Pt[] = [], signals: Pt[] = [], scooters: ChunkSrc['furniture']['scooters'] = [], busStops: ChunkSrc['furniture']['busStops'] = []) =>
    ({ furniture: { trees, treeKinds: trees.map(() => 0), lights: lights.map((p) => ({ p, a: 0 })), signals: signals.map((p) => ({ p, a: 0, arm: 3 })), scooters, signs: [], busStops } }) as unknown as ChunkSrc;

  it('每棵樹、每支路燈和號誌桿各一個圓柱,半徑依種類;一排機車一個長方體,蓋住整排', () => {
    const fc = furnitureCollision(src([[1, 2]], [[3, 4]], [[5, 6]], [{ p: [10, 0], a: Math.PI / 2, n: 5, f: 0 }]));
    expect(fc.posts).toEqual([{ x: 1, z: 2, r: TREE_HIT_R }, { x: 3, z: 4, r: LIGHT_HIT_R }, { x: 5, z: 6, r: SIGNAL_HIT_R }]);
    expect(fc.boxes).toHaveLength(1);
    const b = fc.boxes[0];
    // 排列方向 +z,5 台:中心在第 3 台
    expect(b.x).toBeCloseTo(10);
    expect(b.z).toBeCloseTo(2 * SCOOTER_SLOT);
    expect(b.hx).toBeCloseTo(2.5 * SCOOTER_SLOT);
    expect(b.hz).toBeCloseTo(SCOOTER_LEN / 2);
  });

  async function driveInto(f: ReturnType<typeof furnitureCollision>) {
    await R.init();
    const pw = createPhysicsWorld(R);
    addStaticFurniture(pw, f);
    // 車頭朝東(+x),全油門 4 秒;前方 25 m 有東西
    const car = new Vehicle(pw, 0, 0, 90);
    for (let i = 0; i < 240; i++) {
      car.update({ throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_DT);
      pw.world.step();
    }
    return car.position().x;
  }

  it('全速撞樹會被擋下(沒有東西時同樣時間會開過去)', async () => {
    expect(await driveInto(furnitureCollision(src([])))).toBeGreaterThan(30);
    expect(await driveInto(furnitureCollision(src([[25, 0]])))).toBeLessThan(25);
  });

  it('撞到一排機車會被擋下;長方體的方向跟著排列方向(排列沿 z 時,車子沿 x 撞上去)', async () => {
    // 排列方向 +z、從 z = -2 開始 6 台 → 蓋住 z -2.4 ~ 2.4、x 24.1 ~ 25.9
    expect(await driveInto(furnitureCollision(src([], [], [], [{ p: [25, -2], a: Math.PI / 2, n: 6, f: Math.PI }])))).toBeLessThan(24.1);
  });

  it('撞到候車亭會被擋下(長方體長邊沿道路);站牌是圓柱', async () => {
    // 朝 -x 的候車亭(a = π):長邊沿 z,車子沿 +x 撞上去
    const fc = furnitureCollision(src([], [], [], [], [{ p: [25, 0], a: Math.PI, shelter: true }, { p: [0, 40], a: 0, shelter: false }]));
    expect(fc.boxes).toHaveLength(1);
    expect(fc.posts).toHaveLength(1);
    // 世界座標的範圍:朝 -x(車道在 -x)→ 沿 x 是深度、沿 z 是長度
    const b = fc.boxes[0];
    const ex = Math.abs(Math.cos(b.a)) * b.hx + Math.abs(Math.sin(b.a)) * b.hz;
    const ez = Math.abs(Math.sin(b.a)) * b.hx + Math.abs(Math.cos(b.a)) * b.hz;
    expect(ex).toBeCloseTo(BUS_SHELTER_D / 2, 5);
    expect(ez).toBeCloseTo(BUS_SHELTER_L / 2, 5);
    expect(await driveInto(fc)).toBeLessThan(24);
  });

  it('沒有傢俱時不建剛體;卸載可移除', async () => {
    await R.init();
    const pw = createPhysicsWorld(R);
    const n = pw.world.bodies.len();
    expect(addStaticFurniture(pw, furnitureCollision(src([])))).toBeNull();
    const b = addStaticFurniture(pw, furnitureCollision(src([[1, 1], [9, 9]])));
    expect(pw.world.bodies.len()).toBe(n + 1);
    removeBody(pw, b);
    expect(pw.world.bodies.len()).toBe(n);
  });
});

describe('範圍 A 實際資料', () => {
  const world = loadWorld('range-a');
  const fu = world.json.furniture!;
  const pts = (arr: number[], step: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < arr.length; i += step) out.push([arr[i] / 10, arr[i + 1] / 10]);
    return out;
  };

  it('五種樹形都有;招牌 > 5,000、公車站 > 500(候車亭 > 50)', () => {
    const kinds = new Set<number>();
    for (let i = 2; i < fu.trees.length; i += 3) kinds.add(fu.trees[i]);
    expect(kinds.size).toBe(5);
    expect(fu.signs.length / 6).toBeGreaterThan(5000);
    expect(fu.busStops.length / 4).toBeGreaterThan(500);
    let sh = 0;
    for (let i = 3; i < fu.busStops.length; i += 4) sh += fu.busStops[i];
    expect(sh).toBeGreaterThan(50);
  });

  it('數量合理:樹 > 10,000、路燈 > 3,000、號誌桿 > 300', () => {
    expect(fu.trees.length / 3).toBeGreaterThan(10000);
    expect(fu.lights.length / 3).toBeGreaterThan(3000);
    expect(fu.signals.length / 4).toBeGreaterThan(300);
  });

  it('沒有任何傢俱在道路的車道上', () => {
    const CELL = 50;
    const grid = new Map<string, { a: Pt; b: Pt; half: number }[]>();
    for (const r of world.json.roads) {
      const p = pts(r.pts, 2);
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], b = p[i + 1], pad = r.width / 2;
        for (let gx = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL); gx++)
          for (let gz = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); gz <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL); gz++) {
            const k = `${gx},${gz}`;
            grid.set(k, [...(grid.get(k) ?? []), { a, b, half: r.width / 2 }]);
          }
      }
    }
    const bad = [...pts(fu.trees, 3), ...pts(fu.lights, 3), ...pts(fu.signals, 4), ...pts(fu.busStops, 4)].filter((p) =>
      (grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []).some((s) => segDist(p, s.a, s.b) < s.half),
    );
    expect(bad).toEqual([]);
  });

  it('執行端分格後的樹(含樹種)、招牌、公車站、路燈、號誌、機車排和 world.json 一一對應(角度、高度、台數來回正確)', () => {
    const key = (...v: number[]) => v.map((x) => x.toFixed(3)).join(',');
    const fromChunks: string[] = [], fromJson: string[] = [];
    for (const c of world.chunks.values()) {
      c.furniture.trees.forEach((p, i) => fromChunks.push('T' + key(p[0], p[1], c.furniture.treeKinds[i])));
      for (const s of c.furniture.signs) fromChunks.push('G' + key(s.p[0], s.p[1], s.a, s.y0, s.y1, s.c));
      for (const b of c.furniture.busStops) fromChunks.push('B' + key(b.p[0], b.p[1], b.a, b.shelter ? 1 : 0));
      for (const l of c.furniture.lights) fromChunks.push('L' + key(l.p[0], l.p[1], l.a));
      for (const s of c.furniture.signals) fromChunks.push('S' + key(s.p[0], s.p[1], s.a, s.arm));
      for (const s of c.furniture.scooters) fromChunks.push('M' + key(s.p[0], s.p[1], s.a, s.n, s.f));
    }
    for (let i = 0; i < fu.trees.length; i += 3) fromJson.push('T' + key(fu.trees[i] / 10, fu.trees[i + 1] / 10, fu.trees[i + 2]));
    for (let i = 0; i < fu.signs.length; i += 6) fromJson.push('G' + key(fu.signs[i] / 10, fu.signs[i + 1] / 10, fu.signs[i + 2] / 1000, fu.signs[i + 3] / 10, fu.signs[i + 4] / 10, fu.signs[i + 5]));
    for (let i = 0; i < fu.busStops.length; i += 4) fromJson.push('B' + key(fu.busStops[i] / 10, fu.busStops[i + 1] / 10, fu.busStops[i + 2] / 1000, fu.busStops[i + 3]));
    for (let i = 0; i < fu.lights.length; i += 3) fromJson.push('L' + key(fu.lights[i] / 10, fu.lights[i + 1] / 10, fu.lights[i + 2] / 1000));
    for (let i = 0; i < fu.signals.length; i += 4) fromJson.push('S' + key(fu.signals[i] / 10, fu.signals[i + 1] / 10, fu.signals[i + 2] / 1000, fu.signals[i + 3] / 10));
    for (let i = 0; i < fu.scooters.length; i += 5) fromJson.push('M' + key(fu.scooters[i] / 10, fu.scooters[i + 1] / 10, fu.scooters[i + 2] / 1000, fu.scooters[i + 3], fu.scooters[i + 4] / 1000));
    expect(fromChunks.sort()).toEqual(fromJson.sort());
  });

  it('沒有傢俱在路口鋪面或水道上', () => {
    const items = [...pts(fu.trees, 3), ...pts(fu.lights, 3), ...pts(fu.signals, 4), ...pts(fu.scooters, 5), ...pts(fu.busStops, 4)];
    const junctions = (world.json.street?.junctions ?? []).map((j) => pts(j, 2));
    const near = (p: Pt, r: Pt[]) => r.some((q) => Math.abs(q[0] - p[0]) < 60 && Math.abs(q[1] - p[1]) < 60);
    expect(items.filter((p) => junctions.some((j) => near(p, j) && pointInPolygon(p, j)))).toEqual([]);
    const ww = world.json.waterways.map((w) => ({ p: pts(w.pts, 2), half: w.w / 2 }));
    expect(items.filter((p) => ww.some((w) => near(p, w.p) && roadDist(p, w.p) < w.half))).toEqual([]);
  });

  it('招牌底部都在 3.4 m 以上(伸到車道上方時車子過得去)', () => {
    for (let i = 3; i < fu.signs.length; i += 6) expect(fu.signs[i]).toBeGreaterThanOrEqual(SIGN_BOTTOM * 10);
  });

  it('沒有樹長在建築裡', () => {
    const CELL = 50;
    const grid = new Map<string, Pt[][]>();
    for (const b of world.json.buildings) {
      const r = pts(b.rings[0], 2);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++)
        for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
          const k = `${gx},${gz}`;
          grid.set(k, [...(grid.get(k) ?? []), r]);
        }
    }
    const bad = pts(fu.trees, 3).filter((p) => (grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []).some((r) => pointInPolygon(p, r)));
    expect(bad).toEqual([]);
  });

  it('每格的碰撞形狀數 = 該格傢俱數;全區加總 = world.json 的傢俱總數(分格不重複、不遺失)', () => {
    let total = 0;
    for (const c of world.chunks.values()) {
      const fc = furnitureCollision(c);
      const shelters = c.furniture.busStops.filter((b) => b.shelter).length;
      expect(fc.posts.length).toBe(c.furniture.trees.length + c.furniture.lights.length + c.furniture.signals.length + c.furniture.busStops.length - shelters);
      expect(fc.boxes.length).toBe(c.furniture.scooters.length + shelters);
      expect(c.furniture.treeKinds.length).toBe(c.furniture.trees.length);
      total += fc.posts.length + fc.boxes.length;
    }
    expect(total).toBe(fu.trees.length / 3 + fu.lights.length / 3 + fu.signals.length / 4 + fu.scooters.length / 5 + fu.busStops.length / 4);
  });

  it('傢俱網格:代碼全是 PLAIN_CODE(不畫窗),不進三角網格碰撞體(碰撞改用圓柱)', () => {
    let n = 0;
    for (const c of [...world.chunks.values()].slice(0, 80)) {
      const m = buildChunk(c);
      for (let i = 1; i < (m.furniture.wall?.length ?? 0); i += 2) expect(m.furniture.wall![i]).toBe(PLAIN_CODE);
      expect(colliderMeshes(m)).not.toContain(m.furniture);
      expect(m.scooters.length / 4).toBe(c.furniture.scooters.reduce((t, r) => t + r.n, 0));
      n += m.furniture.index.length;
    }
    expect(n).toBeGreaterThan(0);
  });
});
