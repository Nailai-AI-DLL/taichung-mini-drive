// 大地圖(decisions/0037):整個地圖範圍放進畫面、北朝上
import { describe, expect, it } from 'vitest';
import { bigMapPoint, bigMapWorldPoint, fitBounds } from '../../src/ui/bigmap';

const B = [-3300, -2490, 3300, 2490];

describe('大地圖', () => {
  it('整個範圍放進畫布、不變形(寬高比和地圖範圍一樣)', () => {
    for (const [w, h] of [[1600, 800], [800, 1200], [1200, 900]]) {
      const f = fitBounds(B, w, h);
      expect(f.width).toBeLessThanOrEqual(w + 1e-6);
      expect(f.height).toBeLessThanOrEqual(h + 1e-6);
      expect(Math.max(f.width / w, f.height / h)).toBeCloseTo(1, 6); // 有一邊貼滿
      expect(f.width / f.height).toBeCloseTo(6600 / 4980, 6);
    }
  });
  it('北朝上:範圍西北角在左上、東南角在右下、北(-z)在上', () => {
    const f = fitBounds(B, 1320, 996);
    expect(bigMapPoint(B, f.scale, -3300, -2490)).toEqual([0, 0]);
    const [x, y] = bigMapPoint(B, f.scale, 3300, 2490);
    expect(x).toBeCloseTo(f.width, 6);
    expect(y).toBeCloseTo(f.height, 6);
    const n = bigMapPoint(B, f.scale, 0, -100), s = bigMapPoint(B, f.scale, 0, 100);
    expect(n[1]).toBeLessThan(s[1]);
    const e = bigMapPoint(B, f.scale, 100, 0), wv = bigMapPoint(B, f.scale, -100, 0);
    expect(e[0]).toBeGreaterThan(wv[0]);
  });
  it('畫布座標反算回世界座標(快速移動點擊轉換)往返精準一致', () => {
    const f = fitBounds(B, 1320, 996);
    for (const [wx, wz] of [[-1824, 1002], [2701, -3720], [0, 0], [847.5, -1234.25]]) {
      const [px, py] = bigMapPoint(B, f.scale, wx, wz);
      const [rx, rz] = bigMapWorldPoint(B, f.scale, px, py);
      expect(rx).toBeCloseTo(wx, 6);
      expect(rz).toBeCloseTo(wz, 6);
    }
  });
});
