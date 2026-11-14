// 小地圖(右下):道路線條、主要路名、地標圖示;M 鍵切換車頭朝上 / 北朝上(production-plan.md §3.5)。
// 道路與綠地、水面先畫進離屏快取(可視範圍的 2 倍),車子接近快取邊緣才重畫;
// 每幀只把快取轉一個角度貼上，再畫正立的路名、地標與車子箭頭。邏輯在 minimap-core.ts。
import { PALETTE } from '../config/palette';
import {
  arrowRotation,
  labelCandidates,
  landmarkGlyph,
  needsRedraw,
  northMarker,
  overlaps,
  pickLabels,
  uprightAngle,
  viewRotation,
  worldToMap,
  type CacheWindow,
  type LabelCandidate,
  type MapData,
  type MinimapMode,
  type PlacedLabel,
} from './minimap-core';

const SIZE = 200; // CSS px(直徑)
const R = SIZE / 2;
const VIEW_R = 260; // 圓的半徑代表幾公尺
const SCALE = R / VIEW_R; // px / m
const CACHE_HALF = VIEW_R * 2; // 快取涵蓋 ±520 m
const LABEL_EVERY = 6; // 每幾幀重新挑一次路名

const C = {
  bg: '#ECE8E0',
  minor: '#FFFFFF',
  major: '#F7E3AE',
  majorEdge: '#E2CD93',
  label: '#47484D',
  labelMinor: '#6E7076',
  halo: 'rgba(246, 244, 239, 0.95)',
  car: '#2F6FB5',
  ring: '#D8D2C6',
  icon: '#F6F4EF',
};
const FAMILY = "'jf-openhuninn', 'PingFang TC', 'Noto Sans TC', sans-serif";
/** 路名字型：主要道路大一點、粗一點 */
const labelFont = (rank: number) => (rank ? `700 11px ${FAMILY}` : `500 10px ${FAMILY}`);

export class Minimap {
  readonly el = document.createElement('div');
  mode: MinimapMode = 'heading';
  /** 最近一次重畫快取的耗時(ms)與次數，效能量測用 */
  redrawMs = 0;
  redraws = 0;

  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private cache = document.createElement('canvas');
  private cacheCtx: CanvasRenderingContext2D;
  private win: CacheWindow | null = null;
  private dpr = 1;
  private cands: LabelCandidate[] = [];
  private labels: PlacedLabel[] = [];
  private frame = 0;
  private north = document.createElement('div');
  /** 知名地點圖示(decisions/0031):圓底 + 一個字 */
  places: { x: number; z: number; glyph: string; color: string }[] = [];
  /** 目標標記(接送點;decisions/0029):在圓內畫圓點,超出範圍時貼在圓邊;null = 不畫 */
  target: { x: number; z: number; color: string } | null = null;
  /** 測試用:關掉路名，讓 e2e 取樣畫面上的道路色時不被路名底框擋住 */
  showLabels = true;

  constructor(private data: MapData) {
    this.el.className = 'minimap';
    this.north.className = 'minimap-north';
    this.north.textContent = 'N';
    this.el.append(this.canvas, this.north);
    this.ctx = this.canvas.getContext('2d')!;
    this.cacheCtx = this.cache.getContext('2d')!;
    this.resize();
  }

  toggleMode() {
    this.mode = this.mode === 'heading' ? 'north' : 'heading';
    this.labels = [];
    this.frame = 0;
  }

