// 其他車輛的畫面(decisions/0028):兩個方塊(車身 + 車廂),各一個 InstancedMesh,卡通材質;每台一個顏色,上下同色。
import * as THREE from 'three';
import { TRAFFIC } from '../config/traffic';
import type { TrafficCar } from '../traffic/traffic';
import { toonMaterial } from './car-style';

export class TrafficLayer {
  private body: THREE.InstancedMesh;
  private cabin: THREE.InstancedMesh;
  private colors = TRAFFIC.colors.map((c) => new THREE.Color(c));
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, max = TRAFFIC.count + 8) {
    const [bl, bh, bw] = TRAFFIC.body, [cl, ch, cw] = TRAFFIC.cabin;
    // 局部 +x = 車頭
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(bl, bh, bw), toonMaterial(0xffffff), max);
    this.cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(cl, ch, cw), toonMaterial(0xffffff), max);
    for (const mesh of [this.body, this.cabin]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.body.name = 'traffic-body';
    this.cabin.name = 'traffic-cabin';
  }

  sync(cars: readonly TrafficCar[]) {
    const n = Math.min(cars.length, this.body.instanceMatrix.count);
    const [, bh] = TRAFFIC.body, [, ch] = TRAFFIC.cabin;
    for (let i = 0; i < n; i++) {
      const c = cars[i];
      // 繞 y 轉 θ 把局部 +x 轉到 (cos θ, 0, −sin θ);要轉到 (cos h, 0, sin h),所以 θ = −h
      this.q.setFromAxisAngle(this.up, -c.heading);
      this.p.set(c.x, TRAFFIC.clearance + bh / 2, c.z);
      this.body.setMatrixAt(i, this.m.compose(this.p, this.q, this.one));
      this.body.setColorAt(i, this.colors[c.color % this.colors.length]);
      // 車廂稍微靠後
      this.p.set(c.x - Math.cos(c.heading) * 0.25, TRAFFIC.clearance + bh + ch / 2, c.z - Math.sin(c.heading) * 0.25);
      this.cabin.setMatrixAt(i, this.m.compose(this.p, this.q, this.one));
      this.cabin.setColorAt(i, this.colors[c.color % this.colors.length]);
    }
    this.body.count = this.cabin.count = n;
    this.body.instanceMatrix.needsUpdate = this.cabin.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.cabin.instanceColor) this.cabin.instanceColor.needsUpdate = true;
  }
}
