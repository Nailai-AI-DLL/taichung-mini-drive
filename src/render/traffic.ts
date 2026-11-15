// 其他車輛的畫面(decisions/0028、0037):一般車是兩個方塊(車身 + 車廂),各一個 InstancedMesh,卡通材質;每台一個顏色,上下同色。
// 黃色車 = 計程車,車頂多一個白色小方塊(燈箱);公車是一個綠色長方形。
import * as THREE from 'three';
import { TRAFFIC } from '../config/traffic';
import type { TrafficCar } from '../traffic/traffic';
import { toonMaterial } from './car-style';

export class TrafficLayer {
  private body: THREE.InstancedMesh;
  private cabin: THREE.InstancedMesh;
  private sign: THREE.InstancedMesh;
  private bus: THREE.InstancedMesh;
  private colors = TRAFFIC.colors.map((c) => new THREE.Color(c));
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, max = TRAFFIC.count + 8) {
    const [bl, bh, bw] = TRAFFIC.body, [cl, ch, cw] = TRAFFIC.cabin;
    const s = TRAFFIC.taxiSign, [ul, uh, uw] = TRAFFIC.bus.size;
    // 局部 +x = 車頭
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(bl, bh, bw), toonMaterial(0xffffff), max);
    this.cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(cl, ch, cw), toonMaterial(0xffffff), max);
    this.sign = new THREE.InstancedMesh(new THREE.BoxGeometry(s.size, s.height, s.size), toonMaterial(s.color), max);
    this.bus = new THREE.InstancedMesh(new THREE.BoxGeometry(ul, uh, uw), toonMaterial(TRAFFIC.bus.color), max);
    for (const mesh of [this.body, this.cabin, this.sign, this.bus]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.body.name = 'traffic-body';
    this.cabin.name = 'traffic-cabin';
    this.sign.name = 'traffic-taxi-sign';
    this.bus.name = 'traffic-bus';
  }

  sync(cars: readonly TrafficCar[]) {
    const max = this.body.instanceMatrix.count;
    const [, bh] = TRAFFIC.body, [, ch] = TRAFFIC.cabin;
    const uh = TRAFFIC.bus.size[1];
    let nc = 0, ns = 0, nb = 0;
    for (const c of cars) {
      // 繞 y 轉 θ 把局部 +x 轉到 (cos θ, 0, −sin θ);要轉到 (cos h, 0, sin h),所以 θ = −h
      this.q.setFromAxisAngle(this.up, -c.heading);
      if (c.kind === 'bus') {
        if (nb >= max) continue;
        this.p.set(c.x, TRAFFIC.bus.clearance + uh / 2, c.z);
        this.bus.setMatrixAt(nb++, this.m.compose(this.p, this.q, this.one));
        continue;
      }
      if (nc >= max) continue;
      const color = this.colors[c.color % this.colors.length];
      this.p.set(c.x, TRAFFIC.clearance + bh / 2, c.z);
      this.body.setMatrixAt(nc, this.m.compose(this.p, this.q, this.one));
      this.body.setColorAt(nc, color);
      // 車廂稍微靠後
      const cx = c.x - Math.cos(c.heading) * 0.25, cz = c.z - Math.sin(c.heading) * 0.25;
      this.p.set(cx, TRAFFIC.clearance + bh + ch / 2, cz);
      this.cabin.setMatrixAt(nc, this.m.compose(this.p, this.q, this.one));
      this.cabin.setColorAt(nc, color);
      nc++;
      if (c.color === TRAFFIC.taxiColor) {
        this.p.set(cx, TRAFFIC.clearance + bh + ch + TRAFFIC.taxiSign.height / 2, cz);
        this.sign.setMatrixAt(ns++, this.m.compose(this.p, this.q, this.one));
      }
    }
    this.body.count = this.cabin.count = nc;
    this.sign.count = ns;
    this.bus.count = nb;
    for (const mesh of [this.body, this.cabin, this.sign, this.bus]) mesh.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.cabin.instanceColor) this.cabin.instanceColor.needsUpdate = true;
  }
}
