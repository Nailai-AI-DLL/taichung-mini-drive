// Tripo 街道物件(decisions/0020):行道樹、路燈用 GLB 樣板 + InstancedMesh 畫。
// 每種樣板(例如 3 棵不同的松樹、1 支路燈)一個 InstancedMesh;所有已載入格子共用。
// 每格只帶 [種類, x, z, 朝向, 大小] 的陣列(src/world/chunks.ts 的 ChunkMeshes.props),格子載入 / 卸載時整批重寫。
// 樣板還沒載入完成時先記下擺放,載入後補畫。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_KIND, PROP_LIGHT_STYLE, PROP_MODELS } from '../config/props';
import { CAR_TOON, outlineMaterial, toonMapMaterial, toonVertexColorMaterial } from './car-style';

export type Variant = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  mesh: THREE.InstancedMesh | null;
  /** 描邊(背面外擴;和本體共用 instanceMatrix) */
  outline?: { geometry: THREE.BufferGeometry; material: THREE.Material; mesh: THREE.InstancedMesh | null };
};

/**
 * 路燈分色(方案 A):拆成不共用頂點的三角形,依每個面的位置與法向量塗燈桿色或燈罩色(頂點色)。
 * 燈罩 = 高度 ≥ lensMinH × 最高點、離燈桿 x > lensMinX、面朝下。回傳新幾何與燈罩面數。
 */
export function paintLight(src: THREE.BufferGeometry, style = PROP_LIGHT_STYLE) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  const pole = new THREE.Color(style.pole), lens = new THREE.Color(style.lens);
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let lensFaces = 0;
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    const cy = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3;
    const isLens = cy >= top * style.lensMinH && cx > style.lensMinX && n.y < style.lensNormalY;
    if (isLens) lensFaces++;
    const k = isLens ? lens : pole;
    for (let v = 0; v < 3; v++) col.set([k.r, k.g, k.b], (f + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geometry: g, lensFaces };
}

