// 雲(decisions/0016 方向 A):低多邊形白色雲團散在整個區域上空,一個網格一個 draw call;不受霧影響。
// 位置由種子決定,每次載入都一樣。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOOK_CLOUDS } from '../config/look';

export function createClouds(bounds: [number, number, number, number]): THREE.Mesh {
  const [minX, minZ, maxX, maxZ] = bounds;
  let seed = 20261111;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.Color(LOOK_CLOUDS.color), bottom = new THREE.Color(LOOK_CLOUDS.shade);
  const margin = 1200;
  for (let i = 0; i < LOOK_CLOUDS.count; i++) {
    const cx = minX - margin + rnd() * (maxX - minX + 2 * margin);
    const cz = minZ - margin + rnd() * (maxZ - minZ + 2 * margin);
    const cy = LOOK_CLOUDS.minY + rnd() * (LOOK_CLOUDS.maxY - LOOK_CLOUDS.minY);
    const size = LOOK_CLOUDS.minSize + rnd() * (LOOK_CLOUDS.maxSize - LOOK_CLOUDS.minSize);
    const rot = rnd() * Math.PI;
    const puffs = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < puffs; k++) {
      // 一團雲:沿長軸排幾顆扁球,中間大、兩端小
      const t = puffs === 1 ? 0 : k / (puffs - 1) - 0.5;
      const r = size * (0.55 - Math.abs(t) * 0.5) * (0.8 + rnd() * 0.4);
      const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
      g.scale(1.2, 0.7, 0.9);
      g.rotateY(rot);
      const along = t * size * 1.6;
      g.translate(cx + Math.cos(rot) * along, cy + rnd() * r * 0.3, cz - Math.sin(rot) * along + (rnd() - 0.5) * r * 0.6);
      g.computeVertexNormals();
      // 底部偏灰藍、頂部白(扁平著色的低多邊形感)
      const pos = g.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let v = 0; v < pos.count; v++) {
        c.lerpColors(bottom, top, THREE.MathUtils.clamp((pos.getY(v) - cy + r * 0.2) / (r * 0.6), 0, 1));
        c.toArray(col, v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    }
  }
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  return mesh;
}
