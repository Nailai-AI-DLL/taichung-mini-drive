// Tripo 街道物件(decisions/0020):行道樹、路燈用 GLB 樣板 + InstancedMesh 畫。
// 每種樣板(例如 3 棵不同的松樹、1 支路燈)一個 InstancedMesh;所有已載入格子共用。
// 每格只帶 [種類, x, z, 朝向, 大小] 的陣列(src/world/chunks.ts 的 ChunkMeshes.props),格子載入 / 卸載時整批重寫。
// 樣板還沒載入完成時先記下擺放,載入後補畫。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PROP_KIND, PROP_MODELS } from '../config/props';
import { toonMapMaterial } from './car-style';

type Variant = { geometry: THREE.BufferGeometry; material: THREE.Material; mesh: THREE.InstancedMesh | null };

/** 依位置挑樣板(同一點每次都一樣) */
export function pickVariant(x: number, z: number, n: number) {
  const h = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663);
  return (h >>> 0) % n;
}

export class PropLayer {
  private readonly chunks = new Map<object, Float32Array>();
  /** 依種類(PROP_KIND)的樣板清單 */
  private variants: Variant[][] | null = null;

  constructor(private readonly scene: THREE.Scene, base: string) {
    const kinds = [PROP_MODELS.tree, PROP_MODELS.light];
    Promise.all(kinds.map((u) => loadVariants(base + u)))
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
          let cap = 256;
          while (cap < n) cap *= 2;
          v.mesh = new THREE.InstancedMesh(v.geometry, v.material, cap);
          // 分散在整個載入範圍,用樣板的包圍球剔除會錯
          v.mesh.frustumCulled = false;
          v.mesh.castShadow = true;
          v.mesh.receiveShadow = true;
          v.mesh.name = `props-${kind === PROP_KIND.Tree ? 'tree' : 'light'}-${j}`;
          this.scene.add(v.mesh);
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
    for (const vs of this.variants) for (const v of vs) if (v.mesh) v.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** 一個 GLB 裡的每個網格節點 = 一個樣板(幾何套用節點變換;材質換成卡通材質) */
async function loadVariants(url: string): Promise<Variant[]> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const out: Variant[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const src = m.material as THREE.MeshStandardMaterial;
    out.push({ geometry, material: toonMapMaterial(src.map ?? null, src.color), mesh: null });
  });
  return out;
}
