// MINI F55 程式生成(decisions/0016 §12,路線 E):黑車身白車頂(60 週年)+ 參考圖二的 Q 版亮面低多邊形畫風。
// 外型依據 docs/art/mini-f55-reference.md(Cooper 實車:Cooper 非 S,橫條水箱罩、無引擎蓋進氣口、黑色引擎蓋條紋配細銀線)。
// 座標和物理車體一致:原點 = 物理車體中心,+x 車頭,+y 上,z 左右;地面在 y = GROUND_Y。
// 所有尺寸、顏色在 MINI_SPEC,屬品味項,樣張給 Cooper 看後再調。
import * as THREE from 'three';
import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const MINI_SPEC = {
  /** 地面高度(物理車體中心往下):懸吊靜止時輪心 -0.47、輪半徑 0.33 */
  groundY: -0.8,
  /** 車身:前後端、半寬、底、腰線(車窗下緣)高度 */
  body: { x0: -1.76, x1: 1.72, halfW: 0.9, bottom: -0.58, belt: 0.12, hoodDrop: 0.13 },
  /** 車窗帶:前後端、擋風玻璃斜面長度、頂高、上緣內縮 */
  cabin: { x0: -1.56, x1: 0.42, screen: 0.5, top: 0.6, topHalfW: 0.74, botHalfW: 0.84 },
  /** 白色車頂:前後端、厚度(前端對齊擋風玻璃斜面頂端,才不會像浮在上面的盤子) */
  roof: { x0: -1.6, x1: -0.06, thick: 0.13, halfW: 0.76 },
  wheel: { r: 0.33, width: 0.24, rimR: 0.21 },
  color: {
    body: '#1c1f25',
    roof: '#ece8dd',
    glass: '#17202c',
    trim: '#16171a',
    stripe: '#0d0e10',
    stripeLine: '#c9ced4',
    chrome: '#d9dde2',
    headLens: '#fffbea',
    drl: '#ffffff',
    tail: '#e2312a',
    tailCross: '#ffd2c4',
    tire: '#1a1b1e',
    rim: '#40434a',
    spoke: '#a7acb3',
    fog: '#fff6d8',
  },
};

const S = MINI_SPEC;
const RING = 36;

