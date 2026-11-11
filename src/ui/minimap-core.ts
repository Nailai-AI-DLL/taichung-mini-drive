// 小地圖的純邏輯(不碰 DOM,可在 Node 測試):座標轉換、離屏快取的重畫時機、路名挑選。
// 做法參考 slop-newyork 的小地圖(docs/decisions/0009 S6):2 倍範圍的離屏快取，車子接近快取邊緣才重畫。
// 世界座標:x 東、z 南(北 = -z);小地圖座標：以圓心為原點的 CSS px,x 右、y 下。
import { dequant, type RoadWay, type WorldJson } from '../map/types';

export type MinimapMode = 'heading' | 'north';

export const MINIMAP_MODE_NAME: Record<MinimapMode, string> = { heading: '車頭朝上', north: '北朝上' };

/** 主要道路：畫粗一點、路名優先顯示(數字越大越優先) */
const MAJOR_RANK: Record<string, number> = { trunk: 4, primary: 3, secondary: 2, tertiary: 1 };

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface MapLine {
  pts: Float32Array;
  bbox: Rect;
  width: number;
  /** 0 = 一般道路;1–4 = 主要道路等級 */
  rank: number;
  name: string;
}

export interface MapArea {
  ring: Float32Array;
  bbox: Rect;
  k: 0 | 1 | 2;
}

export interface MapData {
  roads: MapLine[];
  waterways: MapLine[];
  areas: MapArea[];
  landmarks: { id: string; name: string; x: number; z: number }[];
}

function bboxOf(pts: ArrayLike<number>): Rect {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minZ = Math.min(minZ, pts[i + 1]);
    maxZ = Math.max(maxZ, pts[i + 1]);
  }
  return { minX, minZ, maxX, maxZ };
}

/** 載入時整理一次：每條線先算好包圍盒，畫的時候只挑和快取範圍重疊的 */
export function prepareMapData(json: WorldJson, roads: RoadWay[]): MapData {
  return {
    roads: roads.map((r) => {
      const pts = Float32Array.from(r.points);
      return { pts, bbox: bboxOf(pts), width: r.width, rank: MAJOR_RANK[r.highway] ?? 0, name: r.name };
    }),
    waterways: json.waterways.map((w) => {
      const pts = Float32Array.from(dequant(w.pts));
      return { pts, bbox: bboxOf(pts), width: w.w, rank: 0, name: '' };
    }),
    areas: json.areas.map((a) => {
      const ring = Float32Array.from(dequant(a.ring));
      return { ring, bbox: bboxOf(ring), k: a.k };
    }),
    landmarks: json.landmarks.map((l) => ({ id: l.id, name: l.name, x: l.x, z: l.z })),
  };
}

export function overlaps(a: Rect, b: Rect) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

/** 畫布旋轉角(弧度):北朝上不轉;車頭朝上時把車頭方向 (hx, hz) 轉到畫面正上方 */
export function viewRotation(mode: MinimapMode, hx: number, hz: number) {
  return mode === 'north' ? 0 : -Math.PI / 2 - Math.atan2(hz, hx);
}

/** 世界座標 → 小地圖座標(圓心為原點，CSS px) */
export function worldToMap(x: number, z: number, cx: number, cz: number, scale: number, rot: number): [number, number] {
  const dx = (x - cx) * scale;
  const dy = (z - cz) * scale;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [dx * c - dy * s, dx * s + dy * c];
}

/** 離屏快取涵蓋的世界範圍(正方形,中心 cx, cz,半邊長 half) */
export interface CacheWindow {
  cx: number;
  cz: number;
  half: number;
}

/** 可視圓(半徑 viewR 公尺)只要有一點超出快取範圍就要重畫 */
export function needsRedraw(cache: CacheWindow | null, x: number, z: number, viewR: number) {
  if (!cache) return true;
  return Math.abs(x - cache.cx) + viewR > cache.half || Math.abs(z - cache.cz) + viewR > cache.half;
}

export interface LabelCandidate {
  name: string;
  /** 0 = 一般道路;1–4 = 主要道路等級 */
  rank: number;
  x: number;
  z: number;
  /** 道路在這一點的方向(世界座標的角度 atan2(dz, dx)) */
  ang: number;
  /** 以這一點為中心，沿道路能放多長的字(公尺):到所在路段兩端較近距離的 2 倍 */
  room: number;
}

