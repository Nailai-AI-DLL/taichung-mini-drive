// 世界高程與路面空間查詢層:集中管理地表高度(DTM 地形插值)、高架路面定位、接送點合法性與招牌 3D 座標。
// 不依賴 DOM 與 three.js,可在 Node 單元測試中使用。
import { QUANT, type WorldLandmark } from '../map/types';
import type { RoadIndex } from '../map/road-index';
import type { PlaceSignSpec } from '../render/place-signs';
import { chunkKey, type World } from './chunks';
import { pointInPolygon } from './gen/geom';

/** 地表高程取樣介面(平面模式回傳 0;地形模式由 DTM 網格雙線性插值) */
export interface ElevationSampler {
  sampleY(x: number, z: number): number;
  sampleNormal(x: number, z: number): [number, number, number];
}

export const FLAT_ELEVATION: ElevationSampler = {
  sampleY: () => 0,
  sampleNormal: () => [0, 1, 0],
};

export interface ElevationGridSpec {
  minX: number;
  minZ: number;
  /** 網格間距(公尺,例如 20 m DTM) */
  step: number;
  cols: number;
  rows: number;
  /** 列優先(row-major: row * cols + col)的高程陣列(公尺) */
  heights: ArrayLike<number>;
}

/** 規則網格高程取樣器(雙線性插值 + 中央差分法向量),供擴大範圍與 DTM 地形使用 */
export class GridElevationSampler implements ElevationSampler {
  constructor(readonly grid: ElevationGridSpec) {}

  sampleY(x: number, z: number): number {
    const { minX, minZ, step, cols, rows, heights } = this.grid;
    if (cols < 2 || rows < 2) return heights[0] ?? 0;
    const u = Math.max(0, Math.min(cols - 1 - 1e-6, (x - minX) / step));
    const v = Math.max(0, Math.min(rows - 1 - 1e-6, (z - minZ) / step));
    const c0 = Math.floor(u), r0 = Math.floor(v);
    const tx = u - c0, tz = v - r0;
    const h00 = heights[r0 * cols + c0] ?? 0;
    const h10 = heights[r0 * cols + (c0 + 1)] ?? h00;
    const h01 = heights[(r0 + 1) * cols + c0] ?? h00;
    const h11 = heights[(r0 + 1) * cols + (c0 + 1)] ?? h00;
    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }

  sampleNormal(x: number, z: number): [number, number, number] {
    const d = Math.max(1, this.grid.step * 0.5);
    const dx = (this.sampleY(x + d, z) - this.sampleY(x - d, z)) / (2 * d);
    const dz = (this.sampleY(x, z + d) - this.sampleY(x, z - d)) / (2 * d);
    const len = Math.hypot(dx, 1, dz);
    return [-dx / len, 1 / len, -dz / len];
  }
}

/** 下沉地標(如秋紅谷,decisions/0035)在地面挖洞的世界座標外框 */
export function sunkHolesOf(landmarks: WorldLandmark[] = []): [number, number][][] {
  return landmarks
    .filter((l) => l.sink)
    .flatMap((l) =>
      l.rings.map((r) => {
        const out: [number, number][] = [];
        for (let i = 0; i < r.length; i += 2) out.push([l.x + r[i] / QUANT, l.z + r[i + 1] / QUANT]);
        return out;
      }),
    );
}

/** 接送點能不能站人:在地圖內(離邊界 20 m)、不在任何道路的路面上、不在建築裡 */
export function isSpotValid(world: World, roadIndex: RoadIndex, x: number, z: number): boolean {
  const [bx0, bz0, bx1, bz1] = world.json.meta.bounds;
  if (x < bx0 + 20 || z < bz0 + 20 || x > bx1 - 20 || z > bz1 - 20) return false;
  if (roadIndex.near(x, z, 40).some((h) => h.distance < h.way.width / 2 + 0.3)) return false;
  const size = world.json.meta.chunkSize;
  // 建築依形心分格,大建築可能掛在隔壁格 → 往外多看 80 m
  for (let gx = Math.floor((x - 80) / size); gx <= Math.floor((x + 80) / size); gx++)
    for (let gz = Math.floor((z - 80) / size); gz <= Math.floor((z + 80) / size); gz++)
      for (const b of world.chunks.get(chunkKey(gx, gz))?.buildings ?? [])
        if (pointInPolygon([x, z], b.rings[0])) return false;
  return true;
}

