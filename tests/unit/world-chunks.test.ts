// 地圖格式 v2 與分塊生成(docs/decisions/0012)、路寬換算(0011)。
// 需要先建置:npm run map:build:range-a
import R from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { loadWorld } from '../helpers/load-map';
import { buildChunk, type ChunkSrc } from '../../src/world/chunks';
import { ChunkStreamer, distToChunk } from '../../src/world/streamer';
import { addStaticTrimesh, createPhysicsWorld, removeBody } from '../../src/physics/world';
import { QUANT } from '../../src/map/types';
import { resolveWidth, runsAlongside, sidewalkForGov, splitWidth } from '../../tools/map-build/lib/roads';
import { MeshBuilder } from '../../src/world/gen/mesh';
import { extrudeBuilding, sharpFlags } from '../../src/world/chunks';
import type { BuildingKind } from '../../src/config/buildings';
import type { Pt } from '../../src/world/gen/geom';

const world = loadWorld('range-a');

const polyLen = (pts: [number, number][]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

describe('範圍 A 資料', () => {
  it('world.json 壓縮後遠低於 30 MB 預算(< 3 MB)', () => {
    const text = readFileSync(join(__dirname, '../../public/map/range-a/world.json'));
    expect(gzipSync(text).byteLength).toBeLessThan(3 * 1024 * 1024);
  });

  it('建築數量合理(OSM 實查約 12,500 棟)', () => {
    expect(world.json.buildings.length).toBeGreaterThan(11000);
    expect(world.json.buildings.length).toBeLessThan(15000);
  });

  it('道路最大連通分量 ≥ 95%(M1 驗收條件)', () => {
    expect(world.json.meta.stats.largestComponentShare).toBeGreaterThanOrEqual(0.95);
  });

  it('沿河道路不把河道算進路面(梅川西路;驗收發現的問題)', () => {
    const rs = world.json.roads.filter((r) => r.name.startsWith('梅川西路'));
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(r.width).toBeLessThanOrEqual(12);
  });

  it('寬路上的單行 way 不會拿到整條路的寬度(臺灣大道、文心路;驗收發現的問題)', () => {
    for (const name of ['臺灣大道二段', '文心路三段']) {
      for (const r of world.json.roads.filter((r) => r.name === name && r.oneway && r.widthFrom === 'gov')) {
        expect(r.width).toBeLessThanOrEqual(26);
      }
    }
  });

  it('八成以上的道路長度用上政府路寬', () => {
    const s = world.json.meta.stats;
    expect(s.roadLengthWidthFrom_govM / s.roadLengthM).toBeGreaterThan(0.8);
  });
});

describe('分塊', () => {
  it('每棟建築剛好分到一格', () => {
    let n = 0;
    for (const c of world.chunks.values()) n += c.buildings.length;
    expect(n).toBe(world.json.buildings.length);
  });

  it('道路裁切到各格後總長不變(誤差 < 0.1%)', () => {
    let whole = 0;
    for (const r of world.json.roads) {
      const pts: [number, number][] = [];
      for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i] / QUANT, r.pts[i + 1] / QUANT]);
      whole += polyLen(pts);
    }
    let split = 0;
    for (const c of world.chunks.values()) for (const p of c.roads) split += polyLen(p.pts);
    expect(Math.abs(split - whole) / whole).toBeLessThan(0.001);
  });

  // 全部測試平行跑時 CPU 被其他測試檔搶,5 次量測可能都偏慢(2026-11-11:4 次全套跑失敗 2 次;加重試 2 次後 3 次全套仍失敗 1 次;單獨跑都過)。
  // 所以分兩種門檻:npm run test:perf(單獨跑這個檔、環境變數 PERF_STRICT=1)用正式門檻 50 ms;
  // 全套平行跑只抓「慢了好幾倍」的大退步(150 ms);但電腦本身滿載時(系統負載 > 核心數 1.5 倍,2026-11-11 實測負載 338、
  // 150 ms 也會失敗)計時沒有意義,全套跑時只印出數字、不比門檻。test:perf 一律嚴格比。
  const budget = process.env.PERF_STRICT ? 50 : 150;
  const overloaded = !process.env.PERF_STRICT && loadavg()[0] > cpus().length * 1.5;
  it(`最密的一格生成網格 < ${budget} ms(正式門檻 50 ms 用 npm run test:perf 量;瀏覽器端另以 e2e 量)`, () => {
    let densest: ChunkSrc | null = null;
    for (const c of world.chunks.values()) if (!densest || c.buildings.length > densest.buildings.length) densest = c;
    // 先暖機(JIT),再取 5 次中最快的一次;全部測試平行跑時 CPU 會被搶,單次量測不穩(3 次時 2026-11-01 偶發一次超過)
    let m = buildChunk(densest!);
    let ms = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      m = buildChunk(densest!);
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(m.buildings.index.length).toBeGreaterThan(0);
    expect(m.ground.index.length).toBeGreaterThan(0);
    console.log(`最密的一格生成網格 ${ms.toFixed(1)} ms(系統負載 ${loadavg()[0].toFixed(0)}、${cpus().length} 核${overloaded ? ',滿載不比門檻' : ''})`);
    if (!overloaded) expect(ms).toBeLessThan(budget);
  });
});

