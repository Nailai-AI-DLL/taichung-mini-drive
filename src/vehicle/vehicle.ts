// 車輛:Rapier 射線懸吊車輛控制器 + 街機輔助(轉向隨速衰減、手煞車甩尾、下壓力、自動扶正)。
// 車體座標:+X = 車頭、+Y = 上、+Z = 右側。不依賴 DOM 與 three.js。
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { DEFAULT_PARAMS, type VehicleParams } from './params';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1(停住後持續按 = 倒車)
  steer: number; // -1(左)..1(右)
  handbrake: boolean;
}

export const NO_INPUT: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

const FRONT = [0, 1];
const REAR = [2, 3];

export class Vehicle {
  readonly body: RAPIER_NS.RigidBody;
  readonly controller: RAPIER_NS.DynamicRayCastVehicleController;
  params: VehicleParams;
  private steerAngle = 0;
  private flippedTime = 0;
  /** 最近一次自動扶正的次數(測試與除錯用) */
  autoRightCount = 0;

  constructor(private readonly pw: PhysicsWorld, x: number, z: number, headingDeg: number, params: Partial<VehicleParams> = {}) {
    const { R, world } = pw;
    this.params = { ...DEFAULT_PARAMS, ...params };
    const p = this.params;
    const [hx, hy, hz] = p.halfExtents;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, 1, z)
      .setCcdEnabled(true)
      .setLinearDamping(p.linearDamping)
      .setAngularDamping(p.angularDamping)
      .setAdditionalMassProperties(
        p.mass,
        { x: 0, y: -p.comDrop, z: 0 },
        // 方塊慣性,翻滾軸(X)加大讓車不易翻
        { x: ((p.mass / 12) * ((2 * hy) ** 2 + (2 * hz) ** 2)) * 2.5, y: (p.mass / 12) * ((2 * hx) ** 2 + (2 * hz) ** 2), z: (p.mass / 12) * ((2 * hx) ** 2 + (2 * hy) ** 2) },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.body = world.createRigidBody(desc);
    world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setDensity(0).setFriction(0.4).setRestitution(0.1), this.body);

    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 0;
    const positions: [number, number][] = [
      [p.wheelBaseHalf, -p.trackHalf], // 前左
      [p.wheelBaseHalf, p.trackHalf], // 前右
      [-p.wheelBaseHalf, -p.trackHalf], // 後左
      [-p.wheelBaseHalf, p.trackHalf], // 後右
    ];
    for (const [wx, wz] of positions) {
      this.controller.addWheel({ x: wx, y: p.wheelY, z: wz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, p.suspensionRest, p.wheelRadius);
    }
    this.applyParams();
    this.reset(x, z, headingDeg);
  }

