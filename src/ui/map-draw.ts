// 小地圖與大地圖共用的底圖畫法(decisions/0037):綠地、水面、水道、一般道路、主要道路(先畫邊框再畫填色)。
// g 已設好「世界座標 → 畫布」的轉換;scale = 每公尺幾個 CSS px(線寬下限用)。
import { PALETTE } from '../config/palette';
import { overlaps, type MapData, type Rect } from './minimap-core';

export const MAP_COLORS = {
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
export const MAP_FONT = "'jf-openhuninn', 'PingFang TC', 'Noto Sans TC', sans-serif";

export function drawMapBase(g: CanvasRenderingContext2D, data: MapData, area: Rect, scale: number) {
  const C = MAP_COLORS;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const areaColor = [PALETTE.park, PALETTE.pitch, PALETTE.water];
  for (const a of data.areas) {
    if (!overlaps(a.bbox, area)) continue;
    g.beginPath();
    for (let i = 0; i + 1 < a.ring.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, a.ring[i], a.ring[i + 1]);
    g.closePath();
    g.fillStyle = areaColor[a.k];
    g.fill();
  }
  g.strokeStyle = PALETTE.water;
  for (const w of data.waterways) {
    if (!overlaps(w.bbox, area)) continue;
    g.lineWidth = Math.max(w.width, 2 / scale);
    stroke(g, w.pts);
  }
  g.strokeStyle = C.minor;
  for (const r of data.roads) {
    if (r.rank || !overlaps(r.bbox, area)) continue;
    g.lineWidth = Math.max(r.width, 1.4 / scale);
    stroke(g, r.pts);
  }
  const majors = data.roads.filter((r) => r.rank && overlaps(r.bbox, area));
  g.strokeStyle = C.majorEdge;
  for (const r of majors) {
    g.lineWidth = Math.max(r.width, 3 / scale) + 1.6 / scale;
    stroke(g, r.pts);
  }
  g.strokeStyle = C.major;
  for (const r of majors) {
    g.lineWidth = Math.max(r.width, 3 / scale);
    stroke(g, r.pts);
  }
}

function stroke(g: CanvasRenderingContext2D, pts: Float32Array) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}

/** 車子箭頭(原點為車子,已轉到車頭方向) */
export function drawCarArrow(g: CanvasRenderingContext2D, size = 1) {
  g.beginPath();
  g.moveTo(0, -9 * size);
  g.lineTo(7 * size, 7 * size);
  g.lineTo(0, 3 * size);
  g.lineTo(-7 * size, 7 * size);
  g.closePath();
  g.fillStyle = MAP_COLORS.car;
  g.lineWidth = 2.5;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fill();
}

/** 圓形圖示 + 一個字 */
export function drawGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, glyph: string, fill: string, edge: string, text: string, edgeW: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = edgeW;
  g.strokeStyle = edge;
  g.stroke();
  g.fillStyle = text;
  g.font = `700 ${Math.round(r * 1.2)}px ${MAP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, x, y + 0.5);
}
