// 路上的其他車輛(decisions/0028):純邏輯,不依賴 three.js 與 Rapier(畫面在 src/render/traffic.ts、物理在 main.ts 接)。
// 每台車記「在哪條路、從第幾個折點往哪個方向、走了多遠」,沿中心線前進;實際位置是右側車道上的點(台灣靠右),
// 車身以固定速率追上去(轉彎才會圓)。到折點時,如果那裡接了別條路,依機率直走或轉彎。
// 前方有車或玩家就煞車;被卡太久就消失重生。
import type { RoadWay } from '../map/types';
import { wayPointY } from '../map/road-index';
import { TRAFFIC } from '../config/traffic';
import { EDGE_INSET, LANE_MAX, LANE_MIN } from '../config/street';

export interface TrafficCar {
  id: number;
  x: number;
  /** 所在路面高度(公尺,平路為 0;高架橋與地形坡度時隨路段高程插值) */
  y?: number;
  z: number;
  /** 車頭方向(弧度,atan2(z, x)) */
  heading: number;
  /** 車頭俯仰角(弧度,上坡為正,平路為 0) */
  pitch?: number;
  /** 目前車速、巡航車速(m/s) */
  speed: number;
  cruise: number;
  /** 這台車開速限的幾成(0046;換到別條路時用新路的速限重算巡航) */
  pace: number;
  /** 所在道路、線段起點折點、方向(+1 順折線、−1 逆)、在線段上走了多遠(公尺) */
  way: number;
  from: number;
  dir: 1 | -1;
  s: number;
  /** 車道往右偏的距離(公尺,相對中心線) */
  lane: number;
  color: number;
  /** car = 一般車(含計程車,看 color);bus = 公車(decisions/0037) */
  kind: 'car' | 'bus';
  stuck: number;
}

/** 車身長、寬(公尺) */
export function carSize(kind: TrafficCar['kind'], cfg = TRAFFIC): { len: number; width: number } {
  return kind === 'bus' ? { len: cfg.bus.size[0], width: cfg.bus.size[2] } : { len: cfg.body[0], width: cfg.body[2] };
}

/** 點 (x, z) 到車身外框(俯視矩形)的距離;在車身內 = 0。撞擊判定用(公車很長,用中心距離會把撞到車頭車尾算成撞牆) */
export function distToCar(c: Pick<TrafficCar, 'x' | 'z' | 'heading' | 'kind'>, x: number, z: number, cfg = TRAFFIC): number {
  const { len, width } = carSize(c.kind, cfg);
  const hx = Math.cos(c.heading), hz = Math.sin(c.heading);
  const rx = x - c.x, rz = z - c.z;
  const a = Math.max(0, Math.abs(rx * hx + rz * hz) - len / 2);
  const b = Math.max(0, Math.abs(-rx * hz + rz * hx) - width / 2);
  return Math.hypot(a, b);
}

/** 依權重抽一個顏色索引 */
export function pickColor(r: number, weights: readonly number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = r * sum;
  for (let i = 0; i < weights.length; i++) if ((t -= weights[i]) < 0) return i;
  return weights.length - 1;
}

export type Rand = () => number;
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 路口連通節點 key:同 (x, z) 且高程差在同一個 2 m 桶內才視為相接(防高架橋車流半空轉進橋下平面道路,同時允許匝道兩端銜接不同高度) */
const key = (x: number, z: number, y = 0) => Math.round(x * 10) + ',' + Math.round(z * 10) + ',' + Math.round(y / 2);
const CELL = 100;

export class Traffic {
  readonly cars: TrafficCar[] = [];
  private nextId = 1;
  /** 折點 → 經過這個點的 (道路, 折點索引) */
  private nodes = new Map<string, { w: number; i: number }[]>();
  /** 生成用:格子 → 線段 (道路, 起點折點) */
  private cells = new Map<string, { w: number; i: number }[]>();
  private usable: boolean[];
  private busOk: boolean[];

