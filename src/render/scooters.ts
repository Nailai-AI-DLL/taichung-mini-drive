// 機車(decisions/0015 第四批):所有已載入格子的機車共用一個 InstancedMesh(一個 draw call,陰影再一個)。
// 每格只帶每台的 [x, z, 車頭朝向, 車身色編號](src/world/chunks.ts 的 ChunkMeshes.scooters);格子載入 / 卸載時整批重寫。
// 逐台生成網格太慢(密集的格子單格 20–50 ms),見 0015 §11.8。
import * as THREE from 'three';

export class ScooterLayer {
  private mesh: THREE.InstancedMesh | null = null;
  private readonly chunks = new Map<object, Float32Array>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly colors: THREE.Color[],
    private readonly yAt?: (x: number, z: number) => number,
  ) {}

  /** 目前畫出的台數 */
  get count() {
    return this.mesh?.count ?? 0;
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
    let n = 0;
    for (const p of this.chunks.values()) n += p.length / 4;
    // 容量不夠就換一個大一倍的(InstancedMesh 的容量建立後不能改)
    if (!this.mesh || this.mesh.instanceMatrix.count < n) {
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
      }
      let cap = 1024;
      while (cap < n) cap *= 2;
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
      this.mesh.setColorAt(0, this.colors[0]);
      // 分散在整個載入範圍,用樣板的包圍球剔除會錯
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.scene.add(this.mesh);
    }
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    let i = 0;
    for (const p of this.chunks.values())
      for (let k = 0; k < p.length; k += 4, i++) {
        // 繞 y 旋轉:局部 x 軸 → (cos a, 0, sin a)、局部 z 軸 → (-sin a, 0, cos a)(行優先存成欄)
        // 直接寫元素,不建暫時陣列(每次載入卸載要重寫幾千台,暫時陣列會造成垃圾回收停頓)
        const c = Math.cos(p[k + 2]), s = Math.sin(p[k + 2]);
        const o = i * 16;
        const y = this.yAt ? this.yAt(p[k], p[k + 1]) : 0;
        m[o] = c; m[o + 1] = 0; m[o + 2] = s; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = -s; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
        m[o + 12] = p[k]; m[o + 13] = y; m[o + 14] = p[k + 1]; m[o + 15] = 1;
        const cc = this.colors[p[k + 3]];
        col[i * 3] = cc.r;
        col[i * 3 + 1] = cc.g;
        col[i * 3 + 2] = cc.b;
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
