// 遠景山脈與雲(decisions/0019)。山的資料:npm run map:skyline:range-a(內政部 20 m DTM,臺中市分幅)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { bandProfile, createMountains, type Skyline } from '../../src/render/mountains';
import { cloudPuffs, createClouds } from '../../src/render/clouds';

const sky = JSON.parse(readFileSync(join(__dirname, '../../public/map/range-a/skyline.json'), 'utf8')) as Skyline & { eyeElevation: number };
/** 某方位範圍內(度,北 0 東 90)某一層的最大仰角 */
const maxIn = (band: number, a0: number, a1: number) => {
  let m = -Infinity;
  sky.bands[band].angle.forEach((v, i) => {
    const az = i * sky.azStep;
    if (v !== null && az >= a0 && az <= a1) m = Math.max(m, v);
  });
  return m;
};

describe('遠景山脈資料(實際地形)', () => {
  it('觀察點高度合理(範圍 A 地面 45–122 m,0010)', () => {
    expect(sky.eyeElevation).toBeGreaterThan(45);
    expect(sky.eyeElevation).toBeLessThan(125);
  });
  it('東邊(中央山脈)遠層仰角 3–5°,比西邊高', () => {
    const east = maxIn(2, 45, 135);
    expect(east).toBeGreaterThan(3);
    expect(east).toBeLessThan(5);
    expect(east).toBeGreaterThan(maxIn(0, 225, 315));
  });
  it('西邊(大肚山台地)近層看得到、但很低(0–2°)', () => {
    const west = maxIn(0, 240, 300);
    expect(west).toBeGreaterThan(0);
    expect(west).toBeLessThan(2);
  });
  it('bandProfile:每 2 格取最大、null 當地平線下', () => {
    expect(bandProfile([1, 2, null, null, 0.5, null], 2)).toEqual([2, -1, 0.5]);
  });
  it('建出三圈山,每圈都有三角形', () => {
    const g = createMountains(sky);
    expect(g.children.length).toBe(3);
    for (const c of g.children) expect(((c as THREE.Mesh).geometry.getAttribute('position').count)).toBeGreaterThan(300);
  });
});

describe('雲的種類', () => {
  const rnd = (() => {
    let s = 1;
    return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
  })();
  it('濃積雲比積雲高(有往上疊的層)', () => {
    const top = (ps: ReturnType<typeof cloudPuffs>) => Math.max(...ps.map((p) => p.y + p.r * p.sy));
    expect(top(cloudPuffs('tower', 100, rnd))).toBeGreaterThan(top(cloudPuffs('cumulus', 100, rnd)) * 1.5);
  });
  it('層雲、卷雲是扁的(高 / 寬 < 0.35)', () => {
    for (const k of ['sheet', 'streak'] as const) for (const p of cloudPuffs(k, 150, rnd)) expect(p.sy / p.sx).toBeLessThan(0.35);
  });
  it('雲分兩個網格(蓬鬆 / 扁平),都有東西', () => {
    const g = createClouds([-3300, -2490, 3300, 2490]);
    expect(g.children.map((c) => c.name).sort()).toEqual(['clouds-flat', 'clouds-puffy']);
  });
});