/** 描邊用幾何:只留位置、合併重疊頂點後算平滑法向量(否則硬邊處外擴會裂開) */
function outlineGeometry(src: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  if (src.index) g.setIndex(src.index.clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

/** 依位置挑樣板(同一點每次都一樣) */
export function pickVariant(x: number, z: number, n: number) {
  const h = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663);
  return (h >>> 0) % n;
}

export class PropLayer {
  private readonly chunks = new Map<object, Float32Array>();
  /** 依種類(PROP_KIND)的樣板清單 */
  private variants: Variant[][] | null = null;

  /** 程式生成樹(0044):直接給樣板(依種類 = 樹形 0–4,每種一個),不載 GLB */
  static fromVariants(scene: THREE.Scene, variants: Variant[][], names: string[]) {
    const l = new PropLayer(scene, null);
    l.variants = variants;
    l.names = names;
    return l;
  }

  /** 低多邊形樹(0045):GLB 裡依名稱取節點,每個樹形一個樣板;頂點色、平面陰影 */
  static fromGlbNodes(scene: THREE.Scene, url: string, nodes: readonly string[]) {
    const l = new PropLayer(scene, null);
    l.names = nodes.map((n, k) => `tree${k}-${n}`);
    new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const material = new THREE.MeshLambertMaterial({ vertexColors: true });
        const geo = new Map<string, THREE.BufferGeometry>();
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) geo.set(o.name || o.parent?.name || '', m.geometry.clone().applyMatrix4(m.matrixWorld));
        });
        l.variants = nodes.map((n) => {
          const g = geo.get(n);
          if (!g) throw new Error(`低多邊形樹缺節點 ${n}`);
          return [{ geometry: g, material, mesh: null }];
        });
        l.rebuild();
      })
      .catch((e) => console.warn('低多邊形樹載入失敗', e));
    return l;
  }

  private names = ['tree', 'light'];

  constructor(private readonly scene: THREE.Scene, base: string | null) {
    if (base === null) return;
    const kinds = [PROP_MODELS.tree, PROP_MODELS.light];
    Promise.all(kinds.map((u, k) => loadVariants(base + u, k === PROP_KIND.Light)))
      .then((v) => {
        this.variants = v;
        this.rebuild();
      })
      .catch((e) => console.warn('街道物件樣板載入失敗', e));
  }

  /** 目前畫出的數量(依種類) */
  counts() {
    return (this.variants ?? []).map((vs) => vs.reduce((t, v) => t + (v.mesh?.count ?? 0), 0));
  }

  set(key: object, poses: Float32Array) {
    if (!poses.length) return;
    this.chunks.set(key, poses);
    this.rebuild();
  }

  delete(key: object) {
    if (this.chunks.delete(key)) this.rebuild();
  }

  private rebuild() {
    if (!this.variants) return;
    // 先數每個樣板要畫幾個
    const need = this.variants.map((vs) => vs.map(() => 0));
    for (const p of this.chunks.values())
      for (let k = 0; k < p.length; k += 5) {
        const vs = this.variants[p[k]];
        if (vs?.length) need[p[k]][pickVariant(p[k + 1], p[k + 2], vs.length)]++;
      }
    this.variants.forEach((vs, kind) =>
      vs.forEach((v, j) => {
        const n = need[kind][j];
        if (!v.mesh || v.mesh.instanceMatrix.count < n) {
          if (v.mesh) {
            this.scene.remove(v.mesh);
            v.mesh.dispose();
          }
          if (v.outline?.mesh) {
            this.scene.remove(v.outline.mesh);
            v.outline.mesh.dispose();
          }
          let cap = 256;
          while (cap < n) cap *= 2;
          v.mesh = new THREE.InstancedMesh(v.geometry, v.material, cap);
          // 分散在整個載入範圍,用樣板的包圍球剔除會錯
          v.mesh.frustumCulled = false;
          v.mesh.castShadow = true;
          v.mesh.receiveShadow = true;
          v.mesh.name = `props-${this.names[kind] ?? kind}-${j}`;
          this.scene.add(v.mesh);
          if (v.outline) {
            const o = new THREE.InstancedMesh(v.outline.geometry, v.outline.material, cap);
            o.instanceMatrix = v.mesh.instanceMatrix;
            o.frustumCulled = false;
            o.name = v.mesh.name + '-outline';
            v.outline.mesh = o;
            this.scene.add(o);
          }
        }
        v.mesh.count = 0;
      }),
    );
    for (const p of this.chunks.values())
      for (let k = 0; k < p.length; k += 5) {
        const vs: Variant[] | undefined = this.variants[p[k]];
        if (!vs?.length) continue;
        const mesh: THREE.InstancedMesh = vs[pickVariant(p[k + 1], p[k + 2], vs.length)].mesh!;
        const i: number = mesh.count++;
        // 繞 y 旋轉 a(局部 +x → (cos a, 0, sin a)),再等比縮放 s;直接寫元素,不建暫時物件
        const a = p[k + 3], s = p[k + 4];
        const c = Math.cos(a) * s, sn = Math.sin(a) * s;
        const m = mesh.instanceMatrix.array as Float32Array;
        const o = i * 16;
        m[o] = c; m[o + 1] = 0; m[o + 2] = sn; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = -sn; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
        m[o + 12] = p[k + 1]; m[o + 13] = 0; m[o + 14] = p[k + 2]; m[o + 15] = 1;
      }
    for (const vs of this.variants)
      for (const v of vs)
        if (v.mesh) {
          v.mesh.instanceMatrix.needsUpdate = true;
          if (v.outline?.mesh) v.outline.mesh.count = v.mesh.count;
        }
  }
}

/** 一個 GLB 裡的每個網格節點 = 一個樣板(幾何套用節點變換;材質換成卡通材質;light = 路燈方案 A:分色 + 描邊、不用貼圖) */
async function loadVariants(url: string, light = false): Promise<Variant[]> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const out: Variant[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const src = m.material as THREE.MeshStandardMaterial;
    if (light) {
      out.push({
        geometry: paintLight(geometry).geometry,
        material: toonVertexColorMaterial(),
        mesh: null,
        outline: { geometry: outlineGeometry(geometry), material: outlineMaterial(PROP_LIGHT_STYLE.outline, CAR_TOON.outlineColor), mesh: null },
      });
    } else out.push({ geometry, material: toonMapMaterial(src.map ?? null, src.color), mesh: null });
  });
  return out;
}
