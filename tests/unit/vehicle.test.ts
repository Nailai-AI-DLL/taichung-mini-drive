// 車輛手感與方向正確性。數值範圍是 M0 的合理性檢查;Cooper 試開核定後(M3)改為核定範圍。
import { beforeAll, describe, expect, it } from 'vitest';
import { measure } from '../../tools/dev/handling-probe';

let r: Awaited<ReturnType<typeof measure>>;
beforeAll(async () => {
  r = await measure();
}, 120_000);

describe('車輛手感(初版)', () => {
  // 2026-11-12 極速改 60 km/h(decisions/0017),0–100 / 100–0 量不到了,改量 0–60 / 60–0
  it('0–60 km/h 在 2–5 秒', () => {
    expect(r.accel0to60s).toBeGreaterThan(2);
    expect(r.accel0to60s).toBeLessThan(5);
  });
  it('60–0 煞車距離在 8–20 m', () => {
    expect(r.brake60to0m).toBeGreaterThan(8);
    expect(r.brake60to0m).toBeLessThan(20);
  });
  // Cooper 2026-11-12:「輕輕按一下就會過頭」。改前 19.9°,改後 5.8°;超過 8° 就算退回去了
  it('40 km/h 輕點方向 0.15 秒,車頭轉角 < 8°', () => {
    expect(r.tapYaw40kmh).toBeGreaterThan(1);
    expect(r.tapYaw40kmh).toBeLessThan(8);
  });
  it('20 km/h 迴轉半徑 < 8 m', () => expect(r.turnRadius20kmh).toBeLessThan(8));
  it('右轉(D)+ 手煞車 1 秒,車頭往右轉 45°–150°(好甩)', () => {
    expect(r.handbrakeYawIn1s).toBeGreaterThan(45);
    expect(r.handbrakeYawIn1s).toBeLessThan(150);
  });
  it('極速受限在 120 km/h 附近(Cooper 2026-11-16 為了繞地圖檢查調高;decisions/0040)', () => expect(Math.abs(r.topSpeedKmh - 120)).toBeLessThan(3));
  it('全程沒有翻車', () => {
    expect(r.upY).toBeGreaterThan(0.9);
    expect(r.autoRight).toBe(0);
  });
});
