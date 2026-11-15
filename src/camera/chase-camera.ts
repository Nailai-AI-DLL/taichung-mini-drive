// 鏡頭:追尾 / 近距追尾 / 第一人稱 / 高空俯視(C 鍵切換)。
// 車速不影響構圖(Cooper 2026-11-15,decisions/0037:「加速後視角會稍微拉遠…把這效果取消」):
// FOV 固定 60°,鏡頭到車的距離不隨車速變。
// 第一人稱(Cooper 2026-11-12,decisions/0017):眼睛在駕駛座(台灣左駕 → 車子左側),位置跟車子硬綁、只緩動高度。
// 平滑方式有兩種,預設 body(2026-10-24 Cooper 試開後選定,見 docs/decisions/0009 S1);world 保留給測試對照:
// - world:在世界座標裡 lerp。車子越快,鏡頭落後越多(約 車速 / stiffness),
//   幀時間不均時落後量跟著跳,鏡頭會前後湧動。
// - body:在「相對車子的位移」上 lerp(參考 mrdoob/slop-newyork js/cameras.js 的做法,自行改寫)。
//   直線等速時位移不變,鏡頭穩定;轉彎、換視角仍有緩動。
//   (0037 以前會依車速額外往後拉 車速 / stiffness 來對齊 world 的落後量,這就是「加速後拉遠」;已取消。
//    反過來讓 world 往前補 車速 / stiffness,兩種方式的構圖仍一致,都不隨車速變)
import * as THREE from 'three';

export const FOV = 60;

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
  private lastCar = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.3, 1500);
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
      this.lastCar.copy(carPos);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.target);
      this.updateFov(dt, speedKmh);
      return;
    }
    let back = m.back;
    let look = m.look;
    if (this.smoothing === 'world') {
      // world 的 lerp 每幀追上 k,等速時穩態落後 = 車速 × dt × (1 − k) / k(約 車速 / stiffness);往前補回來,構圖距離才不隨車速變
      const lag = k > 0 ? (this.speed * dt * (1 - k)) / k : 0;
      back -= lag;
      look += (this.speed * dt * (1 - kLook)) / kLook; // 看點用 kLook 追,落後量另外算
    }
    const desired = new THREE.Vector3(carPos.x - forward.x * back, carPos.y + m.up, carPos.z - forward.y * back);
    const lookAt = new THREE.Vector3(carPos.x + forward.x * look, carPos.y + 0.8, carPos.z + forward.y * look);
    if (!this.initialized) {
      // 第一幀直接放在構圖位置(world 的 desired 往前補過落後量,要扣回來)
      this.pos.copy(desired).addScaledVector(new THREE.Vector3(forward.x, 0, forward.y), back - m.back);
      this.target.copy(lookAt).addScaledVector(new THREE.Vector3(forward.x, 0, forward.y), m.look - look);
      this.initialized = true;
      this.anchored = false;
      this.lastCar.copy(carPos);
    }
    if (this.smoothing === 'world') {
      this.pos.lerp(desired, k);
      this.target.lerp(lookAt, kLook);
    } else {
      if (!this.anchored) {
        this.baseY = carPos.y;
        // 用上一幀的車位置:pos 是上一幀算的,用這一幀的車位置會多出一幀的位移(高速切換時跳 0.5 m)
        this.offset.subVectors(this.pos, this.lastCar);
        this.lookOffset.subVectors(this.target, this.lastCar);
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
    this.lastCar.copy(carPos);
    // 鏡頭不低於地面
    this.pos.y = Math.max(this.pos.y, 0.6);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.updateFov(dt, speedKmh);
  }

  /** FOV 固定(0037 以前速度越快越寬,最多 +14°,會讓畫面看起來拉遠) */
  private updateFov(_dt: number, _speedKmh: number) {
    if (this.camera.fov !== FOV) {
      this.camera.fov = FOV;
      this.camera.updateProjectionMatrix();
    }
  }
}