  /** 參數改變後呼叫(調參面板用) */
  applyParams() {
    const p = this.params;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelSuspensionStiffness(i, p.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, p.suspensionCompression);
      this.controller.setWheelSuspensionRelaxation(i, p.suspensionRelaxation);
      this.controller.setWheelMaxSuspensionForce(i, p.maxSuspensionForce);
      this.controller.setWheelMaxSuspensionTravel(i, 0.3);
      this.controller.setWheelFrictionSlip(i, p.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, p.sideFriction);
      this.controller.setWheelRadius(i, p.wheelRadius);
    }
    this.body.setLinearDamping(p.linearDamping);
    this.body.setAngularDamping(p.angularDamping);
  }

  /** 放到指定位置,車頭朝羅盤方位角(北 = 0,東 = 90);surfaceY 為路面海拔高度(預設 0) */
  reset(x: number, z: number, headingDeg: number, surfaceY = 0) {
    const theta = ((90 - headingDeg) * Math.PI) / 180;
    this.body.setTranslation({ x, y: surfaceY + 0.9, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steerAngle = 0;
    this.flippedTime = 0;
  }

  /** 車頭方向(世界座標,水平單位向量) */
  heading(): [number, number] {
    return headingOf(this.body.rotation());
  }

  /** 羅盤方位角(度) */
  headingDeg(): number {
    const [fx, fz] = this.heading();
    return ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
  }

  /** 車體上方向量的 y 分量(1 = 正立,< 0 = 翻覆) */
  upY(): number {
    const q = this.body.rotation();
    return 1 - 2 * (q.x * q.x + q.z * q.z);
  }

  /** 前進方向速度(m/s,倒車為負) */
  speed(): number {
    return this.controller.currentVehicleSpeed();
  }

  speedKmh(): number {
    return this.speed() * 3.6;
  }

  position() {
    return this.body.translation();
  }

  /** 每個固定時間步呼叫一次(在 world.step 之前) */
  update(input: DriveInput, dt: number) {
    const p = this.params;
    const c = this.controller;
    const v = this.speed();
    const kmh = Math.abs(v) * 3.6;

    // 轉向:最大角度隨速度線性衰減;正值 = 左轉(Rapier 繞 +Y 旋轉),所以輸入取負號
    const fade = Math.min(1, kmh / p.steerFadeKmh);
    const maxAngle = p.steerMaxLow + (p.steerMaxHigh - p.steerMaxLow) * fade;
    const target = -input.steer * maxAngle;
    // 往外打用 steerSpeed;回正(目標更接近 0 或反向)用 steerReturnSpeed
    const returning = Math.abs(target) < Math.abs(this.steerAngle) || target * this.steerAngle < 0;
    const k = Math.min(1, (returning ? p.steerReturnSpeed : p.steerSpeed) * dt);
    this.steerAngle += (target - this.steerAngle) * k;
    for (const i of FRONT) c.setWheelSteering(i, this.steerAngle);

    // 油門、煞車、倒車
    let engine = 0;
    let brake = 0;
    if (input.throttle > 0) {
      if (v < -0.5) brake = p.brakeForce * input.throttle;
      else if (kmh < p.maxSpeedKmh) engine = p.engineForce * input.throttle;
    }
    if (input.brake > 0) {
      if (v > 0.5) brake = p.brakeForce * input.brake;
      else if (v > -p.maxReverseKmh / 3.6) engine = -p.reverseForce * input.brake;
    }
    if (input.throttle === 0 && input.brake === 0) brake = 0.6; // 放開油門時的引擎煞車感
    // 驅動:前 40% / 後 60%,後輪多一點讓尾巴好甩
    for (const i of FRONT) c.setWheelEngineForce(i, engine * 0.8);
    for (const i of REAR) c.setWheelEngineForce(i, engine * 1.2);
    for (const i of FRONT) c.setWheelBrake(i, brake);
    for (const i of REAR) {
      c.setWheelBrake(i, brake + (input.handbrake ? p.handbrakeRearBrake : 0));
      c.setWheelSideFrictionStiffness(i, input.handbrake ? p.sideFriction * p.handbrakeSideGrip : p.sideFriction);
    }

    // 下壓力:速度越快越貼地
    const down = p.downforce * v * v * dt;
    if (down > 0) this.body.applyImpulse({ x: 0, y: -down, z: 0 }, true);

    // 自動扶正:翻覆超過 1.5 秒且幾乎停住
    if (this.upY() < 0.3 && Math.abs(v) < 3) this.flippedTime += dt;
    else this.flippedTime = 0;
    if (this.flippedTime > 1.5) {
      const pos = this.position();
      this.reset(pos.x, pos.z, this.headingDeg());
      this.autoRightCount++;
    }

    c.updateVehicle(dt);
  }

  /** 第 i 個輪子的懸吊長度、轉向、轉動角(渲染用) */
  wheelState(i: number) {
    return {
      suspension: this.controller.wheelSuspensionLength(i) ?? this.params.suspensionRest,
      steering: this.controller.wheelSteering(i) ?? 0,
      rotation: this.controller.wheelRotation(i) ?? 0,
    };
  }

  dispose() {
    this.pw.world.removeVehicleController(this.controller);
    this.pw.world.removeRigidBody(this.body);
  }
}

/** 車頭水平方向(車體 +X 經旋轉後投影到 XZ 平面,已正規化) */
export function headingOf(q: { x: number; y: number; z: number; w: number }): [number, number] {
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const fz = 2 * (q.x * q.z - q.w * q.y);
  const l = Math.hypot(fx, fz) || 1;
  return [fx / l, fz / l];
}