  constructor(
    readonly ways: RoadWay[],
    private rand: Rand = Math.random,
    readonly cfg = TRAFFIC,
    private readonly terrainY?: (x: number, z: number) => number,
  ) {
    this.usable = ways.map((w) => !cfg.skipHighways.includes(w.highway) && w.points.length >= 4);
    this.busOk = ways.map((w, i) => this.usable[i] && cfg.busRoads.includes(w.highway));
    ways.forEach((w, wi) => {
      if (!this.usable[wi]) return;
      const p = w.points;
      for (let i = 0; i < p.length / 2; i++) {
        const k = key(p[i * 2], p[i * 2 + 1], wayPointY(w, i));
        let l = this.nodes.get(k);
        if (!l) this.nodes.set(k, (l = []));
        l.push({ w: wi, i });
        if (i + 1 < p.length / 2) {
          const c = Math.floor((p[i * 2] + p[i * 2 + 2]) / 2 / CELL) + ',' + Math.floor((p[i * 2 + 1] + p[i * 2 + 3]) / 2 / CELL);
          let s = this.cells.get(c);
          if (!s) this.cells.set(c, (s = []));
          s.push({ w: wi, i });
        }
      }
    });
  }

  private pt(w: number, i: number): [number, number] {
    const p = this.ways[w].points;
    return [p[i * 2], p[i * 2 + 1]];
  }

  private ptY(w: number, i: number): number {
    const wy = wayPointY(this.ways[w], i);
    if (!this.terrainY) return wy;
    const [x, z] = this.pt(w, i);
    return this.terrainY(x, z) + wy;
  }

  /** 線段(from → from + dir)的長度、高程與方向 */
  private seg(c: Pick<TrafficCar, 'way' | 'from' | 'dir'>) {
    const [ax, az] = this.pt(c.way, c.from);
    const [bx, bz] = this.pt(c.way, c.from + c.dir);
    const ay = this.ptY(c.way, c.from);
    const by = this.ptY(c.way, c.from + c.dir);
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const pitch = Math.atan2(by - ay, len);
    return { ax, ay, az, by, len, dx: (bx - ax) / len, dz: (bz - az) / len, pitch };
  }

  /** 車道上的目標點:中心線上的點往行車方向右側偏 lane 公尺(x 向右、z 向下的座標:右側 = (−dz, dx)) */
  target(c: Pick<TrafficCar, 'way' | 'from' | 'dir' | 's' | 'lane'>): { x: number; y: number; z: number; dx: number; dz: number; pitch: number } {
    const g = this.seg(c);
    const x = g.ax + g.dx * c.s - g.dz * c.lane;
    const z = g.az + g.dz * c.s + g.dx * c.lane;
    const t = Math.max(0, Math.min(1, c.s / g.len));
    let y = g.ay + (g.by - g.ay) * t;
    let pitch = g.pitch;
    if (this.terrainY) {
      // 在 3D 地形上精確取車子所在位置 (x, z) 的地表高程 + 高架相對高度,並以車頭前後 3 m 差值算俯仰角
      const way = this.ways[c.way];
      const rel0 = wayPointY(way, c.from);
      const rel1 = wayPointY(way, c.from + c.dir);
      const relY = rel0 + (rel1 - rel0) * t;
      y = this.terrainY(x, z) + relY;
      const yf = this.terrainY(x + g.dx * 2, z + g.dz * 2) + relY + ((rel1 - rel0) / g.len) * 2;
      const yb = this.terrainY(x - g.dx * 2, z - g.dz * 2) + relY - ((rel1 - rel0) / g.len) * 2;
      pitch = Math.atan2(yf - yb, 4);
    }
    return { x, y, z, dx: g.dx, dz: g.dz, pitch };
  }

  private laneOf(w: number, u: number): number {
    const way = this.ways[w];
    // 有道路圖車道數(0046):和標線同一套排法(tools/map-build/lib/street.ts lanePlan),從內側往外每條 min(LANE_MAX, 可用寬 / 車道數)
    if (way.lanes) {
      // 單行:從左緣(或緊貼對向時的分界 ls)往右排到右緣;雙向:從中心線往右
      const start = way.oneway ? (way.ls ?? -way.width / 2 + EDGE_INSET) : 0;
      const room = way.width / 2 - EDGE_INSET - start;
      const n = Math.max(1, Math.min(way.lanes, Math.floor(room / LANE_MIN)));
      const lw2 = Math.min(LANE_MAX, room / n);
      const k = Math.min(n - 1, Math.floor(u * n));
      return start + (k + 0.5) * lw2;
    }
    const lw = this.cfg.laneWidth;
    if (way.oneway) {
      const n = Math.max(1, Math.round(way.width / lw));
      const k = Math.min(n - 1, Math.floor(u * n));
      return -way.width / 2 + ((k + 0.5) * way.width) / n;
    }
    const half = way.width / 2;
    const n = Math.max(1, Math.round(half / lw));
    const k = Math.min(n - 1, Math.floor(u * n));
    return ((k + 0.5) * half) / n;
  }