/** 超橢圓的點(n 越大越方) */
function superEllipse(t: number, n: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/** 車身在 x 處的截面:中心高、半高、半寬、端部縮放 */
function bodySection(x: number) {
  const b = S.body;
  const smooth = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  // 引擎蓋往車頭下斜;車尾略收
  const top = b.belt - b.hoodDrop * smooth(0.5, b.x1, x) - 0.05 * smooth(-1.55, b.x0, x);
  // 前後端圓角:越靠近端點,截面往中心縮(車頭比車尾圓)
  const u = Math.min(1, x >= 0 ? x / b.x1 : x / b.x0);
  const p = x >= 0 ? 5 : 8;
  const end = Math.max(0.02, (1 - Math.abs(u) ** p) ** (1 / p));
  const yc = (top + b.bottom) / 2, hh = (top - b.bottom) / 2;
  return { yc, hh: hh * (0.55 + 0.45 * end), w: b.halfW * (0.6 + 0.4 * end), top: yc + hh * (0.55 + 0.45 * end) };
}

/** 車身頂面在 (x, z) 的高度(引擎蓋條紋貼在上面用) */
function bodyTop(x: number, z: number, n = 4) {
  const s = bodySection(x);
  const k = Math.min(1, Math.abs(z) / s.w);
  return s.yc + s.hh * (1 - k ** n) ** (1 / n);
}

function loftX(xs: number[], ring: (x: number) => THREE.Vector3[], caps = true) {
  // LoftGeometry:截面從車尾往車頭排,每圈逆時針(從車頭往回看)時法向量朝外
  // 截面點的順序反過來,法向量才朝外(實測:照原順序整個車身被背面剔除,看得到裡面)
  return new LoftGeometry(xs.map((x) => ring(x).reverse()), { capStart: caps, capEnd: caps });
}

function range(a: number, b: number, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** 加上 box 狀零件 */
function box(g: THREE.Group, m: THREE.Material, size: [number, number, number], pos: [number, number, number], rot?: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  g.add(mesh);
  return mesh;
}

export interface MiniCar {
  body: THREE.Group;
  /** 每個輪子一份(輪軸沿 z,繞 z 轉) */
  makeWheel: () => THREE.Object3D;
}

export function createMiniCar(renderer: THREE.WebGLRenderer): MiniCar {
  // 環境反射(亮面):只給車子用,場景其他材質不受影響
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const C = S.color;
  const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: env, envMapIntensity: 1, ...extra });
  const M = {
    body: std(C.body, 0.22, 0.35),
    roof: std(C.roof, 0.35, 0.05, { envMapIntensity: 0.6 }),
    glass: std(C.glass, 0.06, 0.4),
    trim: std(C.trim, 0.65, 0),
    stripe: std(C.stripe, 0.4, 0.2),
    stripeLine: std(C.stripeLine, 0.2, 0.8),
    chrome: std(C.chrome, 0.12, 1),
    headLens: Object.assign(std(C.headLens, 0.1, 0, { emissive: new THREE.Color(C.headLens), emissiveIntensity: 0.35 }), { userData: { headLens: 0.35 } }),
    drl: std(C.drl, 0.2, 0, { emissive: new THREE.Color(C.drl), emissiveIntensity: 0.8 }),
    tail: std(C.tail, 0.25, 0, { emissive: new THREE.Color(C.tail), emissiveIntensity: 0.55 }),
    tailCross: std(C.tailCross, 0.3, 0, { emissive: new THREE.Color(C.tailCross), emissiveIntensity: 0.4 }),
    fog: std(C.fog, 0.2, 0, { emissive: new THREE.Color(C.fog), emissiveIntensity: 0.3 }),
    tire: std(C.tire, 0.85, 0),
    rim: std(C.rim, 0.35, 0.6),
    spoke: std(C.spoke, 0.25, 0.8),
  };
  const g = new THREE.Group();
  g.name = 'mini-f55';

  // ---- 車身:超橢圓截面沿 x 放樣 ----
  const b = S.body;
  const bodyRing = (x: number) => {
    const s = bodySection(x);
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < RING; j++) {
      const [cz, cy] = superEllipse((j / RING) * Math.PI * 2, 4);
      pts.push(new THREE.Vector3(x, s.yc + cy * s.hh, cz * s.w));
    }
    return pts;
  };
  const bodyXs = [...range(b.x0, b.x0 + 0.3, 6).slice(0, -1), ...range(b.x0 + 0.3, b.x1 - 0.4, 14).slice(0, -1), ...range(b.x1 - 0.4, b.x1, 8)];
  g.add(new THREE.Mesh(loftX(bodyXs, bodyRing), M.body));

  // ---- 車窗帶(深色玻璃,A/B/C 柱也是黑的,MINI 的懸浮車頂)----
  const c = S.cabin;
  const cabinRing = (x: number) => {
    // 擋風玻璃:前段頂高往前降到 screenTop;後窗略收
    const front = Math.min(1, Math.max(0, (x - (c.x1 - c.screen)) / c.screen));
    const top = c.top - (c.top - (b.belt + 0.02)) * front - 0.05 * Math.min(1, Math.max(0, (c.x0 + 0.18 - x) / 0.18));
    const bot = b.belt - 0.04;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < RING; j++) {
      const [cz, cy] = superEllipse((j / RING) * Math.PI * 2, 6);
      const y = bot + ((cy + 1) / 2) * (top - bot);
      const k = (cy + 1) / 2;
      const w = c.botHalfW + (c.topHalfW - c.botHalfW) * k;
      pts.push(new THREE.Vector3(x, y, cz * w));
    }
    return pts;
  };
  g.add(new THREE.Mesh(loftX(range(c.x0, c.x1, 16), cabinRing), M.glass));

  // ---- 白色車頂(略寬於車窗帶,前後圓角)+ 車頂尾翼 ----
  const r = S.roof;
  const roofRing = (x: number) => {
    // 夾在 ±1 內:浮點誤差讓端點的 |u| 略大於 1 時,(1 - |u|^6)^(1/6) 會是 NaN(e2e 2026-11-11 抓到)
    const u = Math.max(-1, Math.min(1, (x - (r.x0 + r.x1) / 2) / ((r.x1 - r.x0) / 2)));
    const end = Math.max(0.05, (1 - Math.abs(u) ** 6) ** (1 / 6));
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < RING; j++) {
      const [cz, cy] = superEllipse((j / RING) * Math.PI * 2, 5);
      pts.push(new THREE.Vector3(x, c.top - 0.06 + ((cy + 1) / 2) * r.thick * (0.6 + 0.4 * end) + 0.02 * (1 - u * u), cz * r.halfW * (0.75 + 0.25 * end)));
    }
    return pts;
  };
  g.add(new THREE.Mesh(loftX(range(r.x0, r.x1, 14), roofRing), M.roof));
  box(g, M.roof, [0.14, 0.05, 1.2], [r.x0 + 0.02, c.top + 0.03, 0], [0, 0, -0.3]);

  // ---- 引擎蓋雙條紋(黑)+ 兩側細銀線,貼在車身頂面 ----
  const strip = (zc: number, half: number, mat: THREE.Material, lift: number) => {
    const xs = range(c.x1 - 0.02, b.x1 - 0.12, 18);
    const pos: number[] = [];
    const idx: number[] = [];
    xs.forEach((x, i) => {
      for (const zz of [zc - half, zc + half]) pos.push(x, bodyTop(x, zz) + lift, zz);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  };
  for (const side of [-1, 1]) {
    strip(side * 0.17, 0.075, M.stripe, 0.004);
    for (const e of [-1, 1]) strip(side * 0.17 + e * 0.085, 0.008, M.stripeLine, 0.006);
  }

  // ---- 黑色輪拱(半圈)與側裙 ----
  const front = 1.28, rear = -1.28, wheelCy = S.groundY + S.wheel.r;
  for (const x of [front, rear])
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(S.wheel.r + 0.1, 0.065, 8, 20, Math.PI), M.trim);
      arch.position.set(x, wheelCy, side * (b.halfW - 0.02));
      arch.scale.set(1, 1, 1.6);
      g.add(arch);
    }
  for (const side of [-1, 1]) box(g, M.trim, [front - rear - 0.86, 0.1, 0.06], [0, b.bottom + 0.05, side * (b.halfW - 0.03)]);
  // 前後下保險桿(黑)
  box(g, M.trim, [0.16, 0.14, 1.5], [b.x1 - 0.1, b.bottom + 0.06, 0]);
  box(g, M.trim, [0.18, 0.18, 1.55], [b.x0 + 0.08, b.bottom + 0.08, 0]);

  // ---- 車門分割線(五門:前後各兩扇)----
  for (const side of [-1, 1])
    for (const x of [0.32, -0.5, -1.25]) box(g, M.trim, [0.014, 0.5, 0.01], [x, -0.22, side * (b.halfW + 0.002)]);

  // ---- 大圓頭燈(放大):燈筒 + 鍍鉻框 + 白色日行燈環 + 燈心 ----
  const headX = b.x1 - 0.14;
  for (const side of [-1, 1]) {
    const hz = side * 0.52, hy = -0.13;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.24, 24).rotateZ(Math.PI / 2), M.body);
    pod.position.set(headX, hy, hz);
    g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 8, 28).rotateY(Math.PI / 2), M.chrome);
    ring.position.set(headX + 0.12, hy, hz);
    g.add(ring);
    const drl = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 28).rotateY(Math.PI / 2), M.drl);
    drl.position.set(headX + 0.125, hy, hz);
    g.add(drl);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24).rotateY(Math.PI / 2), M.headLens);
    lens.position.set(headX + 0.121, hy, hz);
    g.add(lens);
    // 霧燈
    const fog = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16).rotateY(Math.PI / 2), M.fog);
    fog.position.set(b.x1 - 0.015, b.bottom + 0.1, side * 0.62);
    g.add(fog);
  }

  // ---- 水箱罩:六角鍍鉻框 + 黑色內部 + 兩條橫向鍍鉻飾條(Cooper 非 S)----
  const hex = (w: number, h: number) => {
    const s = new THREE.Shape();
    const pts: [number, number][] = [[-w, h * 0.55], [w, h * 0.55], [w * 1.08, 0], [w * 0.9, -h], [-w * 0.9, -h], [-w * 1.08, 0]];
    s.moveTo(...pts[0]);
    for (const p of pts.slice(1)) s.lineTo(...p);
    s.closePath();
    return s;
  };
  const grilleX = b.x1 - 0.06;
  const outer = new THREE.Mesh(new THREE.ExtrudeGeometry(hex(0.36, 0.2), { depth: 0.06, bevelEnabled: false }).rotateY(Math.PI / 2), M.chrome);
  outer.position.set(grilleX, -0.33, 0);
  g.add(outer);
  const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(hex(0.31, 0.16), { depth: 0.06, bevelEnabled: false }).rotateY(Math.PI / 2), M.trim);
  inner.position.set(grilleX + 0.012, -0.335, 0);
  g.add(inner);
  for (const y of [-0.3, -0.4]) box(g, M.chrome, [0.03, 0.025, 0.52], [grilleX + 0.07, y, 0]);

  // ---- 英國旗尾燈:直立圓角長方形紅燈 + 淡色十字 ----
  for (const side of [-1, 1]) {
    const tz = side * 0.6, ty = -0.07, tx = b.x0 + 0.1;
    box(g, M.chrome, [0.06, 0.34, 0.24], [tx, ty, tz]);
    box(g, M.tail, [0.06, 0.3, 0.2], [tx - 0.012, ty, tz]);
    box(g, M.tailCross, [0.065, 0.3, 0.035], [tx - 0.014, ty, tz]);
    box(g, M.tailCross, [0.065, 0.035, 0.2], [tx - 0.014, ty, tz]);
  }
  // 排氣管(單出、靠左,推論;mini-f55-reference.md §5)
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12).rotateZ(Math.PI / 2), M.chrome);
  pipe.position.set(b.x0 - 0.01, b.bottom + 0.04, -0.45);
  g.add(pipe);

  // ---- 白色後視鏡 ----
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.08, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.9, 1.1), M.roof);
    m.position.set(c.x1 - 0.22, b.belt + 0.1, side * (b.halfW + 0.1));
    g.add(m);
    box(g, M.trim, [0.08, 0.04, 0.12], [c.x1 - 0.22, b.belt + 0.06, side * (b.halfW + 0.02)]);
  }
  // 腰線鍍鉻細條(車窗下緣)
  for (const side of [-1, 1]) box(g, M.chrome, [c.x1 - c.x0 - 0.3, 0.018, 0.01], [(c.x0 + c.x1) / 2 - 0.1, b.belt - 0.03, side * (b.halfW - 0.04)]);

  const body = mergeByMaterial(g);

  // ---- 輪子:輪胎 + 深灰輪圈 + 5 組淺色輻條(雙輻條簡化成粗輻條)----
  const W = S.wheel;
  const tireGeo = new THREE.CylinderGeometry(W.r, W.r, W.width, 24).rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(W.rimR, W.rimR, W.width + 0.01, 20).rotateX(Math.PI / 2);
  const makeWheel = () => {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tireGeo, M.tire), new THREE.Mesh(rimGeo, M.rim));
    for (const sz of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, W.rimR * 0.95, 0.02), M.spoke);
        sp.position.set(Math.sin(a) * W.rimR * 0.48, Math.cos(a) * W.rimR * 0.48, sz * (W.width / 2 + 0.008));
        sp.rotation.z = -a;
        w.add(sp);
      }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W.width + 0.03, 12).rotateX(Math.PI / 2), M.chrome);
    w.add(hub);
    return mergeByMaterial(w);
  };
  return { body, makeWheel };
}

/**
 * 同材質的零件合併成一個網格:車子由上百個小零件組成,一個零件一個 draw call(加上陰影再一次)會超過 300 的上限
 * (e2e 2026-11-11:313)。合併後車身約 15 個、每個輪子 4 個網格。
 */
function mergeByMaterial(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    // 合併要求屬性一致:只留位置與法向量
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    const mat = m.material as THREE.Material;
    byMat.set(mat, [...(byMat.get(mat) ?? []), geo]);
  });
  const out = new THREE.Group();
  out.name = g.name;
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = true;
    out.add(mesh);
    for (const x of geos) x.dispose();
  }
  return out;
}
