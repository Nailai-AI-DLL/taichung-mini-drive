// 追車鏡頭與畫面插值(docs/decisions/0009 S1、T5)。
// 模擬遊戲主迴圈:物理固定 1/60 秒步進,畫面依各種幀時間更新;車子直線等速 30 m/s(108 km/h)。
// 量的是暖機後每幀「鏡頭到(畫面上的)車」的距離變化幅度;越小代表車子在畫面上越穩。
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ChaseCamera, type Smoothing } from '../../src/camera/chase-camera';
import { PoseInterpolator } from '../../src/core/pose-interpolator';

const SPEED = 30;
const FIXED = 1 / 60;
const FWD = new THREE.Vector2(1, 0);
const ROT = { x: 0, y: 0, z: 0, w: 1 };

const DT = {
  hz120: () => 1 / 120,
  hz60: () => 1 / 60,
  jitter: (i: number) => 1 / 60 + (i % 3 === 0 ? 0.004 : -0.002),
  drops: (i: number) => (i % 2 ? 1 / 40 : 1 / 120),
};

function drive(smoothing: Smoothing, interp: boolean, dtOf: (i: number) => number, frames = 900) {
  const cam = new ChaseCamera(16 / 9);
  cam.setSmoothing(smoothing);
  const body = new THREE.Vector3();
  const pose = new PoseInterpolator();
  pose.snap(body, ROT);
  let acc = 0;
  const dists: number[] = [];
  for (let i = 0; i < frames; i++) {
    const dt = dtOf(i);
    acc += dt;
    while (acc >= FIXED) {
      body.x += SPEED * FIXED;
      pose.push(body, ROT);
      acc -= FIXED;
    }
    const car = interp ? pose.sample(acc / FIXED).position : body;
    cam.update(dt, car, FWD, SPEED * 3.6);
    if (i > 400) dists.push(cam.camera.position.distanceTo(car));
  }
  return dists;
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const range = (a: number[]) => Math.max(...a) - Math.min(...a);

describe('畫面插值', () => {
  it('沒有插值時,120 Hz 螢幕上車子相對鏡頭前後跳動(重現舊問題)', () => {
    expect(range(drive('world', false, DT.hz120))).toBeGreaterThan(0.15);
    expect(range(drive('world', false, DT.jitter))).toBeGreaterThan(0.15);
  });

  it('有插值時,舊鏡頭在 120 Hz 與幀時間不均時都穩定(< 2 cm)', () => {
    for (const f of [DT.hz120, DT.hz60, DT.jitter]) expect(range(drive('world', true, f))).toBeLessThan(0.02);
  });

  it('插值器在 snap 之後不會從舊位置滑過去', () => {
    const pose = new PoseInterpolator();
    pose.snap({ x: 0, y: 0, z: 0 }, ROT);
    pose.push({ x: 1, y: 0, z: 0 }, ROT);
    pose.snap({ x: 500, y: 0, z: 0 }, ROT);
    expect(pose.sample(0).position.x).toBe(500);
    expect(pose.sample(0.5).position.x).toBe(500);
  });

  it('旋轉用球面插值:兩個姿態中間是半角', () => {
    const pose = new PoseInterpolator();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    pose.snap({ x: 0, y: 0, z: 0 }, q0);
    pose.push({ x: 0, y: 0, z: 0 }, q1);
    const half = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    expect(pose.sample(0.5).rotation.angleTo(half)).toBeLessThan(1e-6);
  });
});

describe('鏡頭平滑方式 A/B', () => {
  it('新鏡頭(body)在掉幀時也幾乎不動(< 1 mm)', () => {
    for (const f of Object.values(DT)) expect(range(drive('body', true, f))).toBeLessThan(0.001);
  });

  it('兩種鏡頭的平均構圖距離相近(差 < 0.5 m),A/B 只差在穩定度與轉彎緩動', () => {
    const w = mean(drive('world', true, DT.hz60));
    const b = mean(drive('body', true, DT.hz60));
    expect(Math.abs(w - b)).toBeLessThan(0.5);
  });

  it('行駛中切換鏡頭,不會瞬間跳位', () => {
    const cam = new ChaseCamera(16 / 9);
    const car = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      car.x += SPEED * FIXED;
      cam.update(FIXED, car, FWD, SPEED * 3.6);
    }
    for (const s of ['body', 'world', 'body'] as Smoothing[]) {
      const before = cam.camera.position.clone();
      cam.setSmoothing(s);
      car.x += SPEED * FIXED;
      cam.update(FIXED, car, FWD, SPEED * 3.6);
      // 一幀內的移動量不超過車子一幀的位移 + 0.3 m
      expect(cam.camera.position.distanceTo(before)).toBeLessThan(SPEED * FIXED + 0.3);
    }
  });

  /** 等速行駛中途切換鏡頭,回傳切換後 2 秒內鏡頭到車距離的變化幅度 */
  function switchRange(from: Smoothing, to: Smoothing) {
    const cam = new ChaseCamera(16 / 9);
    cam.setSmoothing(from);
    const car = new THREE.Vector3();
    const d: number[] = [];
    for (let i = 0; i < 480; i++) {
      if (i === 240) cam.setSmoothing(to);
      car.x += SPEED * FIXED;
      cam.update(FIXED, car, FWD, SPEED * 3.6);
      if (i >= 240) d.push(cam.camera.position.distanceTo(car));
    }
    return range(d);
  }

  it('等速行駛中切換鏡頭,構圖距離不會先縮再放(< 0.3 m)', () => {
    expect(switchRange('world', 'body')).toBeLessThan(0.3);
    expect(switchRange('body', 'world')).toBeLessThan(0.3);
  });

  it('新鏡頭在高速時 snap(按 R 回到路面),直接用當下車速構圖,不會從遠處滑回來', () => {
    const cam = new ChaseCamera(16 / 9);
    cam.setSmoothing('body');
    const car = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      car.x += SPEED * FIXED;
      cam.update(FIXED, car, FWD, SPEED * 3.6);
    }
    cam.snap();
    // 重設後車子靜止
    cam.update(FIXED, car, FWD, 0);
    const first = cam.camera.position.distanceTo(car);
    for (let i = 0; i < 120; i++) cam.update(FIXED, car, FWD, 0);
    expect(Math.abs(cam.camera.position.distanceTo(car) - first)).toBeLessThan(0.05);
  });
});

