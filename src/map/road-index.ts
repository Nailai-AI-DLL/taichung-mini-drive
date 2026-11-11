// 路名查詢:給車輛位置與車頭方向,找出「目前所在道路」。
// 規則(production-plan.md §4.4):半徑 15 m 內、方向一致的路段;執行期再加 0.5 秒防抖(見 RoadNameTracker)。
// 道路很寬時(半寬 + 5 m 超過 15 m),搜尋半徑自動放大,避免在寬路外側車道找不到路名。
import Flatbush from 'flatbush';
import type { RoadWay } from './types';

export const SEARCH_RADIUS = 15;

export interface RoadHit {
  way: RoadWay;
  /** 到路段中心線的距離(公尺) */
  distance: number;
  /** 路段上最近點 */
  x: number;
  z: number;
  /** 路段方向(單位向量,依折線點順序) */
  dirX: number;
  dirZ: number;
}

interface Seg {
  wayIdx: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export class RoadIndex {
  private segs: Seg[] = [];
  private tree: Flatbush;
  /** 實際使用的搜尋半徑 */
  readonly radius: number;

  constructor(public readonly ways: RoadWay[]) {
    this.radius = Math.max(SEARCH_RADIUS, ...ways.map((w) => w.width / 2 + 5));
    ways.forEach((w, wayIdx) => {
      const p = w.points;
      for (let i = 0; i + 3 < p.length; i += 2) {
        this.segs.push({ wayIdx, ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3] });
      }
    });
    this.tree = new Flatbush(Math.max(1, this.segs.length));
    for (const s of this.segs) {
      this.tree.add(Math.min(s.ax, s.bx), Math.min(s.az, s.bz), Math.max(s.ax, s.bx), Math.max(s.az, s.bz));
    }
    if (this.segs.length === 0) this.tree.add(0, 0, 0, 0);
    this.tree.finish();
  }

  /** 半徑內所有路段的命中結果(每條道路只保留最近的一段) */
  near(x: number, z: number, radius = this.radius): RoadHit[] {
    const ids = this.tree.search(x - radius, z - radius, x + radius, z + radius);
    const best = new Map<number, RoadHit>();
    for (const id of ids) {
      const s = this.segs[id];
      if (!s) continue;
      const vx = s.bx - s.ax;
      const vz = s.bz - s.az;
      const len2 = vx * vx + vz * vz;
      if (len2 < 1e-9) continue;
      let t = ((x - s.ax) * vx + (z - s.az) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = s.ax + vx * t;
      const pz = s.az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d > radius) continue;
      const prev = best.get(s.wayIdx);
      if (!prev || d < prev.distance) {
        const len = Math.sqrt(len2);
        best.set(s.wayIdx, { way: this.ways[s.wayIdx], distance: d, x: px, z: pz, dirX: vx / len, dirZ: vz / len });
      }
    }
    return [...best.values()];
  }

  /**
   * 目前道路:半徑內、方向與車頭一致者優先。
   * 分數 = 超出路面的距離 + 方向不一致懲罰(雙向道路取 |cos|,單行道逆向視為不一致)。
   * 有名稱的道路略為優先,避免在無名巷口誤判。
   */
  current(x: number, z: number, headingX: number, headingZ: number): RoadHit | null {
    const hits = this.near(x, z);
    let bestHit: RoadHit | null = null;
    let bestScore = Infinity;
    for (const h of hits) {
      const cos = h.dirX * headingX + h.dirZ * headingZ;
      const align = h.way.oneway ? Math.max(0, cos) : Math.abs(cos);
      const offRoad = Math.max(0, h.distance - h.way.width / 2);
      const score = offRoad + 8 * (1 - align) + (h.way.name ? 0 : 3);
      if (score < bestScore) {
        bestScore = score;
        bestHit = h;
      }
    }
    return bestHit;
  }

  /** 最近的道路點(不論方向),給「回到路面」用 */
  nearest(x: number, z: number, maxRadius = 400): RoadHit | null {
    for (let r = 20; r <= maxRadius; r *= 2) {
      const hits = this.near(x, z, r);
      if (hits.length) return hits.reduce((a, b) => (a.distance <= b.distance ? a : b));
    }
    return null;
  }
}

/**
 * 路名防抖:新路名要連續維持 holdSeconds 才切換顯示,避免在路口閃爍。
 */
export class RoadNameTracker {
  shown = '';
  private candidate = '';
  private candidateTime = 0;

  constructor(private readonly holdSeconds = 0.5) {}

  /** 回傳 true 表示顯示的路名改變了 */
  update(name: string, dt: number): boolean {
    if (name === this.shown) {
      this.candidate = name;
      this.candidateTime = 0;
      return false;
    }
    if (name !== this.candidate) {
      this.candidate = name;
      this.candidateTime = 0;
    }
    this.candidateTime += dt;
    if (this.candidateTime >= this.holdSeconds) {
      this.shown = name;
      return true;
    }
    return false;
  }
}
