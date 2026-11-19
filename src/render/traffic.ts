// 其他車輛的畫面(decisions/0028、0037):一般車是兩個方塊(車身 + 車廂),各一個 InstancedMesh,卡通材質;每台一個顏色,上下同色。
// 黃色車 = 計程車,車頂多一個白色小方塊(燈箱);公車是一個綠色長方形。
import * as THREE from 'three';
import { TRAFFIC } from '../config/traffic';
import type { TrafficCar } from '../traffic/traffic';
import { toonMaterial } from './car-style';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRAFFIC_LAMPS } from '../config/look';

/** 一對車燈(局部 +x = 車頭):x = 前 / 後緣,左右各一顆,高度 = 離地高 */
function lampPair(x: number, halfW: number, y: number): THREE.BufferGeometry {
  const [l, h, w] = TRAFFIC_LAMPS.size;
  const z = halfW - TRAFFIC_LAMPS.inset * halfW * 2 + w / 2;
  const a = new THREE.BoxGeometry(l, h, w).translate(x, y, z);
  const b = new THREE.BoxGeometry(l, h, w).translate(x, y, -z);
  return mergeGeometries([a, b])!;
}

export class TrafficLayer {
  private body: THREE.InstancedMesh;
  private cabin: THREE.InstancedMesh;
  private sign: THREE.InstancedMesh;
  private bus: THREE.InstancedMesh;
  /** 夜裡的車燈(0047):一般車 / 公車各一組頭燈、尾燈 */
  private lamps: { head: THREE.InstancedMesh; tail: THREE.InstancedMesh; bus: boolean }[] = [];
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
    const lampMat = (hex: string, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
    const headMat = lampMat(TRAFFIC_LAMPS.head, TRAFFIC_LAMPS.boost), tailMat = lampMat(TRAFFIC_LAMPS.tail, TRAFFIC_LAMPS.tailBoost);
    for (const bus of [false, true]) {
      const [L, H, W] = bus ? TRAFFIC.bus.size : TRAFFIC.body;
      const y = (bus ? TRAFFIC.bus.clearance : TRAFFIC.clearance) + H * TRAFFIC_LAMPS.height;
      const pair = {
        head: new THREE.InstancedMesh(lampPair(L / 2 + 0.02, W / 2, y), headMat, max),
        tail: new THREE.InstancedMesh(lampPair(-L / 2 - 0.02, W / 2, y), tailMat, max),
        bus,
      };
      for (const m of [pair.head, pair.tail]) {
        m.count = 0;
        m.frustumCulled = false;
        m.visible = false;
        m.name = `traffic-lamps-${bus ? 'bus' : 'car'}`;
        scene.add(m);
      }
      this.lamps.push(pair);
    }
    this.body.name = 'traffic-body';
    this.cabin.name = 'traffic-cabin';
    this.sign.name = 'traffic-taxi-sign';
    this.bus.name = 'traffic-bus';
  }

  /** 夜景開關(0047):車燈只在夜裡顯示 */
  setNight(on: boolean) {
    for (const l of this.lamps) l.head.visible = l.tail.visible = on;
  }

  sync(cars: readonly TrafficCar[]) {
    const max = this.body.instanceMatrix.count;
    const [, bh] = TRAFFIC.body, [, ch] = TRAFFIC.cabin;
    const uh = TRAFFIC.bus.size[1];
    let nc = 0, ns = 0, nb = 0;
    for (const c of cars) {
      const baseY = c.y ?? 0;
      // 繞 y 轉 θ 把局部 +x 轉到 (cos θ, 0, −sin θ);要轉到 (cos h, 0, sin h),所以 θ = −h
      this.q.setFromAxisAngle(this.up, -c.heading);
      if (c.kind === 'bus') {
        if (nb >= max) continue;
        this.p.set(c.x, baseY + TRAFFIC.bus.clearance + uh / 2, c.z);
        this.bus.setMatrixAt(nb++, this.m.compose(this.p, this.q, this.one));
        continue;
      }
      if (nc >= max) continue;
      const color = this.colors[c.color % this.colors.length];
      this.p.set(c.x, baseY + TRAFFIC.clearance + bh / 2, c.z);
      this.body.setMatrixAt(nc, this.m.compose(this.p, this.q, this.one));
      this.body.setColorAt(nc, color);
      // 車廂稍微靠後
      const cx = c.x - Math.cos(c.heading) * 0.25, cz = c.z - Math.sin(c.heading) * 0.25;
      this.p.set(cx, baseY + TRAFFIC.clearance + bh + ch / 2, cz);
      this.cabin.setMatrixAt(nc, this.m.compose(this.p, this.q, this.one));
      this.cabin.setColorAt(nc, color);
      nc++;
      if (c.color === TRAFFIC.taxiColor) {
        this.p.set(cx, baseY + TRAFFIC.clearance + bh + ch + TRAFFIC.taxiSign.height / 2, cz);
        this.sign.setMatrixAt(ns++, this.m.compose(this.p, this.q, this.one));
      }
    }
    // 車燈:和車身同一個位置與朝向(只有夜裡看得到;白天不畫,省得每幀多算)
    if (this.lamps[0].head.visible) {
      const n = [0, 0];
      for (const c of cars) {
        const k = c.kind === 'bus' ? 1 : 0;
        const l = this.lamps[k];
        if (n[k] >= max) continue;
        this.q.setFromAxisAngle(this.up, -c.heading);
        this.p.set(c.x, c.y ?? 0, c.z);
        this.m.compose(this.p, this.q, this.one);
        l.head.setMatrixAt(n[k], this.m);
        l.tail.setMatrixAt(n[k], this.m);
        n[k]++;
      }
      this.lamps.forEach((l, k) => {
        l.head.count = l.tail.count = n[k];
        l.head.instanceMatrix.needsUpdate = l.tail.instanceMatrix.needsUpdate = true;
      });
    }
    this.body.count = this.cabin.count = nc;
    this.sign.count = ns;
    this.bus.count = nb;
    for (const mesh of [this.body, this.cabin, this.sign, this.bus]) mesh.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.cabin.instanceColor) this.cabin.instanceColor.needsUpdate = true;
  }
}
