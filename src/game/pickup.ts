// 「接送慈慈」的遊戲邏輯(decisions/0029):純邏輯,不依賴畫面與物理。
// 一局:去接慈慈(pickup)→ 載她到目的地(dropoff)→ 成功(success)/ 不耐煩值滿了失敗(failed)→ 停幾秒 → 下一局。
// 不耐煩值 0–100,隨時間上升:一段路的時間額度 = 路程 ÷ 30 km/h × 1.5,額度用完剛好漲滿;尊敬越高漲得越慢。
import type { RoadWay } from '../map/types';
import { LINES, PICKUP, type LineKey } from '../config/pickup';

export type Phase = 'pickup' | 'dropoff' | 'success' | 'failed';
export interface Spot {
  x: number;
  z: number;
  /** 顯示用的地點名稱(路名或地標) */
  label: string;
}
export type Rand = () => number;
export type PickupEvent =
  | { type: 'round'; phase: 'pickup'; spot: Spot }
  | { type: 'picked'; spot: Spot }
  | { type: 'delivered'; respect: number }
  | { type: 'failed'; respect: number }
  | { type: 'hit'; kind: 'car' | 'wall'; add: number }
  | { type: 'say'; key: LineKey; text: string };

/** 每秒漲多少百分點:直線距離 dist 公尺的一段路,尊敬 respect */
export function impatienceRate(dist: number, respect: number, cfg = PICKUP): number {
  const budget = ((dist * cfg.routeFactor) / (cfg.paceKmh / 3.6)) * cfg.slack;
  return (100 / Math.max(1, budget)) * Math.max(cfg.minRate, 1 - cfg.respectSlow * respect);
}

/**
 * 挑接送點:離 from 的直線距離在 range 內、在夠寬的一般道路旁(行車方向右側路緣外)。
 * landmarks:附近(150 m 內)有地標時用地標名稱當地點名。找不到回傳 null。
 */