// 第一人稱(decisions/0017):C 鍵第 3 個視角;眼睛在駕駛座(台灣左駕 → 車子左側)、離地約 1.16 m、看向車頭前方
describe('第一人稱視角', () => {
  it('第 3 個模式是第一人稱,眼睛在車子左側、看向前方', () => {
    const cam = new ChaseCamera(16 / 9);
    cam.setMode(2);
    expect(cam.modeName).toBe('第一人稱');
    expect(cam.isFirstPerson).toBe(true);
    // 車子在原點、車頭朝 +X(forward = (1, 0));右方 = (-fz, fx) = (0, 1) → 左側是 z < 0
    cam.update(1 / 60, new THREE.Vector3(0, 0.8, 0), new THREE.Vector2(1, 0), 0);
    const p = cam.camera.position;
    expect(p.z).toBeLessThan(-0.2);
    expect(p.y).toBeCloseTo(0.8 + 0.36, 2);
    expect(Math.abs(p.x)).toBeLessThan(0.5);
    const dir = cam.camera.getWorldDirection(new THREE.Vector3());
    expect(dir.x).toBeGreaterThan(0.95);
  });
  it('其他視角不是第一人稱', () => {
    const cam = new ChaseCamera(16 / 9);
    for (const i of [0, 1, 3]) {
      cam.setMode(i);
      expect(cam.isFirstPerson).toBe(false);
    }
  });
});

// 第一人稱引擎蓋(decisions/0018):從眼睛看出去,引擎蓋在畫面下半部、不擋到地平線
import { createFpHood, HOOD } from '../../src/render/fp-hood';
describe('第一人稱引擎蓋', () => {
  it('引擎蓋與儀表板都在眼睛下方、視野內(畫面下半),上緣不超過地平線', () => {
    const cam = new ChaseCamera(16 / 9);
    cam.setMode(2);
    cam.update(1 / 60, new THREE.Vector3(0, 0.8, 0), new THREE.Vector2(1, 0), 0);
    cam.camera.updateMatrixWorld();
    const hood = createFpHood();
    hood.position.set(0, 0.8, 0);
    hood.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(hood);
    expect(box.max.y).toBeLessThan(cam.camera.position.y);
    // 引擎蓋前緣中點投影到畫面:在畫面內、下半部
    const nose = new THREE.Vector3(HOOD.x1, 0.8 + HOOD.y1, 0).project(cam.camera);
    expect(nose.y).toBeLessThan(0);
    expect(nose.y).toBeGreaterThan(-1);
    expect(Math.abs(nose.x)).toBeLessThan(1);
  });
});
