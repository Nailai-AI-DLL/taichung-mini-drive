// 大地圖(Cooper 2026-11-15,decisions/0037:「按 M 之後改成開啟大地圖，顯示目前整款遊戲的地圖範圍」)。
// 整個地圖範圍(world.json meta.bounds)縮放到畫面內，北朝上。開著的時候遊戲暫停(main.ts)。
// 底圖(道路、綠地、水面、路名)開啟時畫一次進快取;每幀只疊地標、知名地點、接送目標與車子箭頭。
import { labelCandidates, landmarkGlyph, pickLabels, type MapData, type PlacedLabel } from './minimap-core';
import { drawCarArrow, drawGlyph, drawMapBase, MAP_COLORS as C, MAP_FONT } from './map-draw';

/** 畫面上最多放幾個路名;路名字型 */
const MAX_LABELS = 36;
const labelFont = (rank: number) => (rank ? `700 12px ${MAP_FONT}` : `500 11px ${MAP_FONT}`);

/** 地圖範圍 [minX, minZ, maxX, maxZ] 放進 w × h 的畫布(CSS px)時的縮放與左上角偏移 */
export function fitBounds(bounds: readonly number[], w: number, h: number) {
  const [x0, z0, x1, z1] = bounds;
  const scale = Math.min(w / (x1 - x0), h / (z1 - z0));
  return { scale, width: (x1 - x0) * scale, height: (z1 - z0) * scale };
}

/** 世界座標 → 大地圖畫布座標(CSS px,左上角為原點，北朝上) */
export function bigMapPoint(bounds: readonly number[], scale: number, x: number, z: number): [number, number] {
  return [(x - bounds[0]) * scale, (z - bounds[1]) * scale];
}

export class BigMap {
  readonly el = document.createElement('div');
  open = false;
  places: { x: number; z: number; glyph: string; color: string }[] = [];
  target: { x: number; z: number; color: string } | null = null;

  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private scale = 1;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private baseKey = '';

  constructor(private data: MapData, private bounds: readonly number[]) {
    this.el.className = 'bigmap hidden';
    const panel = document.createElement('div');
    panel.className = 'bigmap-panel';
    const head = document.createElement('div');
    head.className = 'bigmap-head';
    head.innerHTML = '<b>地圖</b><span><kbd>M</kbd> 或 <kbd>Esc</kbd> 關閉</span>';
    panel.append(head, this.canvas);
    this.el.append(panel);
    this.ctx = this.canvas.getContext('2d')!;
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) this.layout();
  }

  /** 視窗大小改變時呼叫(開著才重排,關著的話下次開啟時排) */
  relayout() {
    if (this.open) this.layout();
  }

  /** 依視窗大小決定畫布尺寸;尺寸變了才重畫底圖 */
  private layout() {
    const fit = fitBounds(this.bounds, window.innerWidth * 0.9, window.innerHeight * 0.8 - 40);
    this.scale = fit.scale;
    this.w = Math.round(fit.width);
    this.h = Math.round(fit.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${this.w}x${this.h}@${this.dpr}`;
    if (key === this.baseKey) return;
    this.baseKey = key;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.drawBase();
  }

  private drawBase() {
    const g = this.base.getContext('2d')!;
    const [x0, z0, x1, z1] = this.bounds;
    const k = this.scale * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, this.base.width, this.base.height);
    g.setTransform(k, 0, 0, k, -x0 * k, -z0 * k);
    const area = { minX: x0, minZ: z0, maxX: x1, maxZ: z1 };
    drawMapBase(g, this.data, area, this.scale);
    // 路名(北朝上，挑法和小地圖相同;以畫布中心為原點，最後只留整個字框在畫布內的)
    const cx = this.w / 2, cy = this.h / 2;
    const toMap = (x: number, z: number): [number, number] => {
      const [px, py] = bigMapPoint(this.bounds, this.scale, x, z);
      return [px - cx, py - cy];
    };
    g.setTransform(this.dpr, 0, 0, this.dpr, cx * this.dpr, cy * this.dpr);
    const measure = (s: string, rank: number) => {
      g.font = labelFont(rank);
      return g.measureText(s).width;
    };
    const labels: PlacedLabel[] = pickLabels(labelCandidates(this.data, area), toMap, 0, this.scale, measure, {
      maxR: Infinity,
      radius: Infinity,
      max: MAX_LABELS,
      height: (rank) => (rank ? 15 : 13),
      avoidCenter: 0,
    }).filter((l) => Math.abs(l.x) + l.w / 2 < cx - 4 && Math.abs(l.y) + l.h / 2 < cy - 4);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const l of labels) {
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
  }

  /** 每幀呼叫(關著的時候直接返回):x, z 為車子位置;hx, hz 為車頭方向 */
  update(x: number, z: number, hx: number, hz: number) {
    if (!this.open) return;
    if (Math.min(window.devicePixelRatio || 1, 2) !== this.dpr) this.layout();
    const g = this.ctx;
    const d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0);
    const pt = (wx: number, wz: number) => bigMapPoint(this.bounds, this.scale, wx, wz);
    // 地標名稱(圖示下方，淺色描邊):地標很密的地方(市政中心一帶)名稱會疊在一起,和已放的名稱或任何圖示重疊就不寫,只留圖示
    const icons = this.data.landmarks.map((lm) => pt(lm.x, lm.z));
    const names: [number, number, number, number][] = [];
    const named = this.data.landmarks.map(() => false);
    g.font = `700 11px ${MAP_FONT}`;
    for (const [i, lm] of this.data.landmarks.entries()) {
      const [mx, my] = icons[i];
      const w = g.measureText(lm.name).width + 4;
      const box: [number, number, number, number] = [mx - w / 2, my + 11, mx + w / 2, my + 25];
      const hit = (b: number[]) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3];
      if (names.some(hit) || icons.some(([ix, iy]) => hit([ix - 10, iy - 10, ix + 10, iy + 10]))) continue;
      names.push(box);
      named[i] = true;
    }
    for (const [i, lm] of this.data.landmarks.entries()) drawGlyph(g, icons[i][0], icons[i][1], 10, landmarkGlyph(lm.id, lm.name), C.icon, C.car, C.car, 2);
    g.font = `700 11px ${MAP_FONT}`;
    g.lineWidth = 3;
    for (const [i, lm] of this.data.landmarks.entries()) {
      if (!named[i]) continue;
      const [mx, my] = icons[i];
      g.strokeStyle = C.halo;
      g.strokeText(lm.name, mx, my + 18);
      g.fillStyle = C.car;
      g.fillText(lm.name, mx, my + 18);
    }
    for (const pl of this.places) {
      const [mx, my] = pt(pl.x, pl.z);
      drawGlyph(g, mx, my, 9, pl.glyph, pl.color, '#fff', '#fff', 1.5);
    }
    if (this.target) {
      const [mx, my] = pt(this.target.x, this.target.z);
      g.beginPath();
      g.arc(mx, my, 9, 0, Math.PI * 2);
      g.fillStyle = this.target.color;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#fff';
      g.stroke();
    }
    const [cx, cy] = pt(x, z);
    g.translate(cx, cy);
    g.rotate(Math.atan2(hz, hx) + Math.PI / 2);
    drawCarArrow(g, 1.2);
  }
}
