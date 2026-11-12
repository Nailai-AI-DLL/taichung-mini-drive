// 雙黃線平順(decisions/0018)。Cooper 2026-11-12:「附圖中的雙黃線為何會有扭曲感?」
// 原因:對向單行道配對的雙黃線沿兩條中心線的中點每 1 m 取一點,投影卡頂點 + 10 cm 量化 → 鋸齒。
// 需要先建置:npm run map:build:range-a
import { describe, expect, it } from 'vitest';
import { simplifyLine, smoothLine } from '../../tools/map-build/lib/street';
import { yellowRoughness } from '../../tools/dev/yellow-roughness';
import type { Pt } from '../../src/world/gen/geom';

describe('雙黃線平順', () => {
  it('range-a 全部雙黃線:每公尺側向偏移 p95 < 1 cm(修正前配對雙黃線 5.4 cm)', () => {
    const r = yellowRoughness('range-a');
    expect(r.strips).toBeGreaterThan(300);
    expect(r.p95cm).toBeLessThan(1);
  });
  it('鋸齒中線(±5 cm、每 1 m 一點)平滑 + 簡化後只剩少數點,偏差 < 3 cm', () => {
    const zig: Pt[] = Array.from({ length: 101 }, (_, i) => [i, i % 2 ? 0.05 : -0.05]);
    const out = simplifyLine(smoothLine(zig, 4), 0.03);
    expect(out.length).toBeLessThan(10);
    expect(out[0][0]).toBe(0);
    expect(out[out.length - 1][0]).toBe(100);
    for (const p of out.slice(1, -1)) expect(Math.abs(p[1])).toBeLessThan(0.03);
  });
  it('真的彎道(半徑 80 m 的 1/4 圓)簡化後仍貼著圓,偏差 < 5 cm', () => {
    const arc: Pt[] = Array.from({ length: 126 }, (_, i) => {
      const a = (i / 125) * (Math.PI / 2);
      return [80 * Math.cos(a), 80 * Math.sin(a)];
    });
    const out = simplifyLine(smoothLine(arc, 4), 0.03);
    for (const p of out) expect(Math.abs(Math.hypot(p[0], p[1]) - 80)).toBeLessThan(0.05);
  });
});
