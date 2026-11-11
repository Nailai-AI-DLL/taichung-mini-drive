// 車子的卡通造型(decisions/0016 §15.4,Cooper 2026-11-11:「汽車貼圖風格可以改成像附圖這種卡通風格嗎」)。
// 寫實材質(法線貼圖、粗糙度 / 金屬度、環境反射)會把 AI 模型的細小凹凸和髒污畫出來,看起來斑駁;
// 卡通造型只用底色貼圖、明暗分三階,再加一圈深色描邊(背面外擴法:同一份幾何沿法向量往外推、只畫背面)。
// 只影響車子;網址 ?carstyle=pbr 換回寫實材質。
import * as THREE from 'three';

/** 卡通造型的數值(品味項,樣張給 Cooper 看後再調) */
export const CAR_TOON = {
  /** 明暗三階的亮度(0–255):暗面、中間、亮面 */
  steps: [110, 190, 255],
  /** 描邊粗細(公尺)與顏色 */
  outline: 0.022,
  outlineColor: '#14161b',
};

let gradient: THREE.DataTexture | null = null;

function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array(CAR_TOON.steps.length * 4);
  CAR_TOON.steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, CAR_TOON.steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/** 描邊材質:頂點沿法向量往外推,只畫背面。
 *  MeshBasicMaterial 的頂點著色器沒有 objectNormal(沒光照就不算),要直接用頂點屬性 normal;
 *  2026-11-11 第一版用 objectNormal 編譯失敗、描邊根本沒畫出來,tools/shots/car-shots.mjs 現在遇到著色器錯誤會失敗 */
function outlineMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: CAR_TOON.outlineColor, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${CAR_TOON.outline.toFixed(4)};`);
  };
  return m;
}

/** 把車子(含輪子)換成卡通造型;重複呼叫不會重複加描邊 */
export function toonifyCar(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outline) meshes.push(m);
  });
  const outline = outlineMaterial();
  for (const m of meshes) {
    if (m.userData.toon) continue;
    const src = m.material as THREE.MeshStandardMaterial;
    m.material = new THREE.MeshToonMaterial({ map: src.map ?? null, color: src.map ? 0xffffff : src.color, gradientMap: gradientMap() });
    m.userData.toon = true;
    const edge = new THREE.Mesh(m.geometry, outline);
    edge.userData.outline = true;
    edge.castShadow = false;
    m.add(edge);
  }
}
