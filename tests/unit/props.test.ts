// Tripo 街道物件(decisions/0020):樹、路燈改成樣板擺放時，不再生成程式幾何、擺放資料正確。
import { afterEach, describe, expect, it } from 'vitest';
import { buildFurniture, type ChunkSrc } from '../../src/world/chunks';
import { propPoses } from '../../src/world/gen/furniture';
import { PROP_TREE_SCALE, propsModeFromSearch, setPropsMode } from '../../src/config/props';
import { pickVariant } from '../../src/render/props';
import type { Pt } from '../../src/world/gen/geom';

const src = (trees: Pt[], lights: Pt[]) =>
  ({ furniture: { trees, treeKinds: trees.map(() => 0), lights: lights.map((p) => ({ p, a: 1.5 })), signals: [], scooters: [], signs: [], busStops: [] } }) as unknown as ChunkSrc;

afterEach(() => setPropsMode('gen'));

describe('Tripo 街道物件', () => {
  it('網址預設 tripo,?props=gen 換回程式生成', () => {
    expect(propsModeFromSearch('')).toBe('tripo');
    expect(propsModeFromSearch('?props=gen')).toBe('gen');
  });

  it('tripo 模式:樹與路燈不產生幾何，改成擺放資料;gen 模式相反', () => {
    const c = src([[1, 2], [10, 2]], [[5, 5]]);
    setPropsMode('gen');
    const g = buildFurniture(c);
    expect(g.furniture.index.length).toBeGreaterThan(0);
    expect(g.props.length).toBe(0);
    setPropsMode('tripo');
    const t = buildFurniture(c);
    expect(t.furniture.index.length).toBe(0);
    expect(t.props.length).toBe(3 * 5);
  });

  it('擺放資料：種類、位置、路燈朝向 = 懸臂朝向、樹的大小在範圍內', () => {
    const p = propPoses([[1, 2]], [{ p: [5, 6], a: 0.7 }], PROP_TREE_SCALE);
    expect([p[0], p[1], p[2]]).toEqual([0, 1, 2]);
    expect(p[4]).toBeGreaterThanOrEqual(PROP_TREE_SCALE[0]);
    expect(p[4]).toBeLessThanOrEqual(PROP_TREE_SCALE[1]);
    expect([p[5], p[6], p[7], p[9]]).toEqual([1, 5, 6, 1]);
    expect(p[8]).toBeCloseTo(0.7);
  });

  it('樣板挑選：同一點固定、三種都會用到', () => {
    expect(pickVariant(12.3, -4.5, 3)).toBe(pickVariant(12.3, -4.5, 3));
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(pickVariant(i * 9.1, i * 3.7, 3));
    expect(seen.size).toBe(3);
  });
});

describe('整組樹朝向道路(Cooper 2026-11-12:原檔不拆)', () => {
  it('樣板前緣(局部 +z)轉向最近的道路', () => {
    // 道路沿 x 軸(z = 0),樹在 z = 5 → 前緣要朝 −z
    const p = propPoses([[3, 5]], [], [1, 1], [[[-50, 0], [50, 0]]]);
    const a = p[3];
    expect(-Math.sin(a)).toBeCloseTo(0);
    expect(Math.cos(a)).toBeCloseTo(-1);
    // 樹在 z = −5 → 朝 +z
    const b = propPoses([[3, -5]], [], [1, 1], [[[-50, 0], [50, 0]]])[3];
    expect(Math.cos(b)).toBeCloseTo(1);
  });
});
