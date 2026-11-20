// AI 車流系統協調器:整合 Traffic 邏輯、Rapier 運動學剛體同步(含 3D 高程 y)與 TrafficLayer 渲染。
import type * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { TRAFFIC } from '../config/traffic';
import type { RoadWay } from '../map/types';
import type { PhysicsWorld } from '../physics/world';
import { TrafficLayer } from '../render/traffic';
import { distToCar, Traffic, type TrafficCar } from './traffic';

/** 將 AI 車輛列表同步為 Rapier 運動學剛體(不依賴 Three.js,可在 Node 測試) */
export class TrafficPhysicsSync {
  readonly bodies = new Map<number, RAPIER_NS.RigidBody>();

  constructor(private readonly pw: PhysicsWorld) {}

  sync(cars: readonly TrafficCar[], removedIds: readonly number[]) {
    const { R, world } = this.pw;
    for (const id of removedIds) {
      const b = this.bodies.get(id);
      if (b) world.removeRigidBody(b);
      this.bodies.delete(id);
    }
    const [bl, bh, bw] = TRAFFIC.body;
    const [ul, uh, uw] = TRAFFIC.bus.size;
    for (const c of cars) {
      let b = this.bodies.get(c.id);
      const rot = { x: 0, y: Math.sin(-c.heading / 2), z: 0, w: Math.cos(-c.heading / 2) };
      const bus = c.kind === 'bus';
      const baseY = c.y ?? 0;
      const y = baseY + (bus ? TRAFFIC.bus.clearance + uh / 2 : TRAFFIC.clearance + (bh + TRAFFIC.cabin[1]) / 2);
      if (!b) {
        b = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, y, c.z).setRotation(rot));
        const half = bus ? [ul / 2, uh / 2, uw / 2] : [bl / 2, (bh + TRAFFIC.cabin[1]) / 2, bw / 2];
        world.createCollider(R.ColliderDesc.cuboid(half[0], half[1], half[2]).setFriction(0.4).setRestitution(0.2), b);
        this.bodies.set(c.id, b);
      } else {
        b.setNextKinematicTranslation({ x: c.x, y, z: c.z });
        b.setNextKinematicRotation(rot);
      }
    }
  }
}

export class TrafficSystem {
  readonly traffic: Traffic;
  readonly physics: TrafficPhysicsSync;
  readonly layer: TrafficLayer;

  constructor(
    roads: RoadWay[],
    scene: THREE.Scene,
    pw: PhysicsWorld,
    readonly enabled = true,
    terrainY?: (x: number, z: number) => number,
  ) {
    this.traffic = new Traffic(roads, Math.random, TRAFFIC, terrainY);
    this.physics = new TrafficPhysicsSync(pw);
    this.layer = new TrafficLayer(scene);
  }

  get cars(): readonly TrafficCar[] {
    return this.traffic.cars;
  }

  /** 固定物理時間步更新車流與剛體 */
  stepPhysics(dt: number, playerPos: { x: number; y?: number; z: number }) {
    if (!this.enabled) return;
    const gone = this.traffic.update(dt, playerPos);
    this.physics.sync(this.traffic.cars, gone);
  }

  /** 渲染幀同步 InstancedMesh 矩陣 */
  syncRender() {
    this.layer.sync(this.traffic.cars);
  }

  /** 切換夜景車頭燈與尾燈 */
  setNight(on: boolean) {
    this.layer.setNight(on);
  }

  /** 判斷座標 (x, y, z) 旁是否有 AI 車輛(供撞車判定用;排除不同高架層級的車) */
  hasCarNear(x: number, z: number, edgeDist: number, y = 0): boolean {
    return this.traffic.cars.some((c) => Math.abs((c.y ?? 0) - y) < 3.5 && distToCar(c, x, z) < edgeDist);
  }
}