describe('串流', () => {
  it('依距離載入、遠離後卸載;載入與卸載的掛勾成對', () => {
    const live = new Set<string>();
    const s = new ChunkStreamer(world, { onLoad: (c) => live.add(c.key), onUnload: (c) => live.delete(c.key) });
    const sp = world.json.spawn;
    s.loadAll(sp.x, sp.z);
    expect(live.size).toBe(s.loaded.size);
    for (const k of live) expect(distToChunk(world.chunks.get(k)!, sp.x, sp.z)).toBeLessThanOrEqual(s.opts.loadRadius);
    const first = new Set(live);
    // 開到 3 km 外
    s.loadAll(sp.x + 3000, sp.z);
    for (const k of first) {
      const d = distToChunk(world.chunks.get(k)!, sp.x + 3000, sp.z);
      expect(live.has(k)).toBe(d <= s.opts.unloadRadius);
    }
    expect(live.size).toBe(s.loaded.size);
  });

  it('時間預算用完就停,但每次至少生成一格', () => {
    let t = 0;
    // 假時鐘:每生成一格前進 3 ms
    const s = new ChunkStreamer(world, { onLoad: () => (t += 3), onUnload: () => {} }, undefined, () => t);
    const sp = world.json.spawn;
    const r1 = s.update(sp.x, sp.z, 4);
    expect(r1.generated).toBe(2);
    const r2 = s.update(sp.x, sp.z, 0);
    expect(r2.generated).toBe(1);
  });

  it('兩段生成(0015 §11.10):有 onFurniture 時,onLoad 不帶傢俱,傢俱晚一次 update 交出;同一次不會又生成格子又生成傢俱', () => {
    let t = 0;
    const order: string[] = [];
    const s = new ChunkStreamer(world, {
      onLoad: (c, m) => {
        t += 3;
        expect(m.furniture.index.length).toBe(0);
        order.push('L' + c.key);
      },
      onFurniture: (c) => {
        t += 3;
        order.push('F' + c.key);
      },
      onUnload: () => {},
    }, undefined, () => t);
    // 找一個有傢俱的格子當車子位置
    const c0 = [...world.chunks.values()].find((c) => c.furniture.trees.length > 5)!;
    const x = (c0.rect.minX + c0.rect.maxX) / 2, z = (c0.rect.minZ + c0.rect.maxZ) / 2;
    const r1 = s.update(x, z, 1);
    expect(r1.generated).toBe(1);
    expect(order).toEqual(['L' + c0.key]);
    // 還有格子沒生成時,傢俱要等預算有剩;預算 0 時下一次只生成格子
    s.update(x, z, 0);
    expect(order.filter((o) => o.startsWith('F'))).toHaveLength(0);
    // 全部格子都生成後,傢俱由近到遠補上,每格一次
    s.loadAll(x, z);
    const loads = order.filter((o) => o.startsWith('L')).map((o) => o.slice(1));
    const furn = order.filter((o) => o.startsWith('F')).map((o) => o.slice(1));
    expect(new Set(furn)).toEqual(new Set(loads));
    expect(furn[0]).toBe(c0.key);
    for (const k of furn) expect(order.indexOf('L' + k)).toBeLessThan(order.indexOf('F' + k));
  });

  it('兩段生成:傢俱還沒生成就卸載的格子,不會再交出傢俱', () => {
    const got: string[] = [];
    const s = new ChunkStreamer(world, { onLoad: () => {}, onFurniture: (c) => got.push(c.key), onUnload: () => {} });
    const sp = world.json.spawn;
    s.update(sp.x, sp.z, 0); // 只生成最近一格,傢俱還沒做
    const first = [...s.loaded];
    s.loadAll(sp.x + 5000, sp.z + 5000); // 開走:全部卸載
    expect(s.loaded.size).toBe(0);
    s.loadAll(sp.x + 5000, sp.z + 5000);
    for (const k of first) expect(got).not.toContain(k);
  });

  it('卸載後碰撞體一併移除', async () => {
    await R.init();
    const pw = createPhysicsWorld(R, world.json.meta.bounds);
    const base = pw.world.bodies.len();
    const bodies = new Map<string, ReturnType<typeof addStaticTrimesh>>();
    const s = new ChunkStreamer(world, {
      onLoad: (c, m) => bodies.set(c.key, addStaticTrimesh(pw, m.buildings.position, m.buildings.index)),
      onUnload: (c) => {
        removeBody(pw, bodies.get(c.key)!);
        bodies.delete(c.key);
      },
    }, { loadRadius: 300, unloadRadius: 400, budgetMs: Infinity });
    const sp = world.json.spawn;
    s.loadAll(sp.x, sp.z);
    expect(pw.world.bodies.len()).toBeGreaterThan(base);
    s.loadAll(sp.x + 5000, sp.z + 5000); // 區域外:附近沒有格子
    expect(pw.world.bodies.len()).toBe(base);
  });
});

