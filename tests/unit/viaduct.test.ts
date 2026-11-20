// 文心路高架捷運(decisions/0030,Cooper 2026-11-14:要高架的外型,不用列車)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildViaduct, chainLines } from '../../tools/map-build/lib/rail';
import { addStation, addViaduct, viaductCollision, viaductSpans } from '../../src/world/gen/viaduct';
import { MeshBuilder } from '../../src/world/gen/mesh';
import { VIADUCT } from '../../src/config/viaduct';
import { decodeWorld } from '../../src/world/chunks';
import type { Pt } from '../../src/world/gen/geom';
import type { WorldJson } from '../../src/map/types';

const B: [number, number, number, number] = [-1000, -1000, 1000, 1000];
// 兩條平行軌道(z = ±2),沿 x 軸 600 m;分成兩段 way
const tracks: Pt[][] = [[[-300, -2], [0, -2]], [[0, -2], [300, -2]], [[300, 2], [-300, 2]]];
// 文心路:兩條單向車道,中心線在 z = ±10、各寬 16 m → 中間縫 z ∈ [−2, 2];橫交道路在 x = 0
const lanes = [{ pts: [[-400, -10], [400, -10]] as Pt[], width: 16 }, { pts: [[400, 10], [-400, 10]] as Pt[], width: 16 }];
const crossRoad = { pts: [[0, -200], [0, 200]] as Pt[], width: 20 };

describe('高架橋(建置)', () => {
  it('相接的軌道串成一條;橋中心線取兩條軌道的中間', () => {
    expect(chainLines(tracks).length).toBe(2);
    const v = buildViaduct(tracks, [], [], B);
    expect(v.lines.length).toBe(1);
    for (const p of v.lines[0]) expect(Math.abs(p[1])).toBeLessThan(0.01);
    // 方向依哪條軌道當基準而定,只看兩端有到
    const xs = v.lines[0].map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-300, 0);
    expect(Math.max(...xs)).toBeCloseTo(300, 0);
  });

  it('墩柱約每 30 m 一根,立在兩側車道中間;橫交道路(路口)上不放', () => {
    const v = buildViaduct(tracks, [], [...lanes, crossRoad], B);
    expect(v.piers.length).toBeGreaterThanOrEqual(17);
    for (const p of v.piers) {
      expect(Math.abs(p.p[1])).toBeLessThan(0.5);
      // 橫交道路路面 x ∈ [−10, 10],墩柱(含自己的大小)要在外面
      expect(Math.abs(p.p[0])).toBeGreaterThan(10 + VIADUCT.pierHalf[0]);
    }
  });

  it('軌道偏在一側車道上時,墩柱橫向挪到兩側車道中間的縫', () => {
    // 軌道整個往 +z 偏 3 m(中心線在 z = 3,已經在 z = 10 那條車道裡)
    const off = tracks.map((t) => t.map(([x, z]) => [x, z + 3] as Pt));
    const v = buildViaduct(off, [], lanes, B);
    expect(v.piers.length).toBeGreaterThan(10);
    for (const p of v.piers) expect(Math.abs(p.p[1])).toBeLessThan(0.6);
  });

  it('車站投影到中心線上、方向沿著橋;離橋太遠的站不算;超出地圖的部分切掉', () => {
    const v = buildViaduct(tracks, [{ name: '甲站', p: [100, 15] }, { name: '遠站', p: [100, 300] }], [], [-1000, -1000, 150, 1000]);
    expect(v.stations.map((s) => s.name)).toEqual(['甲站']);
    expect(v.stations[0].p[0]).toBeCloseTo(100, 0);
    expect(Math.abs(v.stations[0].p[1])).toBeLessThan(0.01);
    expect(Math.abs(Math.cos(v.stations[0].a))).toBeCloseTo(1);
    expect(Math.max(...v.lines.flat().map((p) => p[0]))).toBeLessThanOrEqual(150);
  });
});

