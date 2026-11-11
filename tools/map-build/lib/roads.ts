// 道路:可行駛判定、路寬規則(建置端;帶狀路面網格在 src/world/gen/ribbon.ts)。
// 路寬預設值來自 production-plan.md §4.3(未經實測);政府路寬換算見 decisions/0011。
import type { Pt } from '../../../src/world/gen/geom';

export const DRIVABLE = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'living_street', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
  'tertiary_link',
]);

/** 雙向道路的預設總寬(公尺) */
const DEFAULT_WIDTH: Record<string, number> = {
  motorway: 24,
  trunk: 24,
  primary: 24,
  secondary: 18,
  tertiary: 12,
  unclassified: 7,
  residential: 7,
  living_street: 6,
  service: 4.5,
  motorway_link: 7,
  trunk_link: 7,
  primary_link: 7,
  secondary_link: 7,
  tertiary_link: 7,
};

const LANE_WIDTH = 3.3;
const SHOULDER = 1.0;

export function isDrivable(tags: Record<string, string>): boolean {
  if (!DRIVABLE.has(tags.highway)) return false;
  if (tags.area === 'yes') return false;
  if (tags.access === 'no' || tags.access === 'private') return false;
  if (tags.highway === 'service' && (tags.service === 'parking_aisle' || tags.service === 'drive-through')) return false;
  return true;
}

export function isOneway(tags: Record<string, string>): boolean {
  return tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === '-1' || tags.junction === 'roundabout';
}

/**
 * 路寬規則:
 * 1. overrides(依 OSM id)優先
 * 2. 有 lanes 標籤:車道數 × 3.3 m + 路肩 1 m
 * 3. 依道路等級的預設總寬;單行道(非匝道)取一半,最少 4.5 m
 */
export function roadWidth(id: number, tags: Record<string, string>, overrides: Record<string, number>): number {
  if (overrides[String(id)]) return overrides[String(id)];
  const lanes = parseFloat(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return lanes * LANE_WIDTH + SHOULDER;
  const base = DEFAULT_WIDTH[tags.highway] ?? 7;
  if (isOneway(tags) && !tags.highway.endsWith('_link')) return Math.max(4.5, base / 2);
  return base;
}

/** 這些路段不套政府路寬(調查報告 docs/research/road-width-data.md §5:容易抓到旁邊道路的寬度) */
function govExcluded(tags: Record<string, string>): boolean {
  if (tags.highway === 'trunk' || tags.highway.endsWith('_link')) return true;
  if (tags.bridge && tags.bridge !== 'no') return true;
  return parseFloat(tags.layer) > 0;
}

/** 單側人行道寬(公尺),依政府計畫路寬分級;巷弄(< 8 m)不畫。數值為 Claude 的初值,建全區時依截圖調整(0011) */
export function sidewalkForGov(gov: number): number {
  if (gov < 8) return 0;
  if (gov < 12) return 1.5;
  if (gov < 20) return 2.5;
  return 4;
}

export interface WidthResult {
  width: number; // 路面寬
  sidewalk: number; // 單側人行道寬,0 = 不畫
  from: 'gov' | 'default' | 'override';
  /** 用政府路寬時:政府寬扣掉兩側人行道後的「整條路」路面寬,之後依平行 way 數平分(splitWidth) */
  carriage?: number;
}

/** 單一 way 的路面寬上下限(公尺) */
const MIN_WIDTH = 3;
const MAX_WIDTH = 30;

/**
 * 道路寬度(decisions/0011 (a)):
 * - 手動 override 優先
 * - 有政府路寬且不在排除名單:整條路的路面 = 政府寬 − 2 × 人行道(carriage);
 *   同一條路在 OSM 拆成幾條平行 way(分隔幹道、快慢車道)時,建置端再用 splitWidth() 平分
 * - 其餘用 roadWidth() 的預設規則,人行道沿用 M0 的 2.5 m
 * service、living_street、匝道一律不畫人行道。
 */
export function resolveWidth(
  id: number,
  tags: Record<string, string>,
  overrides: Record<string, number>,
  gov: Record<string, { w: number }>,
): WidthResult {
  const noSidewalk = ['service', 'living_street'].includes(tags.highway) || tags.highway.endsWith('_link');
  if (overrides[String(id)]) return { width: overrides[String(id)], sidewalk: noSidewalk ? 0 : 2.5, from: 'override' };
  const g = gov[String(id)]?.w;
  const unnamedWide = !tags.name && g >= 20;
  if (g && !govExcluded(tags) && !unnamedWide) {
    const sw = noSidewalk ? 0 : sidewalkForGov(g);
    const carriage = g - 2 * sw;
    return { width: splitWidth(carriage, 1), sidewalk: sw, from: 'gov', carriage };
  }
  return defaultWidth(id, tags, overrides);
}

export function defaultWidth(id: number, tags: Record<string, string>, overrides: Record<string, number>): WidthResult {
  const noSidewalk = ['service', 'living_street'].includes(tags.highway) || tags.highway.endsWith('_link');
  return { width: roadWidth(id, tags, overrides), sidewalk: noSidewalk ? 0 : 2.5, from: 'default' };
}

/** 整條路的路面寬平分給 n 條平行 way */
export function splitWidth(carriage: number, n: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, carriage / Math.max(1, n)));
}

