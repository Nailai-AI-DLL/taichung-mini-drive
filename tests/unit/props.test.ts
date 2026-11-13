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

import * as THREE from 'three';
import { PROP_LIGHT_STYLE } from '../../src/config/props';
import { paintLight } from '../../src/render/props';
describe('路燈方案 A(Cooper 2026-11-12)', () => {
  it('燈頭下方朝下的面塗燈罩色,燈桿與燈頭上面塗燈桿色', () => {
    // 燈桿:x=0 的直立面;燈頭:高 8 m、x=2 的朝下面與朝上面
    const pts = [
      [0, 0, 0], [0, 8, 0], [0, 0, 1], // 直立(燈桿)
      [1.5, 8, 0], [2.5, 8, 0], [2, 8, 1], // 朝下或朝上依繞向
      [1.5, 8, 0], [2, 8, 1], [2.5, 8, 0],
    ].flat();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const { geometry, lensFaces } = paintLight(g);
    expect(lensFaces).toBe(1);
    const col = geometry.getAttribute('color');
    const pole = new THREE.Color(PROP_LIGHT_STYLE.pole), lens = new THREE.Color(PROP_LIGHT_STYLE.lens);
    const faceColor = (f: number) => [col.getX(f * 3), col.getY(f * 3), col.getZ(f * 3)];
    expect(faceColor(0)[0]).toBeCloseTo(pole.r);
    const colors = [faceColor(1)[0], faceColor(2)[0]].sort();
    expect(colors[0]).toBeCloseTo(pole.r);
    expect(colors[1]).toBeCloseTo(lens.r);
  });

  it('燈桿是深色、燈罩是亮色(不會變回灰模)', () => {
    const lum = (h: string) => new THREE.Color(h).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
    expect(lum(PROP_LIGHT_STYLE.pole)).toBeLessThan(0.35);
    expect(lum(PROP_LIGHT_STYLE.lens)).toBeGreaterThan(0.85);
    expect(PROP_LIGHT_STYLE.outline).toBeGreaterThan(0);
  });
});

import { furnitureCollision } from '../../src/world/chunks';
import { furnitureShow, furnitureShowFromSearch, setFurnitureShow } from '../../src/config/furniture';
describe('行道樹、機車先移除(Cooper 2026-11-13)', () => {
  afterEach(() => setFurnitureShow({ trees: true, scooters: true }));

  it('網址預設都不顯示,?trees=on / ?scooters=on 加回來', () => {
    expect(furnitureShowFromSearch('')).toEqual({ trees: false, scooters: false });
    expect(furnitureShowFromSearch('?trees=on&scooters=on')).toEqual({ trees: true, scooters: true });
  });

  it('關掉後:沒有樹和機車的畫面資料,也沒有它們的碰撞;路燈照舊', () => {
    const c = src([[1, 2], [10, 2]], [[5, 5]]);
    (c.furniture.scooters as unknown[]).push({ p: [20, 3], a: 0, n: 4, f: 1.57 });
    setPropsMode('tripo');
    const on = { poses: buildFurniture(c), hit: furnitureCollision(c) };
    expect(on.poses.props.length).toBe(3 * 5);
    expect(on.poses.scooters.length).toBeGreaterThan(0);
    expect(on.hit.posts.length).toBe(3);
    expect(on.hit.boxes.length).toBe(1);
    setFurnitureShow({ trees: false, scooters: false });
    expect(furnitureShow.trees).toBe(false);
    const off = { poses: buildFurniture(c), hit: furnitureCollision(c) };
    expect(off.poses.props.length).toBe(1 * 5); // 只剩路燈
    expect(off.poses.scooters.length).toBe(0);
    expect(off.hit.posts.length).toBe(1);
    expect(off.hit.boxes.length).toBe(0);
  });
});