describe('車站(decisions/0033)', () => {
  it('站體範圍內墩柱加密(約 15 m 一根),站外照舊 30 m', () => {
    const v = buildViaduct(tracks, [{ name: '甲站', p: [0, 0] }], lanes, B);
    const near = v.piers.filter((p) => Math.abs(p.p[0]) < VIADUCT.stationHalf[0]).map((p) => p.p[0]).sort((a, b) => a - b);
    const far = v.piers.filter((p) => p.p[0] > VIADUCT.stationHalf[0] + 30).map((p) => p.p[0]).sort((a, b) => a - b);
    const gap = (xs: number[]) => Math.min(...xs.slice(1).map((x, i) => x - xs[i]));
    expect(near.length).toBeGreaterThanOrEqual(5);
    expect(gap(near)).toBeLessThan(20);
    expect(gap(far)).toBeGreaterThan(25);
  });

  const box = (mb: MeshBuilder) => {
    const p = mb.toArrays().position;
    let y0 = Infinity, y1 = -Infinity, w = 0;
    for (let i = 0; i < p.length; i += 3) {
      y0 = Math.min(y0, p[i + 1]);
      y1 = Math.max(y1, p[i + 1]);
      w = Math.max(w, Math.abs(p[i + 2]));
    }
    return { y0, y1, w };
  };
  it('站體:底(裙板)在車子上方、頂約 20 m、寬約 28 m;弧形屋簷的站比較高', () => {
    const flat = new MeshBuilder({ wall: true });
    addStation(flat, { name: '市政府', p: [0, 0], a: 0 });
    const f = box(flat);
    expect(f.y0).toBeCloseTo(VIADUCT.hull[0]);
    expect(f.y0).toBeGreaterThan(6);
    expect(f.y1).toBeCloseTo(VIADUCT.roof[1]);
    expect(f.w).toBeCloseTo(VIADUCT.stationHalf[1] + VIADUCT.roof[2], 0);
    const arch = new MeshBuilder({ wall: true });
    addStation(arch, { name: '文心森林公園', p: [0, 0], a: 0 });
    expect(box(arch).y1).toBeGreaterThan(f.y1 + 1);
  });

  it('空橋從站體側面接到建築,在車子上方', () => {
    const mb = new MeshBuilder({ wall: true });
    addStation(mb, { name: '市政府', p: [0, 0], a: 0, bridges: [[[0, 14], [0, 40]]] });
    const b = box(mb);
    expect(b.w).toBeGreaterThanOrEqual(40);
    expect(VIADUCT.bridge[0]).toBeGreaterThan(6);
  });
});

describe('高架橋(遊戲端)', () => {
  it('橋面切成不超過 spanLen 的小段,首尾相接', () => {
    const sp = viaductSpans([[0, 0], [100, 0], [100, 40]]);
    for (const [a, b] of sp) expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(VIADUCT.spanLen + 1e-6);
    expect(sp[0][0]).toEqual([0, 0]);
    expect(sp.at(-1)![1]).toEqual([100, 40]);
    for (let i = 1; i < sp.length; i++) expect(sp[i][0]).toEqual(sp[i - 1][1]);
  });

  it('橋面在車子上方(底高 ≥ 8 m);只有墩柱有碰撞', () => {
    const src = { spans: viaductSpans([[0, 0], [60, 0]]), piers: [{ p: [15, 0] as Pt, a: 0 }, { p: [45, 0] as Pt, a: 0 }], stations: [{ name: '甲', p: [30, 0] as Pt, a: 0 }] };
    const mb = new MeshBuilder({ wall: true });
    addViaduct(mb, src);
    const m = mb.toArrays();
    expect(m.index.length).toBeGreaterThan(0);
    expect(VIADUCT.deckY).toBeGreaterThanOrEqual(8);
    const boxes = viaductCollision(src);
    expect(boxes.length).toBe(2);
    expect(boxes[0]).toMatchObject({ x: 15, z: 0, hx: VIADUCT.pierHalf[0], hz: VIADUCT.pierHalf[1] });
  });

  it('實際地圖:沿文心路約 8–9 km、10 個車站、墩柱 250 根以上;分到格子後不重複、不遺失', () => {
    const json = JSON.parse(readFileSync(new URL('../../public/map/range-a/world.json', import.meta.url), 'utf8')) as WorldJson;
    const v = json.viaduct!;
    expect(v.stations.length).toBe(10);
    expect(v.stations.map((s) => s.name)).toContain('市政府');
    expect(v.piers.length / 3).toBeGreaterThan(250);
    // 有連通建築的站都接了空橋(南屯站的連通建築不在地圖資料裡);有識別色的連通建築帶外牆色
    expect(v.stations.filter((s) => s.b?.length).length).toBeGreaterThanOrEqual(9);
    expect(json.buildings.filter((b) => b.k && Object.values(VIADUCT.identity).includes(b.k)).length).toBeGreaterThanOrEqual(6);
    const world = decodeWorld(json);
    let piers = 0, stations = 0, len = 0;
    for (const c of world.chunks.values()) {
      const f = c.furniture.viaduct;
      if (!f) continue;
      piers += f.piers.length;
      stations += f.stations.length;
      len += f.spans.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    }
    expect(piers).toBe(v.piers.length / 3);
    expect(stations).toBe(10);
    expect(len).toBeGreaterThan(8000);
    expect(len).toBeLessThan(12000);
  }, 30000);
});
