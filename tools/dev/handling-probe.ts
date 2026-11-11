// 手感量測:在空地上量 0–100 km/h、100–0 煞車距離、最小迴轉半徑、手煞車甩尾角速度。
// 用法:npx tsx tools/dev/handling-probe.ts
import R from '@dimforge/rapier3d-compat';
import { createPhysicsWorld, FIXED_DT } from '../../src/physics/world';
import { Vehicle, type DriveInput } from '../../src/vehicle/vehicle';

export async function measure() {
  await R.init();
  const pw = createPhysicsWorld(R);
  const car = new Vehicle(pw, 0, 0, 90);
  const step = (inp: DriveInput) => { car.update(inp, FIXED_DT); pw.world.step(); };
  for (let i = 0; i < 60; i++) step({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  // 0-100
  let t = 0;
  while (car.speedKmh() < 100 && t < 30) { step({ throttle: 1, brake: 0, steer: 0, handbrake: false }); t += FIXED_DT; }
  const accel = t;
  const p0 = car.position();
  // 煞車
  let steps = 0;
  while (car.speed() > 0.3 && steps < 3000) { step({ throttle: 0, brake: 1, steer: 0, handbrake: false }); steps++; }
  const p1 = car.position();
  const brakeDist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  // 低速迴轉:20 km/h 右滿舵,量圓周
  while (car.speedKmh() < 20) step({ throttle: 1, brake: 0, steer: 0, handbrake: false });
  const pts: [number, number][] = [];
  const h0 = car.headingDeg();
  for (let i = 0; i < 600; i++) {
    const thr = car.speedKmh() < 20 ? 0.6 : 0;
    step({ throttle: thr, brake: 0, steer: 1, handbrake: false });
    const p = car.position(); pts.push([p.x, p.z]);
  }
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  const radius = ((Math.max(...xs) - Math.min(...xs)) + (Math.max(...zs) - Math.min(...zs))) / 4;
  const h1 = car.headingDeg();
  // 右轉檢查:方位角應增加
  // 甩尾:60 km/h 拉手煞車 + 打方向 1 秒,量車頭轉角
  car.reset(0, 0, 90);
  for (let i = 0; i < 30; i++) step({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  while (car.speedKmh() < 60) step({ throttle: 1, brake: 0, steer: 0, handbrake: false });
  const hd0 = car.headingDeg();
  for (let i = 0; i < 60; i++) step({ throttle: 0.3, brake: 0, steer: 1, handbrake: true });
  const hd1 = car.headingDeg();
  // 最高速
  car.reset(0, 0, 90);
  for (let i = 0; i < 60 * 25; i++) step({ throttle: 1, brake: 0, steer: 0, handbrake: false });
  return { accel0to100s: +accel.toFixed(2), brake100to0m: +brakeDist.toFixed(1), turnRadius20kmh: +radius.toFixed(1),
    rightTurnHeadingDelta: +(((h1 - h0) + 360) % 360).toFixed(0), handbrakeYawIn1s: +(((hd1 - hd0) + 540) % 360 - 180).toFixed(0),
    topSpeedKmh: +car.speedKmh().toFixed(0), upY: +car.upY().toFixed(2), autoRight: car.autoRightCount };
}
if (import.meta.url === `file://${process.argv[1]}`) measure().then(r => console.log(r));