  /** 到了線段終點:選下一段。回傳 false = 沒路可走 */
  private advance(c: TrafficCar): boolean {
    const at = c.from + c.dir;
    const n = this.ways[c.way].points.length / 2;
    const [x, z] = this.pt(c.way, at);
    type Opt = { w: number; from: number; dir: 1 | -1 };
    const straight: Opt | null = at + c.dir >= 0 && at + c.dir < n ? { w: c.way, from: at, dir: c.dir } : null;
    const turns: Opt[] = [];
    for (const e of this.nodes.get(key(x, z, wayPointY(this.ways[c.way], at))) ?? []) {
      if (e.w === c.way) continue;
      if (c.kind === 'bus' && !this.busOk[e.w]) continue; // 公車不轉進小路
      const m = this.ways[e.w].points.length / 2;
      if (e.i + 1 < m) turns.push({ w: e.w, from: e.i, dir: 1 });
      if (e.i - 1 >= 0 && !this.ways[e.w].oneway) turns.push({ w: e.w, from: e.i, dir: -1 });
    }
    let next: Opt | null = null;
    if (straight && (!turns.length || this.rand() < this.cfg.straight)) next = straight;
    else if (turns.length) next = turns[Math.floor(this.rand() * turns.length)];
    else if (!this.ways[c.way].oneway) next = { w: c.way, from: at, dir: (-c.dir) as 1 | -1 }; // 死路迴轉
    if (!next) return false;
    if (next.w !== c.way || next.dir !== c.dir) c.lane = this.laneOf(next.w, this.rand());
    c.way = next.w;
    c.from = next.from;
    c.dir = next.dir;
    c.cruise = this.cruiseOf(c);
    return true;
  }

  /** 巡航速度(m/s):有速限 → 速限 × limitPace 範圍內的係數;沒有 → speedKmh 範圍(0046) */
  cruiseOf(c: Pick<TrafficCar, 'way' | 'pace'>): number {
    const cfg = this.cfg;
    const spd = this.ways[c.way].spd;
    const kmh = spd ? spd * (cfg.limitPace[0] + c.pace * (cfg.limitPace[1] - cfg.limitPace[0])) : cfg.speedKmh[0] + c.pace * (cfg.speedKmh[1] - cfg.speedKmh[0]);
    return kmh / 3.6;
  }