/** 相鄰路段方向差在這個角度以內，就當成同一段直線(放路名用) */
const STRAIGHT_DEG = 15;
/** 直線段長度至少要是字寬的幾倍 */
const ROOM_RATIO = 0.6;

/**
 * 快取範圍內有名字的道路(含一般道路)。先把同一條路上方向幾乎不變的相鄰路段合併成「直線段」,
 * 再沿直線段約每 30 m 取一個候選點(含中點);room = 沿線到直線段兩端較近距離的 2 倍。
 * (OSM 常把直路切成很多短段，只看單一路段的話，主要道路的長路名都放不下)
 */
export function labelCandidates(data: MapData, area: Rect): LabelCandidate[] {
  const out: LabelCandidate[] = [];
  const tol = (STRAIGHT_DEG * Math.PI) / 180;
  for (const r of data.roads) {
    if (!r.name || !overlaps(r.bbox, area)) continue;
    const n = r.pts.length / 2;
    let start = 0;
    while (start < n - 1) {
      // 從 start 往後延伸，直到方向偏離起始路段超過 tol
      const a0 = Math.atan2(r.pts[start * 2 + 3] - r.pts[start * 2 + 1], r.pts[start * 2 + 2] - r.pts[start * 2]);
      let end = start + 1;
      while (end < n - 1) {
        const a = Math.atan2(r.pts[end * 2 + 3] - r.pts[end * 2 + 1], r.pts[end * 2 + 2] - r.pts[end * 2]);
        let d = Math.abs(a - a0);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > tol) break;
        end++;
      }
      // 文字方向用直線段頭尾連線;候選點沿實際路線取(連線可能偏離彎曲的道路)
      const ang = Math.atan2(r.pts[end * 2 + 1] - r.pts[start * 2 + 1], r.pts[end * 2] - r.pts[start * 2]);
      const cum = [0];
      for (let i = start; i < end; i++) cum.push(cum[cum.length - 1] + Math.hypot(r.pts[i * 2 + 2] - r.pts[i * 2], r.pts[i * 2 + 3] - r.pts[i * 2 + 1]));
      const len = cum[cum.length - 1];
      // 取奇數個點，一定包含中點(最放得下長路名的位置);間距約 30 m
      const k = 2 * Math.floor(len / 60) + 1;
      for (let i = 0; i < k; i++) {
        const t = (i + 1) / (k + 1);
        const d = len * t;
        let j = 0;
        while (j < cum.length - 2 && cum[j + 1] < d) j++;
        const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
        const ia = (start + j) * 2;
        out.push({
          name: r.name,
          rank: r.rank,
          x: r.pts[ia] + (r.pts[ia + 2] - r.pts[ia]) * u,
          z: r.pts[ia + 1] + (r.pts[ia + 3] - r.pts[ia + 1]) * u,
          ang,
          room: 2 * len * Math.min(t, 1 - t),
        });
      }
      start = end;
    }
  }
  return out;
}

export interface PlacedLabel {
  name: string;
  rank: number;
  /** 世界座標與方向：挑好之後每幀用它重算畫面位置與角度，路名才會黏在道路上 */
  wx: number;
  wz: number;
  wang: number;
  x: number;
  y: number;
  /** 畫面上的文字角度(弧度),已轉成不會上下顛倒的範圍 [-π/2, π/2) */
  angle: number;
  w: number;
  h: number;
}

/** 讓文字保持正向可讀：角度轉到 [-π/2, π/2)。直向的路剛好落在 -π/2,字由下往上讀(和常見地圖 App 一樣) */
export function uprightAngle(a: number) {
  const eps = 1e-9;
  while (a >= Math.PI / 2 - eps) a -= Math.PI;
  while (a < -Math.PI / 2 - eps) a += Math.PI;
  return a;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

function corners(b: Box): [number, number][] {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const px = (u * b.w) / 2, py = (v * b.h) / 2;
    return [b.x + px * c - py * s, b.y + px * s + py * c];
  });
}

