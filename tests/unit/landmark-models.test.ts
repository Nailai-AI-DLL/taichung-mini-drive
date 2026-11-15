// 地標 GLB 與 OSM 外框對位(decisions/0013):Blender 座標 (x, y, z) 輸出後變成 (x, z, -y),
// 若哪支腳本把南北弄反,模型會鏡像、和碰撞量體錯開。外框是旋轉過的矩形時包圍盒看不出鏡像,所以逐點比對外框頂點。
// 需要先建置:npm run map:build:range-a、npm run models:landmarks(還沒做的地標略過)
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadWorld } from '../helpers/load-map';
import { QUANT } from '../../src/map/types';
import { pointInPolygon } from '../../src/world/gen/geom';

const world = loadWorld('range-a');

async function loadMesh(file: string) {
  const buf = readFileSync(file);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const verts: THREE.Vector3[] = [];
  /** 三角形的邊,投影到地面 [x0, z0, x1, z1] */
  const edges: [number, number, number, number][] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    const base = verts.length;
    for (let i = 0; i < p.count; i++) verts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
    const idx = m.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const t = [0, 1, 2].map((k) => verts[base + (idx ? idx.getX(i + k) : i + k)]);
      for (let k = 0; k < 3; k++) edges.push([t[k].x, t[k].z, t[(k + 1) % 3].x, t[(k + 1) % 3].z]);
    }
  });
  return { verts, edges };
}

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/**
 * 外框每個頂點到模型輪廓(任何高度的邊，投影到地面)的最近距離，取最大值。
 * 用邊不用頂點：腳本可能把外框上的共線點簡化掉;不限高度：OSM 外框多半描的是屋頂輪廓，基座可以內縮(新站)
 */
function worstCornerGap(corners: [number, number][], edges: [number, number, number, number][]) {
  let worst = 0;
  for (const [x, z] of corners) {
    let best = Infinity;
    for (const e of edges) best = Math.min(best, segDist(x, z, ...e));
    worst = Math.max(worst, best);
  }
  return worst;
}

/** 點到外框邊的最近距離 */
function distToRings(x: number, z: number, rings: [number, number][][]) {
  let best = Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[(i + 1) % r.length];
      best = Math.min(best, segDist(x, z, ax, az, bx, bz));
    }
  return best;
}

/**
 * 朝向：外框是矩形時，模型轉 180° 仍對得上外框，所以另外檢查「只在一側的特徵」。
 * 用材質顏色(sRGB)找出特徵的頂點，取形心;它在指定方位(從北順時針)上的投影要 > 3 m。
 * 依據:docs/art/landmarks-reference.md §1.6、§2、§10、§11
 */
type SideFeature = { what: string; color: string; bearing: number };
const SIDE_FEATURES: Record<string, SideFeature | SideFeature[]> = {
  opera: { what: '舞台塔偏向西北(背面)', color: '7a7e82', bearing: 302 },
  'station-new': { what: '樹枝狀柱在大廳側(北北西)', color: 'eef0f0', bearing: 336 },
  'station-old': { what: '鐘塔帽頂在 1917 本體(西段)', color: '565c63', bearing: 247 },
  'city-hall': { what: '深色方框在正面(北北東)', color: '4e5257', bearing: 31 },
  council: { what: '方洞空中花園偏西北', color: 'a9c29a', bearing: 302 },
  // 百貨(decisions/0032;依據 docs/art/dept-stores-reference.md:兩棟正面都朝東北的臺灣大道)
  'shin-kong': { what: '圓筒頂的光環在正面(東北)', color: 'c6ccd1', bearing: 32 },
  'top-city': { what: '淡綠條紋玻璃在正面(東北)', color: 'a9cfc2', bearing: 32 },
  'tiger-city': { what: '藍色招牌在靠河南路的轉角(東)', color: '2d7fc4', bearing: 90 },
  // 飯店(decisions/0034;依據 docs/art/hotels-reference.md)
  'the-lin': { what: '銅色玻璃塔在凹弧那側(西北西,朝富路)', color: '9c5a4a', bearing: 302 },
  'millennium': { what: '藍玻璃帶在正面(北北東,市政路)', color: '3e6f8e', bearing: 30 },
  // 第四批(decisions/0035;依據 docs/art/places4-reference.md)
  mcdonalds: [
    { what: '木紋挑簷在正面(東,文心路)', color: 'c9a27a', bearing: 90 },
    // 外框是南北對稱的正矩形,東邊的特徵抓不到南北鏡像,另外檢查南牆的雨遮(驗收抓到)
    { what: '取餐窗雨遮在南牆', color: 'b8321f', bearing: 180 },
  ],
  ikea: { what: '黃色塊在東南角', color: 'ffdb00', bearing: 135 },
  fulfillment: { what: '後台建物在根部(東北),開口朝西南', color: 'd9dbd8', bearing: 45 },
  'maple-garden': { what: '橘紅折線橋在湖的西南西段', color: 'e0502a', bearing: 250 },
};

