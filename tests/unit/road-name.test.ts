// M0 驗收:10 個測試點的路名查詢結果要與 OSM 一致。
// 測試點由 tools/research/make_road_name_fixture.py 直接從 OSM 原始資料產生,不經過遊戲的建置管線。
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/road-name-points.json';
import { loadWorld } from '../helpers/load-map';
import { RoadIndex, RoadNameTracker } from '../../src/map/road-index';
import { bearingToDir, lonLatToWorld } from '../../src/map/projection';

const map = loadWorld('m0');
const index = new RoadIndex(map.roads);

describe('路名查詢(M0 測試點)', () => {
  it('fixture 有 10 個測試點', () => {
    expect(fixture.points).toHaveLength(10);
  });
  for (const p of fixture.points) {
    it(`${p.name}(${p.lat}, ${p.lon},方位 ${p.bearingDeg}°)`, () => {
      const [x, z] = lonLatToWorld(p.lon, p.lat, map.json.meta.origin);
      const [hx, hz] = bearingToDir(p.bearingDeg);
      const hit = index.current(x, z, hx, hz);
      expect(hit?.way.name).toBe(p.name);
      // 反方向行駛也應該認得(雙向道路;單行道逆向時允許判定為其他道路,不在此檢查)
      if (!hit?.way.oneway) expect(index.current(x, z, -hx, -hz)?.way.name).toBe(p.name);
    });
  }
});

describe('路名防抖', () => {
  it('新路名維持 0.5 秒才切換,短暫閃過的路名不顯示', () => {
    const t = new RoadNameTracker(0.5);
    for (let i = 0; i < 40; i++) t.update('臺灣大道三段', 1 / 60);
    expect(t.shown).toBe('臺灣大道三段');
    for (let i = 0; i < 20; i++) t.update('市政路', 1 / 60); // 0.33 秒
    expect(t.shown).toBe('臺灣大道三段');
    for (let i = 0; i < 10; i++) t.update('臺灣大道三段', 1 / 60);
    for (let i = 0; i < 31; i++) t.update('市政路', 1 / 60); // 0.52 秒
    expect(t.shown).toBe('市政路');
  });
});

describe('地圖建置檢查', () => {
  it('可行駛路網最大連通分量涵蓋 ≥ 95% 道路長度', () => {
    expect(map.json.meta.stats.largestComponentShare).toBeGreaterThanOrEqual(0.95);
  });
  it('出生點在道路上', () => {
    const s = map.json.spawn;
    const hit = index.nearest(s.x, s.z);
    expect(hit && hit.distance).toBeLessThan(1);
  });
});
