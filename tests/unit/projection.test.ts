// 投影正確性:以獨立實作(tools/research/twd97_to_wgs84.py)算出的參考點,檢查 proj4 正算誤差 < 0.01 m。
import { describe, expect, it } from 'vitest';
import ref from '../fixtures/tm2-reference.json';
import { bearingToDir, lonLatToTm2, lonLatToWorld, worldToLonLat } from '../../src/map/projection';

describe('TWD97 TM2 投影', () => {
  for (const p of ref.points) {
    it(`(${p.lat}, ${p.lon}) → (${p.e}, ${p.n})`, () => {
      const [e, n] = lonLatToTm2(p.lon, p.lat);
      expect(Math.abs(e - p.e)).toBeLessThan(0.01);
      expect(Math.abs(n - p.n)).toBeLessThan(0.01);
    });
  }

  it('世界座標:東 = +X、北 = -Z,往返誤差 < 1 mm', () => {
    const origin = { e: 217000, n: 2673000 };
    const [x0, z0] = lonLatToWorld(120.6752422902, 24.1619762245, origin);
    expect(Math.hypot(x0, z0)).toBeLessThan(0.01);
    const [xe] = lonLatToWorld(120.6852, 24.1619762245, origin);
    expect(xe).toBeGreaterThan(900); // 往東約 1 km
    const [, zn] = lonLatToWorld(120.6752422902, 24.1709, origin);
    expect(zn).toBeLessThan(-900); // 往北約 1 km
    const [lon, lat] = worldToLonLat(123.4, -567.8, origin);
    const [x, z] = lonLatToWorld(lon, lat, origin);
    expect(Math.hypot(x - 123.4, z + 567.8)).toBeLessThan(0.001);
  });

  it('方位角:北 = -Z、東 = +X', () => {
    const [nx, nz] = bearingToDir(0);
    expect(nx).toBeCloseTo(0);
    expect(nz).toBeCloseTo(-1);
    const [ex, ez] = bearingToDir(90);
    expect(ex).toBeCloseTo(1);
    expect(ez).toBeCloseTo(0);
  });
});