async function featureCentroid(file: string, color: string) {
  const buf = readFileSync(file);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const c = new THREE.Vector3();
  let n = 0;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.MeshStandardMaterial).color.getHexString(THREE.SRGBColorSpace) !== color) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      c.add(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
      n++;
    }
  });
  return n ? c.divideScalar(n) : null;
}

describe('地標模型朝向(轉 180° 也要抓得到)', () => {
  for (const l of world.json.landmarks) {
    const file = join(__dirname, '../../public', l.model);
    const fs = SIDE_FEATURES[l.id];
    for (const f of fs ? [fs].flat() : [undefined])
      it.skipIf(!existsSync(file) || !f)(`${l.id}:${f?.what}`, async () => {
        const c = await featureCentroid(file, f!.color);
        expect(c, `找不到顏色 #${f!.color} 的材質`).not.toBeNull();
        const b = (f!.bearing * Math.PI) / 180;
        // 遊戲座標:東 = +x、北 = -z
        const along = c!.x * Math.sin(b) - c!.z * Math.cos(b);
        expect(along).toBeGreaterThan(3);
      });
  }
});

// 對位：外框頂點與模型輪廓逐點比對(朝向另見上方的特徵檢查)
describe('地標模型與外框對位', () => {
  for (const l of world.json.landmarks) {
    const file = join(__dirname, '../../public', l.model);
    it.skipIf(!existsSync(file))(`${l.id}:底面貼齊外框、沒有鏡像、高度正確`, async () => {
      const { verts, edges } = await loadMesh(file);
      const corners: [number, number][] = [];
      for (const r of l.rings) for (let i = 0; i < r.length; i += 2) corners.push([r[i] / QUANT, r[i + 1] / QUANT]);
      // 外框角落有 2 m 倒角、外框簡化容差 2.5 m,容許 3 m
      expect(worstCornerGap(corners, edges)).toBeLessThan(3);
      // 鏡像(南北顛倒)的外框要對不上,確認這個檢查真的分得出方向。
      // 外框本身南北對稱(麥當勞、IKEA 這種正矩形)時鏡像分不出來,改由上方的單側特徵檢查朝向
      const ringEdges: [number, number, number, number][] = [];
      for (const r of l.rings)
        for (let i = 0; i < r.length; i += 2) {
          const j = (i + 2) % r.length;
          ringEdges.push([r[i] / QUANT, r[i + 1] / QUANT, r[j] / QUANT, r[j + 1] / QUANT]);
        }
      const symmetric = worstCornerGap(corners.map(([x, z]) => [x, -z]), ringEdges) < 10;
      // 對稱時至少要有一個偏南或偏北的特徵(|cos 方位| > 0.5),南北鏡像才會被抓到
      if (symmetric)
        expect([SIDE_FEATURES[l.id] ?? []].flat().some((f) => Math.abs(Math.cos((f.bearing * Math.PI) / 180)) > 0.5), `${l.id} 外框南北對稱,需要偏南 / 偏北的單側特徵`).toBe(true);
      else expect(worstCornerGap(corners.map(([x, z]) => [x, -z]), edges)).toBeGreaterThan(10);
      // 反向：模型不能超出外框太多(白框凸出 0.5 m、倒角容許到 3 m)
      const rings = l.rings.map((r) => {
        const out: [number, number][] = [];
        for (let i = 0; i < r.length; i += 2) out.push([r[i] / QUANT, r[i + 1] / QUANT]);
        return out;
      });
      let outside = 0;
      for (const v of verts) if (!rings.some((r) => pointInPolygon([v.x, v.z], r))) outside = Math.max(outside, distToRings(v.x, v.z, rings));
      expect(outside).toBeLessThan(3);
      const ys = verts.map((v) => v.y);
      // 下沉地標(秋紅谷,decisions/0035):碗底 = -sink;其餘地標不能沉到地面下
      if (l.sink) expect(Math.min(...ys)).toBeCloseTo(-l.sink, 0);
      else expect(Math.min(...ys)).toBeGreaterThan(-0.5);
      expect(Math.max(...ys)).toBeCloseTo(l.h / 10, 0);
    });
  }
});