/** 計算知名地點招牌的位置、朝向與高度(有建築立在樓頂靠接送點一側;無建築立在接送點旁面向行車方向) */
export function computePlaceSignSpecs(world: World, roadIndex: RoadIndex, elevation: ElevationSampler = FLAT_ELEVATION): PlaceSignSpec[] {
  const places = world.json.places ?? [];
  const specs: PlaceSignSpec[] = [];
  for (const pl of places) {
    if (pl.sign === 0) continue;
    const dx = pl.x - pl.px, dz = pl.z - pl.pz, dist = Math.hypot(dx, dz) || 1;
    let ring: [number, number][] | null = null;
    if (pl.b !== undefined) {
      for (const c of world.chunks.values()) ring ??= c.buildings.find((b) => b.id === pl.b)?.rings[0] ?? null;
      if (!ring && pl.ring) {
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < pl.ring.length; i += 2) pts.push([pl.ring[i] / QUANT, pl.ring[i + 1] / QUANT]);
        ring = pts;
      }
    }
    // 已做專屬造型的地點:外框從地標取(地標外框是相對於地標中心的座標)
    if (pl.landmark)
      for (const c of world.chunks.values())
        ring ??= c.landmarks.find((l) => l.id === pl.landmark)?.rings[0].map(([x, z]) => [x + pl.x, z + pl.z] as [number, number]) ?? null;
    if (ring && pl.h !== undefined) {
      let t = dist;
      for (let s = 0; s <= dist; s += 1)
        if (pointInPolygon([pl.px + (dx / dist) * s, pl.pz + (dz / dist) * s], ring)) {
          t = Math.min(dist, s + 4);
          break;
        }
      const sx = pl.px + (dx / dist) * t;
      const sz = pl.pz + (dz / dist) * t;
      const baseY = elevation.sampleY(sx, sz);
      specs.push({ name: pl.name, color: pl.color, x: sx, z: sz, facing: Math.atan2(-dz, -dx), roofY: pl.h, ...(baseY !== 0 && { baseY }) });
    } else {
      const hit = roadIndex.nearest(pl.px, pl.pz, 60);
      const ox = hit ? pl.px - hit.x : 0, oz = hit ? pl.pz - hit.z : 0, ol = Math.hypot(ox, oz) || 1;
      const sx = pl.px + (ox / ol) * 1.6;
      const sz = pl.pz + (oz / ol) * 1.6;
      const baseY = elevation.sampleY(sx, sz);
      specs.push({ name: pl.name, color: pl.color, x: sx, z: sz, facing: hit ? Math.atan2(hit.dirZ, hit.dirX) : 0, ...(baseY !== 0 && { baseY }) });
    }
  }
  return specs;
}

export interface RoadSnapPose {
  x: number;
  y: number;
  z: number;
  headingDeg: number;
  pitchDeg: number;
  onRoad: boolean;
}

/**
 * 計算「回到路面(R 鍵)」的 3D 位置與順向方位角。
 * 單行道依行車方向;雙向道路取與目前車頭較接近的方向。
 * 有提供 pos.y 時會優先吸附到同高程/同層級的道路(避免從高架橋掉到橋下平面道路)。
 */
export function snapToRoad(
  roadIndex: RoadIndex,
  spawn: { x: number; z: number; headingDeg: number },
  pos: { x: number; y?: number; z: number },
  heading: [number, number],
  elevation: ElevationSampler = FLAT_ELEVATION,
): RoadSnapPose {
  const hit = roadIndex.nearest(pos.x, pos.z, 400, pos.y);
  if (!hit) {
    return {
      x: spawn.x,
      y: elevation.sampleY(spawn.x, spawn.z),
      z: spawn.z,
      headingDeg: spawn.headingDeg,
      pitchDeg: 0,
      onRoad: false,
    };
  }
  const [hx, hz] = heading;
  const flip = !hit.way.oneway && hit.dirX * hx + hit.dirZ * hz < 0 ? -1 : 1;
  const dx = hit.dirX * flip;
  const dz = hit.dirZ * flip;
  const headingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const pitchDeg = (hit.pitch * flip * 180) / Math.PI;
  const y = elevation.sampleY(hit.x, hit.z) + hit.y;
  return { x: hit.x, y, z: hit.z, headingDeg, pitchDeg, onRoad: true };
}

/** 封裝世界地表、路面與空間查詢的統一入口 */
export class WorldSurface {
  constructor(
    readonly world: World,
    readonly roadIndex: RoadIndex,
    readonly elevation: ElevationSampler = FLAT_ELEVATION,
  ) {}

  terrainY(x: number, z: number): number {
    return this.elevation.sampleY(x, z);
  }

  terrainNormal(x: number, z: number): [number, number, number] {
    return this.elevation.sampleNormal(x, z);
  }

  sunkHoles(): [number, number][][] {
    return sunkHolesOf(this.world.json.landmarks);
  }

  isSpotValid(x: number, z: number): boolean {
    return isSpotValid(this.world, this.roadIndex, x, z);
  }

  placeSignSpecs(): PlaceSignSpec[] {
    return computePlaceSignSpecs(this.world, this.roadIndex, this.elevation);
  }

  snapToRoad(pos: { x: number; y?: number; z: number }, heading: [number, number]): RoadSnapPose {
    return snapToRoad(this.roadIndex, this.world.json.spawn, pos, heading, this.elevation);
  }
}