export function pickSpot(
  ways: RoadWay[],
  from: { x: number; z: number },
  rand: Rand,
  landmarks: { name: string; x: number; z: number }[] = [],
  cfg = PICKUP,
): Spot | null {
  for (let tries = 0; tries < 400; tries++) {
    const w = ways[Math.floor(rand() * ways.length)];
    if (!w || !w.name || w.width < cfg.minRoadWidth || cfg.skipHighways.includes(w.highway) || w.points.length < 4) continue;
    const i = Math.floor(rand() * (w.points.length / 2 - 1));
    const ax = w.points[i * 2], az = w.points[i * 2 + 1], bx = w.points[i * 2 + 2], bz = w.points[i * 2 + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const t = rand();
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    // 雙向道隨機選一側;單行道在行車方向右側(右側 = (−dz, dx))
    const side = w.oneway || rand() < 0.5 ? 1 : -1;
    const off = (w.width / 2 + cfg.curbOffset) * side;
    const x = ax + (bx - ax) * t - dz * off, z = az + (bz - az) * t + dx * off;
    const d = Math.hypot(x - from.x, z - from.z);
    if (d < cfg.range[0] || d > cfg.range[1]) continue;
    const lm = landmarks.find((l) => Math.hypot(l.x - x, l.z - z) < 150);
    return { x, z, label: lm ? lm.name : w.name };
  }
  return null;
}

export class PickupGame {
  phase: Phase = 'pickup';
  /** 不耐煩值 0–100 */
  impatience = 0;
  respect: number;
  /** 目前要去的地方(接人點或目的地) */
  target: Spot | null = null;
  /** 目前每秒漲多少 */
  rate = 0;
  /** 這一局成功 / 失敗後還要停幾秒 */
  private resultLeft = 0;
  private hitLeft = 0;
  private nagged = 0;
  /** 最近一句台詞(HUD 顯示) */
  line = '';

  constructor(
    private readonly spot: (from: { x: number; z: number }) => Spot | null,
    private readonly rand: Rand = Math.random,
    respect = 0,
    readonly cfg = PICKUP,
  ) {
    this.respect = Math.max(0, Math.floor(respect));
  }

  private say(key: LineKey, place = ''): PickupEvent {
    const list = LINES[key];
    this.line = list[Math.floor(this.rand() * list.length)].replace('{place}', place);
    return { type: 'say', key, text: this.line };
  }

  /** 開新的一局:慈慈出現在一個地點 */
  start(player: { x: number; z: number }): PickupEvent[] {
    const s = this.spot(player);
    this.phase = 'pickup';
    this.impatience = 0;
    this.nagged = 0;
    this.target = s;
    if (!s) return [];
    this.rate = impatienceRate(Math.hypot(s.x - player.x, s.z - player.z), this.respect, this.cfg);
    return [{ type: 'round', phase: 'pickup', spot: s }, this.say('call', s.label)];
  }

  /** 撞到東西(由物理端判定);回傳事件 */
  hit(kind: 'car' | 'wall'): PickupEvent[] {
    if ((this.phase !== 'pickup' && this.phase !== 'dropoff') || this.hitLeft > 0) return [];
    this.hitLeft = this.cfg.hitCooldown;
    const add = kind === 'car' ? this.cfg.hitCar : this.cfg.hitWall;
    this.impatience = Math.min(100, this.impatience + add);
    const ev: PickupEvent[] = [{ type: 'hit', kind, add }];
    // 車上有人才會唸
    if (this.phase === 'dropoff') ev.push(this.say(kind === 'car' ? 'hitCar' : 'hitWall'));
    return ev;
  }

  update(dt: number, player: { x: number; z: number; speedKmh: number }): PickupEvent[] {
    const ev: PickupEvent[] = [];
    this.hitLeft = Math.max(0, this.hitLeft - dt);
    if (this.phase === 'success' || this.phase === 'failed') {
      this.resultLeft -= dt;
      if (this.resultLeft <= 0) ev.push(...this.start(player));
      return ev;
    }
    if (!this.target) return this.start(player);
    this.impatience = Math.min(100, this.impatience + this.rate * dt);
    if (this.impatience >= 100) {
      this.phase = 'failed';
      this.respect = Math.max(0, this.respect - this.cfg.respectLose);
      this.resultLeft = this.cfg.resultSeconds;
      ev.push({ type: 'failed', respect: this.respect }, this.say('lose'));
      return ev;
    }
    if (this.nagged < 2 && this.impatience >= 80) {
      this.nagged = 2;
      ev.push(this.say('nag80'));
    } else if (this.nagged < 1 && this.impatience >= 50) {
      this.nagged = 1;
      ev.push(this.say('nag50'));
    }
    const d = Math.hypot(this.target.x - player.x, this.target.z - player.z);
    if (d <= this.cfg.arriveDist && Math.abs(player.speedKmh) <= this.cfg.arriveKmh) {
      if (this.phase === 'pickup') {
        const from = this.target;
        const dest = this.spot(from);
        if (!dest) return ev;
        this.phase = 'dropoff';
        this.impatience *= this.cfg.pickupKeep;
        this.nagged = this.impatience >= 80 ? 2 : this.impatience >= 50 ? 1 : 0;
        this.target = dest;
        this.rate = impatienceRate(Math.hypot(dest.x - from.x, dest.z - from.z), this.respect, this.cfg);
        ev.push({ type: 'picked', spot: dest }, this.say('picked', dest.label));
      } else {
        this.phase = 'success';
        this.respect += this.cfg.respectWin;
        this.resultLeft = this.cfg.resultSeconds;
        ev.push({ type: 'delivered', respect: this.respect }, this.say('win'));
      }
    }
    return ev;
  }

  /** 離目標的直線距離(公尺) */
  distance(player: { x: number; z: number }): number {
    return this.target ? Math.hypot(this.target.x - player.x, this.target.z - player.z) : 0;
  }
}

/**
 * 撞擊判定:每個物理步餵車速向量;一步內變化超過 hitDeltaV 就是撞到了。
 * 瞬間移動(回到路面、扶正)後呼叫 reset(),那一步不算。
 */
export class ImpactDetector {
  private vx = 0;
  private vz = 0;
  private has = false;
  constructor(readonly threshold = PICKUP.hitDeltaV) {}
  reset() {
    this.has = false;
  }
  /** 回傳 true = 這一步撞到東西 */
  step(vx: number, vz: number): boolean {
    const hit = this.has && Math.hypot(vx - this.vx, vz - this.vz) > this.threshold;
    this.vx = vx;
    this.vz = vz;
    this.has = true;
    return hit;
  }
}
