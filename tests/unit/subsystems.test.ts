// Step 2 子系統單元測試:PerfTracker(FPS、1% Low、最慢幀與前一幀分項追蹤)與 TrafficPhysicsSync(Rapier 運動學剛體同步與 3D 高程)。
import { describe, expect, it } from 'vitest';
import R from '@dimforge/rapier3d-compat';
import { PerfTracker } from '../../src/core/perf-tracker';
import { createPhysicsWorld } from '../../src/physics/world';
import { TrafficPhysicsSync } from '../../src/traffic/traffic-system';
import type { TrafficCar } from '../../src/traffic/traffic';

describe('PerfTracker (src/core/perf-tracker.ts)', () => {
  it('計算 FPS、avgFps、p1LowFps、consumeMaxFrameMs,並記錄第 60 幀之後最慢的 5 幀與其前一幀工作分項', () => {
    const perf = new PerfTracker(0);
    let now = 0;
    for (let i = 1; i <= 70; i++) {
      // 第 65 幀模擬一個 50 ms 的卡頓,前一步(第 64 幀)做了 12.3 ms 的 colliders
      const stepMs = i === 65 ? 50 : 10;
      now += stepMs;
      const dt = perf.beginFrame(now);
      expect(dt).toBeCloseTo(stepMs / 1000, 5);
      if (i === 64) perf.work.colliders = 12.34;
      perf.endFrame();
    }
    expect(perf.frames).toBe(70);
    expect(perf.fps).toBeGreaterThan(80);
    expect(perf.avgFps()).toBeGreaterThan(80);
    expect(perf.p1LowFps()).toBeCloseTo(20, 1);
    expect(perf.consumeMaxFrameMs()).toBeCloseTo(50, 1);
    // 讀取後歸零
    expect(perf.consumeMaxFrameMs()).toBe(0);

    const worst = perf.reportWorst();
    expect(worst.length).toBe(5);
    expect(worst[0].ms).toBeCloseTo(50, 1);
    expect(worst[0].at).toBe(64);
    expect(worst[0].prev.colliders).toBeCloseTo(12.3, 1);
  });
});

describe('TrafficPhysicsSync (src/traffic/traffic-system.ts)', () => {
  it('自動建立、更新與移除一般車及公車的運動學剛體,並反映高架橋 3D 高度 y', async () => {
    await R.init();
    const pw = createPhysicsWorld(R, [-1000, -1000, 1000, 1000]);
    const sync = new TrafficPhysicsSync(pw);

    const car1: TrafficCar = {
      id: 1,
      x: 10,
      y: 0,
      z: 20,
      heading: 0,
      speed: 10,
      cruise: 10,
      pace: 0.5,
      way: 0,
      from: 0,
      dir: 1,
      s: 0,
      lane: 2,
      color: 0,
      kind: 'car',
      stuck: 0,
    };
    const bus2: TrafficCar = {
      ...car1,
      id: 2,
      x: 50,
      y: 12, // 在 12 m 高架橋上
      z: -30,
      kind: 'bus',
    };

    sync.sync([car1, bus2], []);
    expect(sync.bodies.size).toBe(2);
    const b1 = sync.bodies.get(1)!;
    const b2 = sync.bodies.get(2)!;
    expect(b1.translation().x).toBeCloseTo(10);
    // 公車在高架橋 y = 12 上,剛體中心高度應 > 13 m
    expect(b2.translation().y).toBeGreaterThan(13);

    // 移動 car1 並移除 bus2
    car1.x = 25;
    car1.y = 6;
    sync.sync([car1], [2]);
    pw.world.step();
    expect(sync.bodies.size).toBe(1);
    expect(sync.bodies.has(2)).toBe(false);
    expect(b1.translation().x).toBeCloseTo(25);
    expect(b1.translation().y).toBeGreaterThan(6.5);
  });
});
