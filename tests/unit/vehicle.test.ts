// 車輛手感與方向正確性。數值範圍是 M0 的合理性檢查;Cooper 試開核定後(M3)改為核定範圍。
import { beforeAll, describe, expect, it } from 'vitest';
import { measure } from '../../tools/dev/handling-probe';

let r: Awaited<ReturnType<typeof measure>>;
beforeAll(async () => {
  r = await measure();
}, 120_000);

describe('車輛手感(初版)', () => {
  it('0–100 km/h 在 4–8 秒', () => {
    expect(r.accel0to100s).toBeGreaterThan(4);
    expect(r.accel0to100s).toBeLessThan(8);
  });
  it('100–0 煞車距離在 25–45 m', () => {
    expect(r.brake100to0m).toBeGreaterThan(25);
    expect(r.brake100to0m).toBeLessThan(45);
  });
  it('20 km/h 迴轉半徑 < 8 m', () => expect(r.turnRadius20kmh).toBeLessThan(8));
  it('右轉(D)+ 手煞車 1 秒,車頭往右轉 45°–150°(好甩)', () => {
    expect(r.handbrakeYawIn1s).toBeGreaterThan(45);
    expect(r.handbrakeYawIn1s).toBeLessThan(150);
  });
  it('極速受限在 130 km/h 附近', () => expect(Math.abs(r.topSpeedKmh - 130)).toBeLessThan(5));
  it('全程沒有翻車', () => {
    expect(r.upY).toBeGreaterThan(0.9);
    expect(r.autoRight).toBe(0);
  });
});
