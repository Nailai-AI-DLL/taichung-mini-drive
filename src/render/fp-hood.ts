// 第一人稱的簡單引擎蓋(Cooper 2026-11-12:「第一人稱幫我加一個簡單的引擎蓋」,decisions/0018)。
// AI 模型只有外殼、從車內看很亂,所以第一人稱時整台車藏起來(0017),改放這個程式生成的引擎蓋:
// 黑色車身色、兩條米白賽車條紋(和車子一樣),前緣圓弧往下彎,卡通三階明暗。
// 座標:車體中心為原點、車頭 +X、上 +Y、右 +Z(和 CarMesh 的 group 一樣),掛在 group 外面、由 main.ts 每幀擺到車子姿態。
import * as THREE from 'three';
import { toonMaterial } from './car-style';

/** 尺寸(公尺,車體中心座標) */
export const HOOD = {
  /** 後緣(擋風玻璃底)與前緣的 x */
  x0: 0.55,
  x1: 1.6,
  /** 後緣高度、前緣高度(車體中心離地 0.8 m) */
  y0: 0.12,
  y1: -0.02,
  /** 後緣、前緣半寬 */
  w0: 0.72,
  w1: 0.6,
  /** 前緣圓弧往前凸多少 */
  nose: 0.12,
  /** 條紋半寬、兩條中心離中線多遠 */
  stripeW: 0.07,
  stripeOff: 0.16,
  body: '#15171c',
  stripe: '#efe6d2',
  /** 儀表板:從眼睛下方延伸到引擎蓋後緣的平面(不然中間是空的,看得到路面),顏色比車身淺一點 */
  dashX0: -0.4,
  dashW: 1.5,
  dashColor: '#262a33',
};

/** 引擎蓋上表面一點:u 0 = 後緣、1 = 前緣;v −1 = 左緣、1 = 右緣 */
function hoodPoint(u: number, v: number, lift = 0): THREE.Vector3 {
  const h = HOOD;
  const w = h.w0 + (h.w1 - h.w0) * u;
  // 前緣中間往前凸(圓弧)、兩側往下彎(拱起的引擎蓋)
  const x = h.x0 + (h.x1 - h.x0) * u + h.nose * u * u * (1 - v * v);
  const y = h.y0 + (h.y1 - h.y0) * u * u - 0.06 * v * v + lift;
  return new THREE.Vector3(x, y, v * w);
}

/** 曲面網格:u 方向 nu 段、v 在 [v0, v1] 間 nv 段 */
function patch(v0: number, v1: number, lift: number, nu = 10, nv = 8) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = hoodPoint(i / nu, v0 + ((v1 - v0) * j) / nv, lift);
      pos.push(p.x, p.y, p.z);
    }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      // 面朝上(+Y)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createFpHood(): THREE.Group {
  const h = HOOD;
  const group = new THREE.Group();
  group.name = 'fp-hood';
  const body = new THREE.Mesh(patch(-1, 1, 0, 12, 16), toonMaterial(h.body));
  group.add(body);
  const sw = h.stripeW / h.w0;
  const so = h.stripeOff / h.w0;
  const stripeMat = toonMaterial(h.stripe);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(patch(s * so - sw, s * so + sw, 0.004, 12, 2), stripeMat);
    group.add(m);
  }
  // 儀表板:引擎蓋後緣到眼睛下方的平面,稍微高一點點蓋住引擎蓋後緣的接縫
  const dashGeo = new THREE.PlaneGeometry(h.x0 - h.dashX0 + 0.04, h.dashW * 2);
  dashGeo.rotateX(-Math.PI / 2);
  const dash = new THREE.Mesh(dashGeo, toonMaterial(h.dashColor));
  dash.position.set((h.x0 + h.dashX0) / 2 + 0.02, h.y0 + 0.01, 0);
  group.add(dash);
  group.visible = false;
  return group;
}
