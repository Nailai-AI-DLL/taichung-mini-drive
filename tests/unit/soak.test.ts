// M0 驗收「可連續開 5 分鐘無卡死」的物理部分:在 M0 地圖(含建築碰撞與邊界牆)上,
// 用沿路行駛的自動駕駛跑 5 分鐘模擬時間(固定時間步 60 Hz)。
// 每秒記一次累積里程。判定:無 NaN、沒掉出地面、累積里程合理,且任何連續 20 秒內的行駛路程都 > 60 m(卡在原地前後晃會失敗;
// 用路程不用位移,因為測試駕駛在地圖邊界掉頭會回到原處)、
// 倒車脫困觸發不超過 15 次。
import R from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../helpers/load-map';
import { buildChunk } from '../../src/world/chunks';
import { RoadIndex } from '../../src/map/road-index';
import { addStaticTrimesh, createPhysicsWorld, FIXED_DT } from '../../src/physics/world';
import { Vehicle, type DriveInput } from '../../src/vehicle/vehicle';

describe('5 分鐘連續駕駛(物理模擬)', () => {
  it('不卡死、不穿模、不出界', async () => {
    await R.init();
    const map = loadWorld('m0');
    const index = new RoadIndex(map.roads);
    const pw = createPhysicsWorld(R, map.json.meta.bounds);
    // M0 只有 1 km²,所有格子的建築碰撞體一次加入
    for (const c of map.chunks.values()) {
      const m = buildChunk(c).buildings;
      addStaticTrimesh(pw, m.position, m.index);
    }
    const s = map.json.spawn;
    const car = new Vehicle(pw, s.x, s.z, s.headingDeg);
    const [minX, minZ, maxX, maxZ] = map.json.meta.bounds;

    let rngState = 12345;
    const rnd = () => ((rngState = (Math.imul(rngState, 1103515245) + 12345) >>> 0) / 2 ** 32);

    let distance = 0;
    let reverseTriggers = 0;
    const windowMarks: number[] = [];
    let minWindowPath = Infinity;
    let stuckTime = 0;
    let maxStuck = 0;
    let reverseLeft = 0;
    let handbrakeLeft = 0;
    let last = car.position();
    const steps = 5 * 60 * 60;
    for (let i = 0; i < steps; i++) {
      const p = car.position();
      const [hx, hz] = car.heading();
      const input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      if (reverseLeft > 0) {
        reverseLeft -= FIXED_DT;
        input.brake = 1;
        input.steer = rnd() > 0.5 ? 1 : -1;
      } else {
        // 沿最近的道路往前看 12 m
        const hit = index.nearest(p.x, p.z);
        let tx = p.x + hx * 12;
        let tz = p.z + hz * 12;
        if (hit) {
          let sign = hit.dirX * hx + hit.dirZ * hz >= 0 ? 1 : -1;
          // 快到地圖邊界時掉頭(玩家會自己掉頭;這裡只是讓測試駕駛不要一直頂牆)
          const ax = hit.x + hit.dirX * sign * 30;
          const az = hit.z + hit.dirZ * sign * 30;
          if (ax < minX + 10 || ax > maxX - 10 || az < minZ + 10 || az > maxZ - 10) sign = -sign;
          tx = hit.x + hit.dirX * sign * 12;
          tz = hit.z + hit.dirZ * sign * 12;
        }
        const ang = Math.atan2(hx * (tz - p.z) - hz * (tx - p.x), hx * (tx - p.x) + hz * (tz - p.z));
        input.steer = Math.max(-1, Math.min(1, ang * 2));
        const cap = Math.abs(ang) > 0.6 ? 18 : 55;
        input.throttle = car.speedKmh() < cap ? 0.9 : 0;
        if (car.speedKmh() > cap + 10) input.brake = 0.5;
        // 偶爾隨機甩尾,測試手煞車情境
        if (handbrakeLeft > 0) handbrakeLeft -= FIXED_DT;
        else if (rnd() < 0.002) handbrakeLeft = 0.6;
        input.handbrake = handbrakeLeft > 0;
      }
      car.update(input, FIXED_DT);
      pw.world.step();

      const q = car.position();
      expect(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z)).toBe(true);
      expect(q.y).toBeGreaterThan(-0.5);
      expect(q.y).toBeLessThan(6);
      expect(q.x).toBeGreaterThan(minX - 5);
      expect(q.x).toBeLessThan(maxX + 5);
      expect(q.z).toBeGreaterThan(minZ - 5);
      expect(q.z).toBeLessThan(maxZ + 5);
      distance += Math.hypot(q.x - last.x, q.z - last.z);
      // 每秒記一次位置,檢查任何 20 秒窗的位移
      if (i % 60 === 0) {
        windowMarks.push(distance);
        if (windowMarks.length > 20) minWindowPath = Math.min(minWindowPath, distance - windowMarks.shift()!);
      }
      last = q;

      if (Math.abs(car.speedKmh()) < 2 && reverseLeft <= 0) {
        stuckTime += FIXED_DT;
        if (stuckTime > 2) {
          reverseLeft = 1.5;
          reverseTriggers++;
          maxStuck = Math.max(maxStuck, stuckTime);
          stuckTime = 0;
        }
      } else if (Math.abs(car.speedKmh()) >= 2) {
        maxStuck = Math.max(maxStuck, stuckTime);
        stuckTime = 0;
      }
    }
    console.log(
      `5 分鐘模擬:里程 ${(distance / 1000).toFixed(2)} km,最長連續卡住 ${maxStuck.toFixed(1)} 秒,倒車脫困 ${reverseTriggers} 次,任 20 秒窗最短路程 ${minWindowPath.toFixed(0)} m,自動扶正 ${car.autoRightCount} 次`,
    );
    expect(minWindowPath).toBeGreaterThan(60);
    expect(reverseTriggers).toBeLessThanOrEqual(15);
    expect(distance).toBeGreaterThan(1500);
  }, 120_000);
});
