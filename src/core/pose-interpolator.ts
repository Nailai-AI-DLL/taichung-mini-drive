// 物理以固定 1/60 秒步進,畫面更新率不一定相同(M1 Pro 內建螢幕是 120 Hz)。
// 直接畫最新的物理狀態,車子會每隔一幀才動一次(或一幀動兩步),看起來一頓一頓。
// 這裡保留前後兩個物理狀態,畫面依「累積時間 / 步長」在兩者之間插值(固定步長的標準做法)。
import * as THREE from 'three';

type Vec = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

export class PoseInterpolator {
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private currRot = new THREE.Quaternion();
  readonly position = new THREE.Vector3();
  readonly rotation = new THREE.Quaternion();

  /** 瞬間移動(重設、傳送)後呼叫:前後狀態都設成目前狀態,避免從舊位置滑過去 */
  snap(pos: Vec, rot: Quat) {
    this.currPos.set(pos.x, pos.y, pos.z);
    this.currRot.set(rot.x, rot.y, rot.z, rot.w);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** 每個物理步進之後呼叫 */
  push(pos: Vec, rot: Quat) {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.currPos.set(pos.x, pos.y, pos.z);
    this.currRot.set(rot.x, rot.y, rot.z, rot.w);
  }

  /** alpha = 累積時間 / 步長,0 = 上一步、1 = 最新一步 */
  sample(alpha: number) {
    const a = Math.min(1, Math.max(0, alpha));
    this.position.lerpVectors(this.prevPos, this.currPos, a);
    this.rotation.slerpQuaternions(this.prevRot, this.currRot, a);
    return this;
  }
}
