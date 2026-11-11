// 確認 Blender 輸出的 GLB 能被專案使用的 three.js 版本解析。
// 用法:node tools/models/check-glb.mjs <檔案.glb>
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const buf = readFileSync(process.argv[2]);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
new GLTFLoader().parse(ab, '', (gltf) => {
  let meshes = 0;
  let tris = 0;
  const colors = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      colors.push('#' + o.material.color.getHexString(THREE.SRGBColorSpace));
    }
  });
  console.log(`CHECK_OK three r${THREE.REVISION} meshes=${meshes} tris=${tris} colors=${colors.join(',')}`);
}, (e) => {
  console.error('CHECK_FAIL', e);
  process.exit(1);
});