/** 兩個旋轉矩形是否重疊(分離軸定理) */
export function boxesOverlap(a: Box, b: Box) {
  const ca = corners(a), cb = corners(b);
  for (const ang of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
    const ax = Math.cos(ang), ay = Math.sin(ang);
    const pa = ca.map(([x, y]) => x * ax + y * ay);
    const pb = cb.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

/**
 * 挑出要顯示的路名，仿地圖 App 的排法：字沿著道路方向、不會上下顛倒。規則:
 * 1. 同一個路名只出現一次;候選點依離圓心距離排序，只考慮 maxR 以內的;
 * 2. 道路等級高的優先(主要道路 > 一般道路),同等級離圓心近的優先;
 * 3. 直線段要夠長(room ≥ 字寬 × ROOM_RATIO;字可以略長於這一段，因為道路通常在路口後繼續延伸);
 * 4. 字框四角都要在圓(半徑 radius)內，不能和已放的路名、圓心(車子)周圍的方框重疊;
 *    最近的點放不下就試次近的(每個路名最多試 TRIES 個點);最多 max 個。
 * rot 為 viewRotation;measure(name, rank) 回傳字寬(px)。
 */
export function pickLabels(
  cands: LabelCandidate[],
  toMap: (x: number, z: number) => [number, number],
  rot: number,
  scale: number,
  measure: (name: string, rank: number) => number,
  opts: { maxR: number; radius: number; max: number; height: (rank: number) => number; avoidCenter: number },
): PlacedLabel[] {
  const TRIES = 8;
  const byName = new Map<string, { rank: number; pts: (LabelCandidate & { d: number; mx: number; my: number })[] }>();
  for (const c of cands) {
    const [mx, my] = toMap(c.x, c.z);
    const d = Math.hypot(mx, my);
    if (d > opts.maxR) continue;
    let e = byName.get(c.name);
    if (!e) byName.set(c.name, (e = { rank: c.rank, pts: [] }));
    e.rank = Math.max(e.rank, c.rank);
    e.pts.push({ ...c, d, mx, my });
  }
  const groups = [...byName.entries()].map(([name, e]) => ({ name, rank: e.rank, pts: e.pts.sort((a, b) => a.d - b.d) }));
  groups.sort((a, b) => b.rank - a.rank || a.pts[0].d - b.pts[0].d);
  const placed: PlacedLabel[] = [];
  const center: Box = { x: 0, y: 0, w: opts.avoidCenter, h: opts.avoidCenter, angle: 0 };
  for (const g of groups) {
    if (placed.length >= opts.max) break;
    const w = measure(g.name, g.rank) + 6;
    const h = opts.height(g.rank);
    let tried = 0;
    for (const p of g.pts) {
      if (p.room * scale < w * ROOM_RATIO) continue;
      if (tried++ >= TRIES) break;
      const l: PlacedLabel = { name: g.name, rank: g.rank, wx: p.x, wz: p.z, wang: p.ang, x: p.mx, y: p.my, angle: uprightAngle(p.ang + rot), w, h };
      if (corners(l).some(([x, y]) => Math.hypot(x, y) > opts.radius - 3)) continue;
      if (boxesOverlap(l, center) || placed.some((q) => boxesOverlap(l, q))) continue;
      placed.push(l);
      break;
    }
  }
  return placed;
}

/** 車子箭頭的旋轉角(箭頭預設朝上):車頭朝上模式不轉;北朝上模式轉到車頭方向 */
export function arrowRotation(mode: MinimapMode, hx: number, hz: number) {
  return mode === 'heading' ? 0 : Math.atan2(hz, hx) + Math.PI / 2;
}

/** 北方標記在外圈上的位置(圓心為原點):rot 為 viewRotation,r 為外圈半徑 */
export function northMarker(rot: number, r: number): [number, number] {
  const [x, y] = worldToMap(0, -1, 0, 0, 1, rot);
  const l = Math.hypot(x, y) || 1;
  return [(x / l) * r, (y / l) * r];
}

/** 地標圖示上的字;沒有對應就用名稱第一個字 */
const LANDMARK_GLYPH: Record<string, string> = { opera: '歌', 'station-new': '站', 'station-old': '驛', 'city-hall': '府', council: '議' };
export const landmarkGlyph = (id: string, name: string) => LANDMARK_GLYPH[id] ?? name.slice(0, 1);
