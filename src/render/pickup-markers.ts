// 「接送慈慈」的場景物件(decisions/0029):慈慈的方塊人形(Cooper:「外型可先用簡單方塊人形」)與目標光柱。
import * as THREE from 'three';
import { toonMaterial } from './car-style';

export const MARKER_COLORS = { pickup: '#FF5FA2', dropoff: '#3DDE88' } as const;

export const CICI_SCALE = 1.35;

/** 方塊人形:腳在原點、原始高約 1.7 m(再乘 CICI_SCALE)、面向 +x */
export function createCici(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cici';
  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box(0.16, 0.55, 0.16, '#F2C6A0', 0, 0.275, -0.11); // 腿
  box(0.16, 0.55, 0.16, '#F2C6A0', 0, 0.275, 0.11);
  box(0.34, 0.5, 0.5, '#FF5FA2', 0, 0.75, 0); // 裙子
  box(0.3, 0.38, 0.44, '#FFFFFF', 0, 1.16, 0); // 上衣
  box(0.12, 0.42, 0.12, '#F2C6A0', 0, 1.12, -0.29); // 手
  box(0.12, 0.42, 0.12, '#F2C6A0', 0, 1.12, 0.29);
  box(0.3, 0.3, 0.3, '#F2C6A0', 0, 1.5, 0); // 頭
  box(0.34, 0.14, 0.36, '#3A2A22', -0.01, 1.66, 0); // 頭髮(頂)
  box(0.12, 0.5, 0.36, '#3A2A22', -0.16, 1.42, 0); // 頭髮(後,長髮)
  // 放大一點,遠處才看得到(方塊風格,不追求真實比例)
  g.scale.setScalar(CICI_SCALE);
  return g;
}

/** 目標光柱 + 地上的圓環 + 上方跳動的菱形 */
export class Beacon {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshBasicMaterial({ color: MARKER_COLORS.pickup, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  private solid = new THREE.MeshBasicMaterial({ color: MARKER_COLORS.pickup });
  private gem: THREE.Mesh;
  private ring: THREE.Mesh;
  private t = 0;

  constructor(radius: number) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 60, 20, 1, true), this.mat);
    col.position.y = 30;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.5, radius, 40), this.solid);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), this.solid);
    this.group.add(col, this.ring, this.gem);
    this.group.name = 'beacon';
    this.group.visible = false;
  }

  set(x: number, z: number, kind: keyof typeof MARKER_COLORS) {
    this.group.position.set(x, 0, z);
    this.mat.color.set(MARKER_COLORS[kind]);
    this.solid.color.set(MARKER_COLORS[kind]);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt: number) {
    this.t += dt;
    this.gem.position.y = 4.2 + Math.sin(this.t * 3) * 0.4;
    this.gem.rotation.y = this.t * 2;
  }
}
