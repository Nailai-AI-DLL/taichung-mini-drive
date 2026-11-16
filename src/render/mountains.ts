// 遠景山脈(decisions/0019,Cooper 2026-11-12:「山脈的話有可能依照實際位置呈現嗎?」)。
// 資料:public/map/<區域>/skyline.json(tools/map-build/skyline.py 從內政部 20 m DTM 算出:站在地圖中心,
// 每 0.5° 方位上近 3–12 km、中 12–30 km、遠 30 km 以上三個距離帶裡,山頂的最大仰角)。
// 畫法:三圈直立的環,跟著鏡頭水平移動(像天空一樣永遠在遠方),高度 = 半徑 × tan(仰角 × 放大倍數)。
// 低多邊形:每 1° 一段、中間加一排抖動的頂點,平面著色出稜面;不受霧影響,顏色自己往天空色混(空氣透視)。
import * as THREE from 'three';
import { LOOK_LIGHT, LOOK_MOUNTAINS } from '../config/look';

export interface Skyline {
  azStep: number;
  bands: { minDist: number; maxDist: number; angle: (number | null)[] }[];
}

/** 每 binsPer 個 0.5° 合成一段(取最大),沒資料的方位當成地平線下 */
export function bandProfile(angle: (number | null)[], binsPer: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < angle.length; i += binsPer) {
    let m = -Infinity;
    for (let j = 0; j < binsPer; j++) {
      const a = angle[(i + j) % angle.length];
      if (a !== null && a !== undefined && a > m) m = a;
    }
    out.push(Number.isFinite(m) ? m : -1);
  }
  return out;
}

export function createMountains(sky: Skyline): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mountains';
  const horizon = new THREE.Color(LOOK_LIGHT.skyHorizon);
  const binsPer = Math.max(1, Math.round(1 / sky.azStep));
  // 由遠到近畫(遠的先畫,近的蓋在前面;深度也會處理,這只是保險)
  for (let b = sky.bands.length - 1; b >= 0; b--) {
    const prof = bandProfile(sky.bands[b].angle, binsPer);
    const R = LOOK_MOUNTAINS.radius[b] ?? 1400;
    const base = new THREE.Color(LOOK_MOUNTAINS.color[b] ?? '#b3c9de');
    const foot = base.clone().lerp(horizon, LOOK_MOUNTAINS.haze[b] ?? 0.6);
    const n = prof.length;
    const step = (2 * Math.PI) / n;
    // 座標都相對眼睛(整圈每幀跟著鏡頭高度);底邊只到地平線下 0.5°。
    // 真的山在 10 km 外,山腳本來就幾乎在眼睛的地平線上;再往下是霧和地面(地面外是同色的天空地平線色)。
    const yBottom = -R * Math.tan(THREE.MathUtils.degToRad(0.5));
    const h = (a: number) => R * Math.tan(THREE.MathUtils.degToRad(Math.max(-1, a) * LOOK_MOUNTAINS.exaggerate));
    let seed = 7919 * (b + 1);
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const pos: number[] = [];
    const col: number[] = [];
    // 方位角 az(北 = 0、東 = 90)→ 世界 (x 東, z 南):(sin az, −cos az)
    const at = (i: number, r: number, y: number) => {
      const az = i * step;
      return [Math.sin(az) * r, y, -Math.cos(az) * r];
    };
    const tops = prof.map(h);
    // 中間一排:高度約 55%,前後、上下抖動,讓稜面不規則
    // 中間一排:在山頂與地平線(y = 0)之間,約 40–65% 高,前後抖動,讓稜面不規則
    const mids = tops.map((t) => {
      const f = 0.4 + rnd() * 0.25;
      return { y: Math.max(0, t) * f, f, r: R - 15 - rnd() * 25 };
    });
    const push = (v: number[], c: THREE.Color, _f: number) => {
      pos.push(v[0], v[1], v[2]);
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (tops[i] <= 0 && tops[j] <= 0) continue; // 兩端都在地平線下:不用畫
      const T0 = at(i, R, tops[i]);
      const T1 = at(j, R, tops[j]);
      const M0 = at(i, mids[i].r, mids[i].y);
      const M1 = at(j, mids[j].r, mids[j].y);
      const B0 = at(i, R, yBottom);
      const B1 = at(j, R, yBottom);
      // 面朝內(朝鏡頭):環的內側
      const f0 = mids[i].f, f1 = mids[j].f;
      push(T0, base, 1); push(M0, base, f0); push(T1, base, 1);
      push(T1, base, 1); push(M0, base, f0); push(M1, base, f1);
      push(M0, foot, f0); push(B0, foot, 0); push(M1, foot, f1);
      push(M1, foot, f1); push(B0, foot, 0); push(B1, foot, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, fog: false, side: THREE.DoubleSide,
      // 遠景要亮、偏天空色,不要被太陽照出很深的陰影面
      emissive: base.clone().lerp(horizon, 0.5), emissiveIntensity: 0.45 + 0.12 * b,
    });
    mat.userData.dayEmissive = mat.emissiveIntensity; // 夜景(0042 驗收):setCloudsNight 依這個值縮放
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `mountains-${b}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = -10 + b;
    group.add(mesh);
  }
  return group;
}

/**
 * 每幀:整圈跟著鏡頭(含高度),像天空一樣永遠在遠方,仰角照實。
 * 試過不行的(2026-11-12 樣張,鏡頭 160 m 高往外看):
 * - 整圈固定在地面 y = 0:鏡頭一高,近山像浮在半空的一條條。
 * - 山腳拉到地面、只抬高山頂:地圈只在 1.2 km 外,山腳到地平線之間那段變成一道擋住城市的牆。
 */
export function followMountains(m: THREE.Object3D, camera: THREE.Camera) {
  m.position.copy(camera.position);
}

export async function loadSkyline(area: string): Promise<Skyline | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}map/${area}/skyline.json`);
    return r.ok ? ((await r.json()) as Skyline) : null;
  } catch {
    return null;
  }
}