// ---- 平行 way 與沿河道路的判定(建置端,幾何以世界座標公尺計) ----

/** 折線上依長度比例 t(0–1)取點與該處方向 */
export function sampleAt(line: Pt[], t: number): { p: Pt; dir: Pt } {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let target = total * t;
  for (let i = 1; i < line.length; i++) {
    const dx = line[i][0] - line[i - 1][0];
    const dz = line[i][1] - line[i - 1][1];
    const l = Math.hypot(dx, dz);
    if (target <= l || i === line.length - 1) {
      const k = l > 0 ? Math.min(1, target / l) : 0;
      return { p: [line[i - 1][0] + dx * k, line[i - 1][1] + dz * k], dir: l > 0 ? [dx / l, dz / l] : [1, 0] };
    }
    target -= l;
  }
  return { p: line[0], dir: [1, 0] };
}

/**
 * 點到折線的最近距離、最近那一段的方向,以及最近點是否落在折線端點外(atEnd)。
 * atEnd 時代表 p 不在 line 的「旁邊」而是在它前後的延長方向(例如同一條路前後相接的下一段)。
 */
export function nearestOnLine(p: Pt, line: Pt[]): { d: number; dir: Pt; atEnd: boolean } {
  let best = { d: Infinity, dir: [1, 0] as Pt, atEnd: false };
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const dx = line[i][0] - ax;
    const dz = line[i][1] - az;
    const l2 = dx * dx + dz * dz;
    const raw = l2 > 0 ? ((p[0] - ax) * dx + (p[1] - az) * dz) / l2 : 0;
    const t = Math.max(0, Math.min(1, raw));
    const d = Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t));
    if (d < best.d) {
      const l = Math.sqrt(l2) || 1;
      best = { d, dir: [dx / l, dz / l], atEnd: (i === 1 && raw < 0) || (i === line.length - 1 && raw > 1) };
    }
  }
  return best;
}

const SAMPLES = [0.25, 0.5, 0.75];
/** 方向夾角在 ±25° 內(或反向)視為平行 */
const PARALLEL_COS = Math.cos((25 * Math.PI) / 180);

/** other 是否在 line 旁 radius 內平行(3 個取樣點中至少 2 個符合;前後相接的同名路段不算) */
export function runsAlongside(line: Pt[], other: Pt[], radius: number): boolean {
  let hits = 0;
  for (const t of SAMPLES) {
    const { p, dir } = sampleAt(line, t);
    const n = nearestOnLine(p, other);
    if (n.d <= radius && !n.atEnd && Math.abs(dir[0] * n.dir[0] + dir[1] * n.dir[1]) >= PARALLEL_COS) hits++;
  }
  return hits >= 2;
}
