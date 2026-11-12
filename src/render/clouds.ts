// 雲(decisions/0016 方向 A、0019 多樣化):低多邊形雲團散在整個區域上空,一個網格一個 draw call;不受霧影響。
// 五種(config/look.ts 的 CLOUD_KINDS):積雲、濃積雲、小碎雲、層雲、卷雲。每朵大小、扁平度、顏色(偏暖 / 偏冷)都隨機。
// 位置由種子決定,每次載入都一樣。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLOUD_COUNT, CLOUD_KINDS, LOOK_CLOUDS } from '../config/look';

type Kind = keyof typeof CLOUD_KINDS;

/** 一顆雲球:中心、半徑、三軸縮放 */
interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  sx: number;
  sy: number;
  sz: number;
}

/** 各種雲的雲球排法(座標相對雲中心、x 為長軸方向;size 是整朵的尺度) */
export function cloudPuffs(kind: Kind, size: number, rnd: () => number): Puff[] {
  const out: Puff[] = [];
  const add = (x: number, y: number, z: number, r: number, sx: number, sy: number, sz: number) => out.push({ x, y, z, r, sx, sy, sz });
  if (kind === 'cumulus' || kind === 'tower') {
    // 底層一排:中間大、兩端小
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      const r = size * (0.55 - Math.abs(t) * 0.5) * (0.8 + rnd() * 0.4);
      add(t * size * 1.6, rnd() * r * 0.3, (rnd() - 0.5) * r * 0.6, r, 1.2, 0.7, 0.9);
    }
    if (kind === 'tower') {
      // 往上疊兩層,越上越小、略偏一邊
      let y = size * 0.35;
      let r = size * 0.42;
      const lean = (rnd() - 0.5) * size * 0.3;
      for (let tier = 0; tier < 2; tier++) {
        const m = 3 - tier;
        for (let k = 0; k < m; k++) {
          const t = m === 1 ? 0 : k / (m - 1) - 0.5;
          add(t * r * 1.4 + lean * (tier + 1) * 0.5, y + rnd() * r * 0.2, (rnd() - 0.5) * r * 0.5, r * (0.85 + rnd() * 0.3), 1.0, 0.9, 0.9);
        }
        y += r * 0.75;
        r *= 0.72;
      }
    }
  } else if (kind === 'puff') {
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) add((k - (n - 1) / 2) * size * 0.9 + (rnd() - 0.5) * size * 0.3, rnd() * size * 0.2, (rnd() - 0.5) * size * 0.5, size * (0.45 + rnd() * 0.25), 1.15, 0.75, 1);
  } else if (kind === 'sheet') {
    // 兩排扁平大片,彼此錯開
    const n = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      add(t * size * 1.8, (rnd() - 0.5) * size * 0.06, (rnd() - 0.5) * size * 0.7, size * (0.3 + rnd() * 0.12), 1.5, 0.3, 1.1);
    }
  } else {
    // 卷雲:兩三條細長條,前後略錯開
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) add((rnd() - 0.5) * size * 0.4, k * size * 0.02, (k - (n - 1) / 2) * size * 0.14, size * (0.45 + rnd() * 0.15), 1.6, 0.1, 0.22);
  }
  return out;
}

/** 依權重抽一種 */
function pickKind(rnd: () => number): Kind {
  const kinds = Object.keys(CLOUD_KINDS) as Kind[];
  const total = kinds.reduce((s, k) => s + CLOUD_KINDS[k].weight, 0);
  let v = rnd() * total;
  for (const k of kinds) if ((v -= CLOUD_KINDS[k].weight) < 0) return k;
  return 'cumulus';
}

/**
 * 回傳一個群組,兩個網格(兩個 draw call):
 * - 蓬鬆的(積雲、濃積雲、碎雲):原本的光照,底部偏灰藍。
 * - 扁平的(層雲、卷雲):自發光強很多。扁平的雲從底下看幾乎都是朝下的面,只吃到半球光的地面色(米色),
 *   會變成一塊米色木板(2026-11-12 樣張)。
 */
export function createClouds(bounds: [number, number, number, number]): THREE.Group {
  const [minX, minZ, maxX, maxZ] = bounds;
  let seed = 20261111;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const parts: THREE.BufferGeometry[] = [];
  const flatParts: THREE.BufferGeometry[] = [];
  const white = new THREE.Color(LOOK_CLOUDS.color), shade = new THREE.Color(LOOK_CLOUDS.shade);
  const warm = new THREE.Color('#fff4e6'), cool = new THREE.Color('#eef5ff');
  const margin = 1200;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const kind = pickKind(rnd);
    const K = CLOUD_KINDS[kind];
    const cx = minX - margin + rnd() * (maxX - minX + 2 * margin);
    const cz = minZ - margin + rnd() * (maxZ - minZ + 2 * margin);
    const cy = K.y[0] + rnd() * (K.y[1] - K.y[0]);
    const size = K.size[0] + rnd() * (K.size[1] - K.size[0]);
    const rot = rnd() * Math.PI;
    // 每朵的頂色:白、偏暖或偏冷;底色深淺也不同
    const tint = rnd();
    const top = white.clone().lerp(tint < 0.33 ? warm : tint < 0.66 ? cool : white, 0.8);
    const bottom = shade.clone().lerp(new THREE.Color('#c9d8ea'), rnd() * 0.6);
    const flat = kind === 'sheet' || kind === 'streak';
    for (const p of cloudPuffs(kind, size, rnd)) {
      // 1 級細分的二十面體(低多邊形感)
      const g = new THREE.IcosahedronGeometry(p.r, 1).toNonIndexed();
      g.scale(p.sx, p.sy, p.sz);
      g.rotateY(rot);
      g.translate(cx + Math.cos(rot) * p.x + Math.sin(rot) * p.z, cy + p.y, cz - Math.sin(rot) * p.x + Math.cos(rot) * p.z);
      g.computeVertexNormals();
      // 底部偏灰藍、頂部白;扁平的雲幾乎全白
      const pos = g.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      const span = Math.max(1, p.r * p.sy);
      for (let v = 0; v < pos.count; v++) {
        const t = THREE.MathUtils.clamp((pos.getY(v) - (cy + p.y) + span * 0.3) / (span * 0.9), 0, 1);
        c.lerpColors(bottom, top, flat ? 0.6 + 0.4 * t : t);
        c.toArray(col, v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      (flat ? flatParts : parts).push(g);
    }
  }
  const group = new THREE.Group();
  group.name = 'clouds';
  const make = (list: THREE.BufferGeometry[], emissive: number, name: string) => {
    if (!list.length) return;
    const geo = mergeGeometries(list);
    for (const p of list) p.dispose();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: new THREE.Color('#ffffff'), emissiveIntensity: emissive });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  make(parts, 0.35, 'clouds-puffy');
  make(flatParts, 0.75, 'clouds-flat');
  return group;
}
