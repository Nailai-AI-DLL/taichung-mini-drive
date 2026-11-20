// 3D DTM 地形網格生成、貼地建築裙腳、實際 elevation.json 載入與 Rapier 物理爬坡測試
import R from '@dimforge/rapier3d-compat';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addStaticRoadDeck, createPhysicsWorld, FIXED_DT } from '../../src/physics/world';
import { Vehicle } from '../../src/vehicle/vehicle';
import { buildChunk } from '../../src/world/chunks';
import { buildChunkTerrain } from '../../src/world/gen/terrain';
import { GridElevationSampler, type ElevationSampler } from '../../src/world/surface';
import type { WorldElevationJson } from '../../src/map/load';
import { loadWorld } from '../helpers/load-map';

describe('3D DTM 地形網格與物理爬坡', () => {
  const slopedElevation: ElevationSampler = {
    // 往東 (+X) 每 100 m 爬升 8 m(8% 上坡)
    sampleY: (x) => Math.max(0, x * 0.08),
    sampleNormal: (x) => {
      if (x <= 0) return [0, 1, 0];
      const len = Math.hypot(0.08, 1);
      return [-0.08 / len, 1 / len, 0];
    },
  };

  it('buildChunkTerrain 生成法向量朝上的 3D 地表網格,並在下沉地標(sunkHoles)處挖洞', () => {
    const hole: [number, number][] = [[100, 100], [160, 100], [160, 160], [100, 160]];
    const full = buildChunkTerrain({ minX: 0, minZ: 0, maxX: 250, maxZ: 250 }, slopedElevation);
    const withHole = buildChunkTerrain({ minX: 0, minZ: 0, maxX: 250, maxZ: 250 }, slopedElevation, [hole]);

    expect(full.index.length).toBe(10 * 10 * 6);
    expect(withHole.index.length).toBeLessThan(full.index.length);
    // 所有頂點法向量 y > 0
    for (let i = 1; i < full.normal.length; i += 3) {
      expect(full.normal[i]).toBeGreaterThan(0.9);
    }
    // x = 250 m 處頂點高程應為 20 m
    let maxY = -Infinity;
    for (let i = 1; i < full.position.length; i += 3) {
      if (full.position[i] > maxY) maxY = full.position[i];
    }
    expect(maxY).toBeCloseTo(20, 2);
  });

  it('Rapier 物理車輛能在 8% 3D 地形斜坡上穩定加速爬升而不穿地', async () => {
    await R.init();
    const pw = createPhysicsWorld(R, [-250, -250, 250, 250], true);
    const terrain = buildChunkTerrain({ minX: -50, minZ: -50, maxX: 200, maxZ: 50 }, slopedElevation, [], 10);
    addStaticRoadDeck(pw, terrain.position, terrain.index);

    const v = new Vehicle(pw, 0, 0, 90, {}, slopedElevation.sampleY(0, 0));
    for (let i = 0; i < 60 * 6; i++) {
      v.update({ throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_DT);
      pw.world.step();
    }
    const p = v.position();
    const expectedY = slopedElevation.sampleY(p.x, p.z);
    expect(p.x).toBeGreaterThan(30);
    expect(p.y).toBeGreaterThan(expectedY - 0.1);
    expect(p.y).toBeLessThan(expectedY + 1.5);
  });

  it('實際 range-a/elevation.json 可正常載入並涵蓋全區高低差,且 buildChunk 生成貼地建築與地形網格', () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '../../public/map/range-a/elevation.json'), 'utf8'),
    ) as WorldElevationJson;
    expect(raw.cols).toBeGreaterThan(150);
    expect(raw.rows).toBeGreaterThan(150);
    const q = raw.quant ?? 1;
    const heights = Float32Array.from(raw.heights, (v) => v / q);
    const sampler = new GridElevationSampler({
      minX: raw.minX,
      minZ: raw.minZ,
      step: raw.step,
      cols: raw.cols,
      rows: raw.rows,
      heights,
    });

    const world = loadWorld('range-a');
    const sp = world.json.spawn;
    // 出生點為相對高程基準面(≈ 0 m),東北北屯高於西南南屯 > 60 m
    expect(Math.abs(sampler.sampleY(sp.x, sp.z))).toBeLessThan(2);
    expect(sampler.sampleY(2500, -3500) - sampler.sampleY(-3800, 3500)).toBeGreaterThan(60);

    // 任取東北高處一格含建築的分塊,驗證地形網格與建築頂點皆已抬升至該處地表高程
    const highChunk = [...world.chunks.values()].find(
      (c) => c.rect.minX > 1500 && c.rect.maxZ < -2500 && c.buildings.length > 0,
    )!;
    expect(highChunk).toBeTruthy();
    const m = buildChunk(highChunk, false, sampler);
    expect(m.terrain?.index.length).toBeGreaterThan(0);
    const chunkBaseY = sampler.sampleY(
      (highChunk.rect.minX + highChunk.rect.maxX) / 2,
      (highChunk.rect.minZ + highChunk.rect.maxZ) / 2,
    );
    expect(chunkBaseY).toBeGreaterThan(30);
    let minBldY = Infinity;
    for (let i = 1; i < m.buildings.position.length; i += 3) {
      if (m.buildings.position[i] < minBldY) minBldY = m.buildings.position[i];
    }
    // 建築裙腳向下 3 m,應在 chunkBaseY 附近而非 0
    expect(minBldY).toBeGreaterThan(chunkBaseY - 15);
  });
});
