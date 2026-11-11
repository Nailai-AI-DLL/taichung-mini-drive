// 列出外框頂點中，離地標模型輪廓(任何高度的邊，投影到地面)超過 2 m 的點;tests/unit/landmark-models.test.ts 失敗時用來找是哪個角。
// 用法:node tools/models/landmark-gap.mjs <地標 id>(外框 X 東 Y 北;模型為 glTF 座標，北 = -Z)
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const root = process.cwd(), id = process.argv[2];
const fp = JSON.parse(readFileSync(root + '/data/landmarks/footprints-range-a.json', 'utf8')).landmarks[id];
const buf = readFileSync(`${root}/public/models/landmarks/${id}.glb`);
const g = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const E = [];
g.scene.updateMatrixWorld(true);
g.scene.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position, idx = o.geometry.index;
  const V = []; for (let i = 0; i < p.count; i++) V.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  for (let i = 0; i < idx.count; i += 3) for (let k = 0; k < 3; k++) { const a = V[idx.getX(i + k)], b = V[idx.getX(i + (k + 1) % 3)]; E.push([a.x, a.z, b.x, b.z, Math.min(a.y, b.y)]); } });
const sd = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
fp.rings[0].forEach(([x, y], i) => { const z = -y; let best = Infinity; for (const e of E) best = Math.min(best, sd(x, z, ...e)); if (best > 2) console.log(i, x, y, best.toFixed(2)); });
