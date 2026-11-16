// 每個路口放號誌(Cooper 2026-11-12:「我想減少路燈的數量,然後在每個路口放上紅綠燈」)
import { describe, expect, it } from 'vitest';
import { intersectionSignals, type FurnitureApproach } from '../../tools/map-build/lib/furniture';
import { LIGHT_SPACING, SIGNAL_CURB, SIGNAL_SETBACK } from '../../src/config/furniture';

const ap = (p: [number, number], dir: [number, number], name: string, highway = 'residential', half = 6): FurnitureApproach => ({ p, dir, half, highway, name });

describe('每個路口的號誌', () => {
  it('兩條大路的十字路口:四個進入方向各一支,立在右側路緣、懸臂朝路中央', () => {
    const s = intersectionSignals([
      ap([6, -20], [0, 1], '甲路'), // 往 +z 開,右側 = +x… 這裡 p 已是右側路緣
      ap([-6, 20], [0, -1], '甲路'),
      ap([-20, -6], [1, 0], '乙路'),
      ap([20, 6], [-1, 0], '乙路'),
    ]);
    expect(s.length).toBe(4);
    // 第一支:行車方向 +z,左法向量 = (−1, 0)… 依 leftNormal 定義,懸臂朝路中央 = 從路緣點往回指向車道
    const first = s[0];
    const toward: [number, number] = [Math.cos(first.a), Math.sin(first.a)];
    // 立桿點 = 路緣點往外 SIGNAL_CURB、往後退 SIGNAL_SETBACK
    const back = [6 - toward[0] * SIGNAL_CURB, -20 - SIGNAL_SETBACK - toward[1] * SIGNAL_CURB];
    expect(first.p[0]).toBeCloseTo(back[0]);
    expect(first.p[1]).toBeCloseTo(back[1]);
    expect(first.arm).toBeGreaterThan(0);
  });

  it('窄巷口不放;OSM 標成 residential 的寬路要放', () => {
    const narrow = intersectionSignals([ap([3, -10], [0, 1], '甲巷', 'residential', 2.5), ap([-10, -3], [1, 0], '乙巷', 'residential', 2.5)]);
    expect(narrow.length).toBe(0);
    const wide = intersectionSignals([ap([6, -20], [0, 1], '惠來路二段', 'residential', 6), ap([-20, -6], [1, 0], '市政北二路', 'residential', 6)]);
    expect(wide.length).toBe(2);
  });

  it('分隔島兩側的單向車道各自窄,但同名道路夠寬就算大路', () => {
    const s = intersectionSignals([
      ap([3, -20], [0, 1], '大道', 'residential', 2.5),
      ap([30, -20], [0, 1], '大道', 'residential', 6), // 同名道路另一段較寬
      ap([-20, -6], [1, 0], '橫路', 'tertiary', 6),
    ]);
    expect(s.length).toBe(3);
  });

  it('同一條路的對向、路段中間單獨一個停止線都不算路口', () => {
    expect(intersectionSignals([ap([6, -20], [0, 1], '甲路', 'primary'), ap([-6, 20], [0, -1], '甲路', 'primary')]).length).toBe(0);
    expect(intersectionSignals([ap([6, -20], [0, 1], '甲路', 'primary'), ap([500, 0], [1, 0], '乙路', 'primary')]).length).toBe(0);
  });

  it('路燈間距已拉大(數量約減半)', () => {
    expect(LIGHT_SPACING).toBe(128); // 0042 再減半
  });
});
