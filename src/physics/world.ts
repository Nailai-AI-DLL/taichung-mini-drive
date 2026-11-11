// 物理世界:地面、地圖邊界牆;建築碰撞網格依分塊加入與移除。不依賴 DOM 與 three.js,可在 Node 測試中使用。
import type RAPIER_NS from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER_NS;

export const FIXED_DT = 1 / 60;

export interface PhysicsWorld {
  R: Rapier;
  world: RAPIER_NS.World;
}

export function createPhysicsWorld(R: Rapier, bounds?: [number, number, number, number]): PhysicsWorld {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;

  // 地面:頂面在 y = 0
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
  world.createCollider(R.ColliderDesc.cuboid(5000, 1, 5000).setFriction(1.0), ground);

  const b = bounds;
  if (b) {
    // 邊界牆(不可見),高 6 m、厚 2 m
    const [minX, minZ, maxX, maxZ] = b;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const hx = (maxX - minX) / 2;
    const hz = (maxZ - minZ) / 2;
    const walls: [number, number, number, number][] = [
      [cx, minZ - 1, hx + 2, 1],
      [cx, maxZ + 1, hx + 2, 1],
      [minX - 1, cz, 1, hz + 2],
      [maxX + 1, cz, 1, hz + 2],
    ];
    for (const [x, z, wx, wz] of walls) {
      const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, 3, z));
      world.createCollider(R.ColliderDesc.cuboid(wx, 3, wz).setFriction(0.2).setRestitution(0.3), body);
    }
  }

  return { R, world };
}

/** 加入一個靜態三角網格碰撞體(一格的建築);沒有三角形時回傳 null */
export function addStaticTrimesh(pw: PhysicsWorld, position: Float32Array, index: Uint32Array): RAPIER_NS.RigidBody | null {
  if (!index.length) return null;
  const body = pw.world.createRigidBody(pw.R.RigidBodyDesc.fixed());
  pw.world.createCollider(pw.R.ColliderDesc.trimesh(position, index).setFriction(0.3).setRestitution(0.2), body);
  return body;
}

export interface FurnitureCollision {
  /** 直立圓柱(樹幹、桿子),高 postH */
  posts: { x: number; z: number; r: number }[];
  postH: number;
  /** 長方體(一排機車):中心、半長(局部 x 軸 = 水平方向 a)、半寬、高 */
  boxes: { x: number; z: number; a: number; hx: number; hz: number; h: number }[];
}

/** 一格的街道傢俱碰撞:一個靜態剛體掛多個簡單碰撞形狀;沒有任何形狀時回傳 null */
export function addStaticFurniture(pw: PhysicsWorld, f: FurnitureCollision): RAPIER_NS.RigidBody | null {
  if (!f.posts.length && !f.boxes.length) return null;
  const body = pw.world.createRigidBody(pw.R.RigidBodyDesc.fixed());
  const make = (d: RAPIER_NS.ColliderDesc) => pw.world.createCollider(d.setFriction(0.3).setRestitution(0.3), body);
  for (const p of f.posts) make(pw.R.ColliderDesc.cylinder(f.postH / 2, p.r).setTranslation(p.x, f.postH / 2, p.z));
  // 繞 y 轉 θ 會把局部 x 軸轉到 (cos θ, 0, -sin θ);要轉到 (cos a, 0, sin a),所以 θ = -a
  for (const b of f.boxes)
    make(pw.R.ColliderDesc.cuboid(b.hx, b.h / 2, b.hz).setTranslation(b.x, b.h / 2, b.z).setRotation({ x: 0, y: Math.sin(-b.a / 2), z: 0, w: Math.cos(-b.a / 2) }));
  return body;
}

export function removeBody(pw: PhysicsWorld, body: RAPIER_NS.RigidBody | null) {
  if (body) pw.world.removeRigidBody(body);
}