  /** 在玩家附近的路上生成一台;找不到合適位置回傳 null */
  spawn(px: number, pz: number): TrafficCar | null {
    const cfg = this.cfg;
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rand() * Math.PI * 2, r = cfg.spawnMin + this.rand() * (cfg.spawnMax - cfg.spawnMin);
      const list = this.cells.get(Math.floor((px + Math.cos(a) * r) / CELL) + ',' + Math.floor((pz + Math.sin(a) * r) / CELL));
      if (!list?.length) continue;
      const e = list[Math.floor(this.rand() * list.length)];
      const way = this.ways[e.w];
      const dir: 1 | -1 = way.oneway || this.rand() < 0.5 ? 1 : -1;
      const c: TrafficCar = {
        id: this.nextId, x: 0, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, cruise: 0, pace: 0,
        way: e.w, from: dir > 0 ? e.i : e.i + 1, dir, s: 0, lane: this.laneOf(e.w, this.rand()),
        color: pickColor(this.rand(), cfg.colorWeights), kind: 'car', stuck: 0,
      };
      if (this.busOk[e.w] && this.rand() < cfg.busShare) c.kind = 'bus';
      c.s = this.rand() * this.seg(c).len;
      const t = this.target(c);
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < cfg.spawnMin * 0.8 || d > cfg.despawn) continue;
      if (this.cars.some((o) => Math.abs((o.y ?? 0) - t.y) < 3.5 && Math.hypot(o.x - t.x, o.z - t.z) < cfg.spawnGap + (c.kind === 'bus' || o.kind === 'bus' ? cfg.bus.size[0] / 2 : 0))) continue;
      c.x = t.x;
      c.y = t.y;
      c.z = t.z;
      c.heading = Math.atan2(t.dz, t.dx);
      c.pitch = t.pitch;
      c.pace = this.rand();
      c.cruise = this.cruiseOf(c);
      c.speed = c.cruise;
      this.nextId++;
      this.cars.push(c);
      return c;
    }
    return null;
  }

  /**
   * 前進一步。player = 玩家車的位置(用來煞車讓路、決定生成與消失)。
   * 回傳這一步消失的車(id),給畫面 / 物理端移除。
   */
  update(dt: number, player: { x: number; y?: number; z: number }): number[] {
    const cfg = this.cfg;
    const py = player.y ?? 0;
    const gone: number[] = [];
    for (const c of this.cars) {
      // ---- 前方有沒有東西 ----
      const hx = Math.cos(c.heading), hz = Math.sin(c.heading);
      let gap = Infinity;
      let byPlayer = false;
      // 距離用「車頭到對方車尾」換算回兩台一般車的中心距離(lookAhead / stopGap 原本以兩台一般車調的):
      // ahead − (自己半長 + 對方半長) + 一般車長;公車比較長、比較寬,看得遠一點、寬一點
      const me = carSize(c.kind, cfg);
      const base = cfg.body[0];
      const look = (ox: number, oy: number, oz: number, isPlayer: boolean, other: { len: number; width: number }) => {
        // 高架橋上下的車不互相煞車讓路
        if (Math.abs(oy - (c.y ?? 0)) > 3.5) return;
        const rx = ox - c.x, rz = oz - c.z;
        const raw = rx * hx + rz * hz;
        const ahead = raw - (me.len + other.len) / 2 + base;
        const side = Math.abs(-rx * hz + rz * hx);
        const sideMax = cfg.lookSide + (me.width + other.width) / 2 - cfg.body[2];
        if (raw > 0.5 && ahead < cfg.lookAhead && side < sideMax && ahead < gap) {
          gap = ahead;
          byPlayer = isPlayer;
        }
      };
      look(player.x, py, player.z, true, carSize('car', cfg));
      for (const o of this.cars) if (o !== c) look(o.x, o.y ?? 0, o.z, false, carSize(o.kind, cfg));
      const want = gap <= cfg.stopGap ? 0 : gap < cfg.lookAhead ? c.cruise * ((gap - cfg.stopGap) / (cfg.lookAhead - cfg.stopGap)) : c.cruise;
      c.speed = want > c.speed ? Math.min(want, c.speed + cfg.accel * dt) : Math.max(want, c.speed - cfg.brake * dt);
      c.stuck = c.speed < 0.3 && !byPlayer ? c.stuck + dt : 0;

      // ---- 沿道路前進 ----
      let alive = true;
      c.s += c.speed * dt;
      for (let guard = 0; guard < 8; guard++) {
        const len = this.seg(c).len;
        if (c.s < len) break;
        c.s -= len;
        if (!this.advance(c)) {
          alive = false;
          break;
        }
      }
      if (alive) {
        const t = this.target(c);
        const k = Math.min(1, cfg.follow * dt);
        const nx = c.x + (t.x - c.x) * k, nz = c.z + (t.z - c.z) * k;
        if (Math.hypot(nx - c.x, nz - c.z) > 1e-4 && c.speed > 0.5) {
          // 車頭轉向移動方向(限制轉速,不會瞬間轉頭)
          const aim = Math.atan2(nz - c.z, nx - c.x);
          let d = aim - c.heading;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          c.heading += Math.max(-3 * dt, Math.min(3 * dt, d));
        }
        c.x = nx;
        c.y = t.y;
        c.z = nz;
        c.pitch = t.pitch;
      }
      if (!alive || c.stuck > cfg.stuckSeconds || Math.hypot(c.x - player.x, c.z - player.z) > cfg.despawn) gone.push(c.id);
    }
    if (gone.length) for (let i = this.cars.length - 1; i >= 0; i--) if (gone.includes(this.cars[i].id)) this.cars.splice(i, 1);
    // 補到定額(一步最多補 2 台,分散負擔)
    for (let k = 0; k < 2 && this.cars.length < cfg.count; k++) if (!this.spawn(player.x, player.z)) break;
    return gone;
  }
}