describe('路寬換算(0011 (a))', () => {
  const t = (o: Record<string, string>) => ({ name: '測試路', ...o });
  it('雙向道路:政府寬扣兩側人行道', () => {
    const r = resolveWidth(1, t({ highway: 'tertiary' }), {}, { 1: { w: 23 } });
    expect(r).toEqual({ width: 23 - 2 * sidewalkForGov(23), sidewalk: 4, from: 'gov', carriage: 15 });
  });
  it('回傳整條路的路面寬(carriage),由建置端依平行 way 數平分', () => {
    const r = resolveWidth(1, t({ highway: 'primary', oneway: 'yes' }), {}, { 1: { w: 40 } });
    expect(r.carriage).toBe(40 - 8);
    expect(splitWidth(r.carriage!, 2)).toBe(16);
    expect(splitWidth(52, 4)).toBe(13);
    expect(splitWidth(4, 4)).toBe(3); // 下限
    expect(splitWidth(80, 1)).toBe(30); // 上限
  });
  it('一般單行巷道不平分', () => {
    const r = resolveWidth(1, t({ highway: 'residential', oneway: 'yes' }), {}, { 1: { w: 8 } });
    expect(r.width).toBe(8 - 3);
  });
  it('快速道路、匝道、高架、無名寬路不套政府寬', () => {
    expect(resolveWidth(1, t({ highway: 'trunk' }), {}, { 1: { w: 40 } }).from).toBe('default');
    expect(resolveWidth(1, t({ highway: 'primary_link' }), {}, { 1: { w: 40 } }).from).toBe('default');
    expect(resolveWidth(1, t({ highway: 'primary', bridge: 'yes' }), {}, { 1: { w: 40 } }).from).toBe('default');
    expect(resolveWidth(1, { highway: 'service' }, {}, { 1: { w: 24 } }).from).toBe('default');
  });
  it('巷弄與服務道路不畫人行道', () => {
    expect(resolveWidth(1, t({ highway: 'service' }), {}, { 1: { w: 10 } }).sidewalk).toBe(0);
    expect(resolveWidth(1, t({ highway: 'residential' }), {}, { 1: { w: 6 } }).sidewalk).toBe(0);
  });
});

describe('平行 way 判定(政府路寬平分、沿河排除)', () => {
  const main: Pt[] = [[0, 0], [100, 0]];
  it('旁邊 10 m 的平行同名路算兄弟', () => {
    expect(runsAlongside(main, [[-20, 10], [120, 10]], 20)).toBe(true);
    expect(runsAlongside(main, [[120, -10], [-20, -10]], 20)).toBe(true); // 反向(對向車道)
  });
  it('太遠、垂直、或前後相接的同名路段都不算', () => {
    expect(runsAlongside(main, [[-20, 30], [120, 30]], 20)).toBe(false);
    expect(runsAlongside(main, [[50, -50], [50, 50]], 20)).toBe(false);
    expect(runsAlongside(main, [[100, 0], [200, 0]], 20)).toBe(false);
    expect(runsAlongside([[0, 0], [10, 0]], [[10, 0], [200, 0]], 20)).toBe(false); // 短路段接著長路段
  });
});

describe('分塊生成 = 直接生成(0012 §4)', () => {
  it('所有格子的建築網格頂點總數,等於逐棟直接擠出的總數', () => {
    const direct = new MeshBuilder({ wall: true });
    for (const b of world.json.buildings) {
      const rings = b.rings.map((r) => {
        const out: Pt[] = [];
        for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT, r[i + 1] / QUANT]);
        return out;
      });
      const t = b.t as BuildingKind;
      extrudeBuilding(direct, { id: b.id, h: b.h / 10, t, s: b.s === 1, rings, sharp: b.c && sharpFlags(rings[0].length, b.c) });
    }
    let chunked = 0;
    let chunkedTris = 0;
    for (const c of world.chunks.values()) {
      const m = buildChunk(c).buildings;
      chunked += m.position.length / 3;
      chunkedTris += m.index.length / 3;
    }
    expect(chunked).toBe(direct.vertexCount);
    expect(chunkedTris).toBe(direct.idx.length / 3);
  });
});
