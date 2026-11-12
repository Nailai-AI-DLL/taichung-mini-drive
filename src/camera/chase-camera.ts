// 鏡頭:追尾 / 近距追尾 / 第一人稱 / 高空俯視(C 鍵切換)。速度越快 FOV 越寬。
// 第一人稱(Cooper 2026-11-12,decisions/0017):眼睛在駕駛座(台灣左駕 → 車子左側),位置跟車子硬綁、只緩動高度。
// 平滑方式有兩種,預設 body(2026-10-24 Cooper 試開後選定,見 docs/decisions/0009 S1);world 保留給測試對照:
// - world:在世界座標裡 lerp。車子越快,鏡頭落後越多(約 車速 / stiffness),
//   幀時間不均時落後量跟著跳,鏡頭會前後湧動。
// - body:在「相對車子的位移」上 lerp(參考 mrdoob/slop-newyork js/cameras.js 的做法,自行改寫)。
//   直線等速時位移不變,鏡頭穩定;轉彎、換視角仍有緩動。為了和 world 的構圖一致,
//   依平滑後的車速額外往後拉 車速 / stiffness,看點往後 車速 / (2 × stiffness)。
import * as THREE from 'three';
import { DEFAULT_PARAMS } from '../vehicle/params';

interface Mode {
  name: string;
  back: number;
  up: number;
  look: number; // 看向車頭前方幾公尺
  stiffness: number;
  /** 第一人稱:back / up 改當「眼睛相對車體中心」的前後 / 高度,side 是左右(負 = 左) */
  firstPerson?: { side: number };
}

/** 第一人稱眼睛位置(車體中心座標;車體中心離地 0.80 m,0.36 → 眼睛離地約 1.16 m) */
const EYE = { forward: -0.15, up: 0.36, side: -0.36, look: 25 };

const MODES: Mode[] = [
  { name: '追尾', back: 7.5, up: 3.2, look: 4, stiffness: 5 },
  { name: '近距追尾', back: 4.8, up: 1.9, look: 6, stiffness: 7 },
  { name: '第一人稱', back: -EYE.forward, up: EYE.up, look: EYE.look, stiffness: 12, firstPerson: { side: EYE.side } },
  { name: '高空俯視', back: 28, up: 60, look: 2, stiffness: 3 },
];

export type Smoothing = 'world' | 'body';

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  smoothing: Smoothing = 'body';
  private mode = 0;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private initialized = false;
  // body 模式的狀態
  private offset = new THREE.Vector3();
  private lookOffset = new THREE.Vector3();
  private baseY = 0;
  private speed = 0; // 平滑後的車速(m/s)
  private anchored = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.3, 1500);
  }

  get modeName() {
    return MODES[this.mode].name;
  }

  /** 第一人稱時 main.ts 會把整台車藏起來(車內看出去很亂) */
  get isFirstPerson() {
    return !!MODES[this.mode].firstPerson;
  }

  next() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  setMode(i: number) {
    this.mode = ((i % MODES.length) + MODES.length) % MODES.length;
    this.snap();
  }

  /** 切換平滑方式;從目前鏡頭位置接續,不跳動 */
  setSmoothing(s: Smoothing) {
    this.smoothing = s;
    this.anchored = false;
  }

  snap() {
    this.initialized = false;
  }

  /** carPos:車體位置;forward:水平車頭方向;speedKmh:車速 */
  update(dt: number, carPos: THREE.Vector3, forward: THREE.Vector2, speedKmh: number) {
    const m = MODES[this.mode];
    const k = 1 - Math.exp(-m.stiffness * dt);
    const kLook = Math.min(1, k * 2);
    // 平滑車速兩種模式都持續追蹤,切換模式時才不會先縮再放;snap 後直接用當下車速
    // speedKmh 有正負號(Rapier currentVehicleSpeed),倒車時改往前拉,和 world 模式的落後方向一致
    const v = speedKmh / 3.6;
    this.speed = this.initialized ? this.speed + (v - this.speed) * k : v;
    if (m.firstPerson) {
      // 右方 = forward × up = (-fz, fx)
      const rx = -forward.y, rz = forward.x;
      if (!this.initialized) this.baseY = carPos.y;
      this.baseY += (carPos.y - this.baseY) * k;
      const y = this.baseY + m.up;
      this.pos.set(carPos.x - forward.x * m.back + rx * m.firstPerson.side, y, carPos.z - forward.y * m.back + rz * m.firstPerson.side);
      this.target.set(this.pos.x + forward.x * m.look, y - 0.6, this.pos.z + forward.y * m.look);
      this.initialized = true;
      this.anchored = false; // 切回追尾時從目前位置接續
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.target);
      this.updateFov(dt, speedKmh);
      return;
    }
    let back = m.back;
    let look = m.look;
    if (this.smoothing === 'body') {
      back += this.speed / m.stiffness;
      look -= this.speed / (2 * m.stiffness);
    }
    const desired = new THREE.Vector3(carPos.x - forward.x * back, carPos.y + m.up, carPos.z - forward.y * back);
    const lookAt = new THREE.Vector3(carPos.x + forward.x * look, carPos.y + 0.8, carPos.z + forward.y * look);
    if (!this.initialized) {
      this.pos.copy(desired);
      this.target.copy(lookAt);
      this.initialized = true;
      this.anchored = false;
    }
    if (this.smoothing === 'world') {
      this.pos.lerp(desired, k);
      this.target.lerp(lookAt, kLook);
    } else {
      if (!this.anchored) {
        this.baseY = carPos.y;
        this.offset.subVectors(this.pos, carPos);
        this.lookOffset.subVectors(this.target, carPos);
        this.anchored = true;
      }
      // 高度在世界座標裡緩動(路緣、顛簸),水平位置跟著車
      this.baseY += (carPos.y - this.baseY) * k;
      this.offset.lerp(desired.sub(carPos), k);
      this.lookOffset.lerp(lookAt.sub(carPos), kLook);
      this.pos.set(carPos.x, carPos.y, carPos.z).add(this.offset);
      this.pos.y += this.baseY - carPos.y;
      this.target.set(carPos.x, carPos.y, carPos.z).add(this.lookOffset);
      this.target.y += this.baseY - carPos.y;
    }
    // 鏡頭不低於地面
    this.pos.y = Math.max(this.pos.y, 0.6);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.updateFov(dt, speedKmh);
  }

  private updateFov(dt: number, speedKmh: number) {
    // 速度越快越寬;滿速 = 極速(2026-11-12 改 60 km/h,原本固定 130)
    const fov = 60 + Math.min(1, Math.abs(speedKmh) / DEFAULT_PARAMS.maxSpeedKmh) * 14;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, 3 * dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