  setMode(m: MinimapMode) {
    this.mode = m;
    this.labels = [];
    this.frame = 0;
  }

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = Math.round(SIZE * this.dpr);
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.cache.width = this.cache.height = Math.round(CACHE_HALF * 2 * SCALE * this.dpr);
    this.win = null;
  }

  /** 每幀呼叫:x, z 為車子位置;hx, hz 為車頭方向 */
  /** busy = 這一幀已經做了重的工作(生成格子):快取重畫延到下一幀,兩件事不疊在同一幀(0016 §11:疊在一起曾出現 34 ms 的幀) */
  private deferred = false;

  update(x: number, z: number, hx: number, hz: number, busy = false) {
    if (Math.min(window.devicePixelRatio || 1, 2) !== this.dpr) this.resize();
    if (needsRedraw(this.win, x, z, VIEW_R)) {
      if (busy && !this.deferred) this.deferred = true;
      else {
        this.redraw(x, z);
        this.deferred = false;
      }
    }
    const rot = viewRotation(this.mode, hx, hz);
    const toMap = (wx: number, wz: number) => worldToMap(wx, wz, x, z, SCALE, rot);
    if (this.frame++ % LABEL_EVERY === 0) {
      this.labels = pickLabels(this.cands, toMap, rot, SCALE, (s, rank) => this.measure(s, rank), {
        maxR: R * 0.9,
        radius: R,
        max: 7,
        height: (rank) => (rank ? 13 : 12),
        avoidCenter: 44, // 車子周圍 ±22 px 不放路名(不擋車、也讓 e2e 能取樣車頭前方的道路色)
      });
    }

    const g = this.ctx;
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, SIZE, SIZE);
    // 快取：以車子為中心旋轉後貼上
    const w = this.win!;
    g.translate(R, R);
    g.rotate(rot);
    const side = CACHE_HALF * 2 * SCALE;
    g.drawImage(this.cache, (w.cx - w.half - x) * SCALE, (w.cz - w.half - z) * SCALE, side, side);
    g.setTransform(d, 0, 0, d, R * d, R * d);

    // 路名：沿道路方向、不上下顛倒，淺色描邊(仿地圖 App)。位置與角度每幀從世界座標重算，轉彎時才不會和道路錯開
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const l of this.showLabels ? this.labels : []) {
      [l.x, l.y] = toMap(l.wx, l.wz);
      l.angle = uprightAngle(l.wang + rot);
      g.save();
      g.translate(l.x, l.y);
      g.rotate(l.angle);
      g.font = labelFont(l.rank);
      g.lineWidth = 3;
      g.strokeStyle = C.halo;
      g.strokeText(l.name, 0, 0.5);
      g.fillStyle = l.rank ? C.label : C.labelMinor;
      g.fillText(l.name, 0, 0.5);
      g.restore();
    }
    // 地標圖示(圓內的才畫)
    for (const lm of this.data.landmarks) {
      const [mx, my] = toMap(lm.x, lm.z);
      if (Math.hypot(mx, my) > R - 10) continue;
      g.beginPath();
      g.arc(mx, my, 9, 0, Math.PI * 2);
      g.fillStyle = C.icon;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = C.car;
      g.stroke();
      g.fillStyle = C.car;
      g.font = `700 11px ${FAMILY}`;
      g.fillText(landmarkGlyph(lm.id, lm.name), mx, my + 0.5);
    }
    for (const pl of this.places) {
      const [mx, my] = toMap(pl.x, pl.z);
      if (Math.hypot(mx, my) > R - 10) continue;
      g.beginPath();
      g.arc(mx, my, 8, 0, Math.PI * 2);
      g.fillStyle = pl.color;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#fff';
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `700 10px ${FAMILY}`;
      g.fillText(pl.glyph, mx, my + 0.5);
    }
    if (this.target) {
      let [mx, my] = toMap(this.target.x, this.target.z);
      const dist = Math.hypot(mx, my), edge = R - 12;
      if (dist > edge) [mx, my] = [(mx / dist) * edge, (my / dist) * edge];
      g.beginPath();
      g.arc(mx, my, dist > edge ? 6 : 8, 0, Math.PI * 2);
      g.fillStyle = this.target.color;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#fff';
      g.stroke();
    }
    // 車子箭頭：車頭朝上模式永遠朝上;北朝上模式跟著車頭轉
    g.rotate(arrowRotation(this.mode, hx, hz));
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(7, 7);
    g.lineTo(0, 3);
    g.lineTo(-7, 7);
    g.closePath();
    g.fillStyle = C.car;
    g.lineWidth = 2.5;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fill();
    g.restore();

    // 外圈
    g.setTransform(d, 0, 0, d, 0, 0);
    g.beginPath();
    g.arc(R, R, R - 2.5, 0, Math.PI * 2);
    g.lineWidth = 5;
    g.strokeStyle = C.ring;
    g.stroke();

    // 北方標記：車頭朝上時沿外圈轉到北方
    const [nx, ny] = northMarker(rot, R - 4);
    this.north.style.transform = `translate(${nx}px, ${ny}px)`;
  }

  private measure(s: string, rank: number) {
    this.ctx.font = labelFont(rank);
    return this.ctx.measureText(s).width;
  }

  /** 以 (x, z) 為中心重畫離屏快取:綠地、水面、水道、一般道路、主要道路 */
  private redraw(x: number, z: number) {
    const t0 = performance.now();
    const win = { cx: x, cz: z, half: CACHE_HALF };
    const area = { minX: x - CACHE_HALF, minZ: z - CACHE_HALF, maxX: x + CACHE_HALF, maxZ: z + CACHE_HALF };
    const g = this.cacheCtx;
    const k = SCALE * this.dpr;
    g.setTransform(k, 0, 0, k, (CACHE_HALF - x) * k, (CACHE_HALF - z) * k);
    g.clearRect(x - CACHE_HALF, z - CACHE_HALF, CACHE_HALF * 2, CACHE_HALF * 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const areaColor = [PALETTE.park, PALETTE.pitch, PALETTE.water];
    for (const a of this.data.areas) {
      if (!overlaps(a.bbox, area)) continue;
      g.beginPath();
      for (let i = 0; i + 1 < a.ring.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, a.ring[i], a.ring[i + 1]);
      g.closePath();
      g.fillStyle = areaColor[a.k];
      g.fill();
    }
    g.strokeStyle = PALETTE.water;
    for (const w of this.data.waterways) {
      if (!overlaps(w.bbox, area)) continue;
      g.lineWidth = Math.max(w.width, 2 / SCALE);
      stroke(g, w.pts);
    }
    // 一般道路，再疊主要道路(先畫邊框再畫填色)
    g.strokeStyle = C.minor;
    for (const r of this.data.roads) {
      if (r.rank || !overlaps(r.bbox, area)) continue;
      g.lineWidth = Math.max(r.width, 1.4 / SCALE);
      stroke(g, r.pts);
    }
    const majors = this.data.roads.filter((r) => r.rank && overlaps(r.bbox, area));
    g.strokeStyle = C.majorEdge;
    for (const r of majors) {
      g.lineWidth = Math.max(r.width, 3 / SCALE) + 1.6 / SCALE;
      stroke(g, r.pts);
    }
    g.strokeStyle = C.major;
    for (const r of majors) {
      g.lineWidth = Math.max(r.width, 3 / SCALE);
      stroke(g, r.pts);
    }

    this.win = win;
    this.cands = labelCandidates(this.data, area);
    this.frame = 0;
    this.redraws++;
    this.redrawMs = performance.now() - t0;
  }
}

function stroke(g: CanvasRenderingContext2D, pts: Float32Array) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}
