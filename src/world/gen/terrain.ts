// 3D DTM 地形網格生成與平順貼地輔助工具(不依賴 DOM 與 three.js,可在 Node 測試中使用)。
import { PALETTE, hexToRgb } from '../../config/palette';
import type { ElevationSampler } from '../surface';
import { pointInPolygon, type Pt, type Rect } from './geom';
import { MeshBuilder } from './mesh';
import type { MeshArrays } from '../../map/types';

/** 單一 250 m 分塊地形網格細分格數(每格 250 / 10 = 25 m,與 40 m DTM 高度貼合且頂點數極少:121 點 / 200 三角形) */
export const TERRAIN_CHUNK_DIVS = 10;

/**
 * 為一個 250 m 分塊生成 3D 地表網格(作為視覺地面 + Rapier 物理碰撞面)。
 * 若分塊內有下沉地標外框(sunkHoles,如秋紅谷),外框內部的三角形會自動挖空,讓下沉模型露出來。
 */
export function buildChunkTerrain(
  rect: Rect,
  elevation: ElevationSampler,
  sunkHoles: readonly Pt[][] = [],
  divs = TERRAIN_CHUNK_DIVS,
): MeshArrays {
  const mb = new MeshBuilder();
  const rgb = hexToRgb(PALETTE.ground);
  const { minX, minZ, maxX, maxZ } = rect;
  const dx = (maxX - minX) / divs;
  const dz = (maxZ - minZ) / divs;

  // 先過濾可能與這個分塊重疊的下沉地標外框
  const holes = sunkHoles.filter((ring) =>
    ring.some(([hx, hz]) => hx >= minX - 200 && hx <= maxX + 200 && hz >= minZ - 200 && hz <= maxZ + 200),
  );

  const verts: number[] = new Array((divs + 1) * (divs + 1));
  for (let r = 0; r <= divs; r++) {
    const z = minZ + r * dz;
    for (let c = 0; c <= divs; c++) {
      const x = minX + c * dx;
      const y = elevation.sampleY(x, z);
      const [nx, ny, nz] = elevation.sampleNormal(x, z);
      verts[r * (divs + 1) + c] = mb.vertex(x, y, z, nx, ny, nz, rgb);
    }
  }

  for (let r = 0; r < divs; r++) {
    for (let c = 0; c < divs; c++) {
      const cx = minX + (c + 0.5) * dx;
      const cz = minZ + (r + 0.5) * dz;
      if (holes.length && holes.some((h) => pointInPolygon([cx, cz], h))) continue;

      const i00 = verts[r * (divs + 1) + c];
      const i10 = verts[r * (divs + 1) + c + 1];
      const i01 = verts[(r + 1) * (divs + 1) + c];
      const i11 = verts[(r + 1) * (divs + 1) + c + 1];

      // 確保法向量朝上(+Y)
      if (mb.isUpward(i00, i01, i10)) {
        mb.tri(i00, i01, i10);
        mb.tri(i10, i01, i11);
      } else {
        mb.tri(i00, i10, i01);
        mb.tri(i10, i11, i01);
      }
    }
  }

  return mb.toArrays();
}

/**
 * 將一個 2D 折線依 maxStep(預設 25 m)做共線細分,讓貼地道路與標線能平順貼合 3D 地形起伏而不穿地。
 */
export function subdivideLine2D(line: Pt[], maxStep = 25): Pt[] {
  if (line.length < 2) return line;
  const out: Pt[] = [line[0]];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / maxStep));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * 將已生成於基準 y = 0 平面的網格(如平面道路、標線、高架橋、街道傢俱)所有頂點沿 Y 軸抬升至對應地表高程 elevation.sampleY(x, z)。
 * recordLayer = true 時會先將貼地前的原始層高(例如 0.01–0.045)存到 m.layer,供地面材質做與海拔無關的深度偏移。
 */
export function drapeMeshArrays(m: MeshArrays, elevation: ElevationSampler, recordLayer = false): void {
  const pos = m.position;
  const layer = recordLayer ? new Float32Array(pos.length / 3) : null;
  for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
    if (layer) layer[v] = pos[i + 1];
    pos[i + 1] += elevation.sampleY(pos[i], pos[i + 2]);
  }
  if (layer) m.layer = layer;
}

/**
 * 取單棟建築外框頂點與形心的地表高程範圍 [minY, maxY]。
 * 以 maxY 作為建築一樓基準面,並將裙腳往下延伸到 minY - 2.5 m,確保高坡側不被地形埋沒、低坡側不懸空。
 */
export function buildingElevationRange(ring: readonly Pt[], elevation: ElevationSampler, ctr: Pt): { minY: number; maxY: number } {
  let minY = elevation.sampleY(ctr[0], ctr[1]);
  let maxY = minY;
  for (const p of ring) {
    const y = elevation.sampleY(p[0], p[1]);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minY, maxY };
}

/**
 * 將已生成於基準 y = 0 的剛體物件(例如單棟建築、地標量體、屋頂附加物)整體沿 Y 軸平移固定高度 dy。
 */
export function shiftMeshRangeY(pos: number[], startVertex: number, endVertex: number, dy: number): void {
  if (dy === 0) return;
  for (let i = startVertex * 3 + 1; i < endVertex * 3; i += 3) {
    pos[i] += dy;
  }
}

/**
 * 將單棟建築的外牆底部頂點(y ≈ 0)向下延伸 skirtDepth 公尺,避免在斜坡地形上出現底座懸空縫隙。
 */
export function extendBuildingSkirt(pos: number[], startVertex: number, endVertex: number, baseY: number, skirtDepth = 3.0): void {
  for (let i = startVertex * 3 + 1; i < endVertex * 3; i += 3) {
    if (pos[i] <= 0.01) {
      pos[i] = baseY - skirtDepth;
    } else {
      pos[i] += baseY;
    }
  }
}
