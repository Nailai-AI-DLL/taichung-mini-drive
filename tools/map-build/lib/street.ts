// 街道細節生成(建置端,decisions/0015):縱向標線、停止線、枕木紋行人穿越道、分隔島。
// 輸入是 OSM 道路與穿越道(含 node id,用來找路口);輸出不量化,由 build.ts 量化後寫進 world.json。
import {
  ANTI_PARALLEL, BAR_LEN, MEDIAN_NOSE, CENTER_MIN_W, CONTINUE_SIN, CROSSWALK_MAX_H, DOUBLE_GAP, EDGE_INSET, EDGE_W, PAVE_BAND_REACH,
  JUNCTION_PAD, PAVE_MAX_GAP, PAVE_OVERLAP, PAVE_STEP,
  LANE, LANE_MAX, LANE_MIN, LINE_W, MARK_MIN_W, MEDIAN_MAX, MEDIAN_MIN, MEDIAN_PROBE, MIN_SIN, PAIR_BREAK, PAIR_STEP, SLOW_LANE_MIN, YELLOW_SIMPLIFY, YELLOW_SMOOTH,
  STOP_CLEAR, STOP_END_MIN, STOP_MIN_W, STOP_W, STRIP_MIN_LEN, ZONE_MAX, ZONE_MERGE,
} from '../../../src/config/street';
import { pointInPolygon, type Pt } from '../../../src/world/gen/geom';
import { cumLength, leftNormal, pointAt, sliceLine } from '../../../src/world/gen/polyline';

export interface StreetWay {
  id: number;
  name: string;
  highway: string;
  oneway: boolean;
  width: number;
  sidewalk: number;
  /** 每向車道數(臺中市道路圖,decisions/0046);沒有就依路寬推算 */
  lanes?: number;
  /** 與 line 一一對應;單行道已轉成行車方向 */
  nodes: number[];
  line: Pt[];
}

export interface StreetCrossing {
  id: number;
  nodes: number[];
  line: Pt[];
  /** OSM crossing=traffic_signals(第四批放號誌桿用) */
  signals?: boolean;
}

export interface Mark {
  c: 0 | 1;
  d: 0 | 1;
  w: number; // 公尺
  o: number; // 往左平移(公尺)
}

export interface StreetResult {
  strips: { pts: Pt[]; m: Mark[]; way: number }[];
  /** reach = 中心到路緣沿穿越方向的距離(不設上限);sig = 有號誌 */
  crosswalks: { p: Pt; v: number; u: number; h: number; way: number; reach: number; sig: boolean }[];
  medians: { pts: Pt[]; ws: number[] }[];
  junctions: Pt[][];
  /**
   * 進入路口的方向(畫停止線的地方;路燈減量 + 每個路口放號誌,Cooper 2026-11-12)。
   * p = 停止線與行車方向右側路緣的交點,dir = 行車方向,half = 路面半寬,highway / name 給號誌篩選用
   */
  approaches?: { p: Pt; dir: Pt; half: number; way: number; highway: string; name: string }[];
  /**
   * 單行道左側緊貼對向車道時,車道從哪裡開始往右排(OSM way id → 相對中心線往右的距離,公尺;負 = 中心線左側)。
   * 其他車輛的車道位置要和標線一致(0046 驗收:不考慮時最多偏 6 m)
   */
  laneStart?: Record<number, number>;
}

/** 巷弄、服務道路不畫標線,也不會切斷別條路的標線 */
const MINOR = new Set(['service', 'living_street']);
const isMinor = (w: StreetWay) => MINOR.has(w.highway);

/** OSM 穿越道是否有畫線(沒標記的當成有畫;明確標示沒畫的排除) */
export function crossingMarked(tags: Record<string, string>): boolean {
  if (tags.footway !== 'crossing' && tags.highway !== 'crossing') return false;
  if (tags['crossing:markings'] === 'no' || tags.crossing === 'unmarked' || tags.crossing === 'no') return false;
  return true;
}

function tangentAt(line: Pt[], i: number): Pt {
  const a = line[Math.max(0, i - 1)];
  const b = line[Math.min(line.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
/** 雙黃線的半寬:中線到外側黃線外緣 */
const YELLOW_HALF = LINE_W + DOUBLE_GAP / 2;

interface Zone {
  s0: number;
  s1: number;
  /** 進入這個範圍前要畫停止線(橫交道路夠寬,或有行人穿越道) */
  stop: boolean;
}

/**
 * 依路寬決定要畫哪些縱向標線(左正右負的平移量);規則見 src/config/street.ts 的「推論」。
 * shared:單行道左側緊貼對向車道(OSM 把一條雙向路畫成兩條單行 way,中間沒有分隔島)時,
 * 兩條路的分界離中心線最近多遠。雙黃線另外沿兩條路的中線畫(pairYellow),這裡只從分界往右排車道。
 */
export function lanePlan(w: Pick<StreetWay, 'width' | 'oneway' | 'sidewalk' | 'lanes'>, shared?: number): Mark[] {
  const W = w.width;
  if (W < MARK_MIN_W) return [];
  const half = W / 2;
  const out: Mark[] = [];
  const white = (o: number, dashed: boolean, width = LINE_W): Mark => ({ c: 0, d: dashed ? 1 : 0, w: width, o });
  // 從內側(雙向:中線;單行:左緣)往外排車道;剩下夠寬就是機慢車道
  // 有道路圖車道數(0046)就照它排,車道寬 = 路面 ÷ 車道數(限制在 LANE_MIN–LANE_MAX);沒有就每 LANE 公尺一條
  const lanesFrom = (inner: number, outer: number, sign: 1 | -1) => {
    const room = Math.abs(outer - inner);
    let lanes = Math.max(1, Math.floor(room / LANE));
    let lw = LANE;
    if (w.lanes) {
      lanes = Math.max(1, Math.min(w.lanes, Math.floor(room / LANE_MIN)));
      lw = Math.min(LANE_MAX, room / lanes);
    }
    for (let k = 1; k < lanes; k++) out.push(white(inner + sign * k * lw, true));
    if (room - lanes * lw >= SLOW_LANE_MIN) out.push(white(inner + sign * lanes * lw, false));
    return lanes;
  };
  if (w.oneway && shared !== undefined) {
    lanesFrom(shared - YELLOW_HALF, -half + EDGE_INSET, -1);
    if (w.sidewalk <= 0) out.push(white(-half + EDGE_INSET, false, EDGE_W));
    return out;
  }
  if (w.oneway) {
    lanesFrom(half - EDGE_INSET, -half + EDGE_INSET, -1);
  } else {
    if (W < CENTER_MIN_W) return [];
    const lanes = Math.min(lanesFrom(0, half - EDGE_INSET, 1), lanesFrom(0, -half + EDGE_INSET, -1));
    if (lanes >= 2) {
      const d = (LINE_W + DOUBLE_GAP) / 2;
      out.push({ c: 1, d: 0, w: LINE_W, o: d }, { c: 1, d: 0, w: LINE_W, o: -d });
    } else out.push({ c: 1, d: 1, w: LINE_W, o: 0 });
  }
  if (w.sidewalk <= 0) out.push(white(half - EDGE_INSET, false, EDGE_W), white(-half + EDGE_INSET, false, EDGE_W));
  return out;
}

export function generateStreet(ways: StreetWay[], crossings: StreetCrossing[]): StreetResult {
  const nodeWays = new Map<number, number[]>();
  ways.forEach((w, i) => {
    for (const n of w.nodes) {
      const arr = nodeWays.get(n) ?? [];
      if (!arr.includes(i)) arr.push(i);
      nodeWays.set(n, arr);
    }
  });
  const cums = ways.map((w) => cumLength(w.line));
  const zones: Zone[][] = ways.map(() => []);
  /** 路口鋪面用:每條路在每個(夾角 ≥ 30° 的)路口 node 上,橫交道路路面佔的長度(不含 pad) */
  const hits: Hit[] = [];
  /** 每條路上枕木紋佔的範圍:中心 s ± half(沿道路方向) */
  const bands: { s: number; half: number }[][] = ways.map(() => []);

  // ---- 路口範圍:橫交道路的半寬 + JUNCTION_PAD,斜交時依角度放大;同一條路的延續不算(判定見 CONTINUE_SIN) ----
  const isEnd = (w: StreetWay, node: number) => w.nodes[0] === node || w.nodes[w.nodes.length - 1] === node;
  ways.forEach((x, xi) => {
    if (isMinor(x)) return;
    x.nodes.forEach((node, i) => {
      const others = (nodeWays.get(node) ?? []).filter((j) => j !== xi && !isMinor(ways[j]));
      if (!others.length) return;
      // 只有兩條一般道路頭尾相接:換段改名或過橋,不是路口
      const endToEnd = others.length === 1 && isEnd(x, node) && isEnd(ways[others[0]], node);
      const tx = tangentAt(x.line, i);
      let r = 0;
      let core = 0;
      let wide = false;
      const crossers: number[] = [];
      for (const j of others) {
        const o = ways[j];
        const to = tangentAt(o.line, o.nodes.indexOf(node));
        const sin = Math.abs(cross(tx, to));
        if (sin < CONTINUE_SIN && (o.name === x.name || endToEnd)) continue;
        // 橫交道路的路面在 X 的中心線上佔 (半寬 + pad) / sin;X 兩側的標線離中心線 X 半寬,斜交時還要再往外 X 半寬 · |cos| / sin
        const cos = Math.abs(tx[0] * to[0] + tx[1] * to[1]);
        const sn = Math.max(sin, MIN_SIN);
        r = Math.max(r, Math.min(ZONE_MAX, (o.width / 2 + JUNCTION_PAD + (x.width / 2) * cos) / sn));
        // 淺角(< 30°)的分岔、匯入只切斷標線,不畫停止線
        if (o.width >= STOP_MIN_W && sin >= CONTINUE_SIN) wide = true;
        if (sin >= CONTINUE_SIN) {
          core = Math.max(core, Math.min(ZONE_MAX, (o.width / 2 + (x.width / 2) * cos) / sin));
          crossers.push(j);
        }
      }
      if (core > 0) hits.push({ node, p: x.line[i], xi, s: cums[xi][i], r: core, crossers });
      if (r > 0) zones[xi].push({ s0: cums[xi][i] - r, s1: cums[xi][i] + r, stop: wide && x.width >= STOP_MIN_W });
    });
  });

  // ---- 行人穿越道:OSM 穿越道與道路共用的 node 就是穿越點 ----
  const crosswalks: StreetResult['crosswalks'] = [];
  for (const c of crossings) {
    c.nodes.forEach((node, k) => {
      // 穿越點可能剛好是同一條路兩段 way 的接點:枕木紋畫一次,但每一段都要讓出範圍
      const xs = (nodeWays.get(node) ?? []).filter((j) => !isMinor(ways[j]) && ways[j].width >= MARK_MIN_W);
      const v = tangentAt(c.line, k);
      let drawn = false;
      for (const xi of xs) {
        const x = ways[xi];
        const i = x.nodes.indexOf(node);
        const u = tangentAt(x.line, i);
        const sin = Math.abs(cross(u, v));
        if (sin < MIN_SIN) continue;
        const h = Math.min(CROSSWALK_MAX_H, x.width / 2 / sin);
        if (!drawn) crosswalks.push({ p: x.line[i], v: Math.atan2(v[1], v[0]), u: Math.atan2(u[1], u[0]), h, way: x.id, reach: x.width / 2 / sin, sig: !!c.signals });
        drawn = true;
        // 行人穿越道前後(含停止線淨距)也不畫縱向標線。斜的穿越道沿道路方向佔得比較長:±(h·|cos| + 枕木線長 / 2)
        const s = cums[xi][i];
        const band = h * Math.abs(u[0] * v[0] + u[1] * v[1]) + BAR_LEN / 2;
        bands[xi].push({ s, half: band });
        zones[xi].push({ s0: s - band - STOP_CLEAR, s1: s + band + STOP_CLEAR, stop: x.width >= STOP_MIN_W });
      }
    });
  }

  // ---- 對向車道配對(分隔島、緊貼時的雙黃線)----
  const pairs = pairSamples(ways, cums);

  // ---- 縱向標線與停止線 ----
  const strips: StreetResult['strips'] = [];
  const approaches: NonNullable<StreetResult['approaches']> = [];
  const laneStart: Record<number, number> = {};
  ways.forEach((x, xi) => {
    if (isMinor(x)) return;
    const cum = cums[xi];
    const len = cum[cum.length - 1];
    const merged = mergeZones(zones[xi]);
    // 一半以上的取樣點在左側緊貼(或重疊)對向車道:分界取路口範圍外兩條中心線最近距離的一半,
    // 車道線從這裡往右排,才不會越過中線
    const ps = pairs[xi].filter((p) => !merged.some((z) => p.s >= z.s0 && p.s <= z.s1));
    const touching = ps.filter(isTouching);
    const shared = ps.length && touching.length * 2 >= ps.length ? Math.min(x.width / 2, Math.min(...touching.map((p) => p.d)) / 2) : undefined;
    if (shared !== undefined) {
      strips.push(...pairYellow(x, ps));
      // lanePlan 的單行 + shared:左緣 = shared − YELLOW_HALF(左正右負)→ 往右的距離取負號
      if (x.oneway) laneStart[x.id] = -(shared - YELLOW_HALF);
    }
    const plan = lanePlan(x, shared);
    if (!plan.length) return;
    // 路口範圍之外的區間
    let at = 0;
    const gaps: { a: number; b: number; stopA: boolean; stopB: boolean }[] = [];
    let prevStop = false;
    for (const z of [...merged, { s0: len, s1: len, stop: false }]) {
      if (z.s0 > at) gaps.push({ a: at, b: Math.min(z.s0, len), stopA: prevStop, stopB: z.stop });
      at = Math.max(at, z.s1);
      prevStop = z.stop;
      if (at >= len) break;
    }
    const half = x.width / 2;
    for (const g of gaps) {
      // 停止線:順向在區間尾端(進入路口前)、雙向道的對向在區間開頭;停止線佔用的長度不畫縱向線
      const stopB = g.stopB && g.b < len - STOP_END_MIN;
      const stopA = g.stopA && !x.oneway && g.a > STOP_END_MIN;
      const a = g.a + (stopA ? STOP_W : 0);
      const b = g.b - (stopB ? STOP_W : 0);
      if (b - a < STRIP_MIN_LEN) continue;
      strips.push({ pts: sliceLine(x.line, cum, a, b), m: plan, way: x.id });
      const stopLine = (s: number, from: number, to: number) => {
        const { p, dir } = pointAt(x.line, cum, s);
        const n = leftNormal(dir);
        strips.push({ pts: [[p[0] + n[0] * from, p[1] + n[1] * from], [p[0] + n[0] * to, p[1] + n[1] * to]], m: [{ c: 0, d: 0, w: STOP_W, o: 0 }], way: x.id });
      };
      // 停止線橫跨行車方向的車道:單行道整個路面,雙向道只有右半邊(台灣靠右行駛)
      if (stopB) stopLine(b + STOP_W / 2, !x.oneway ? 0 : shared !== undefined ? shared - YELLOW_HALF : half - EDGE_INSET, -half + EDGE_INSET);
      if (stopA) stopLine(a - STOP_W / 2, 0, half - EDGE_INSET);
      // 進入路口的方向:順向在 b(右側 = −左法向量),雙向道的對向在 a(行車方向相反,右側 = +左法向量)
      const approach = (s: number, fwd: boolean) => {
        const { p, dir } = pointAt(x.line, cum, s);
        const n = leftNormal(dir);
        const k = fwd ? -half : half;
        approaches.push({ p: [p[0] + n[0] * k, p[1] + n[1] * k], dir: fwd ? dir : [-dir[0], -dir[1]], half, way: x.id, highway: x.highway, name: x.name });
      };
      if (stopB) approach(b + STOP_W / 2, true);
      if (stopA) approach(a - STOP_W / 2, false);
    }
  });

  // 分隔島只在路口路面與枕木紋本身讓開(真實的分隔島頭停在穿越道邊),不像標線還要讓出停止線的距離
  // 單行道上「只從外側(右手邊)接進來、在這裡結束」的 T 字路口不會穿過分隔帶,分隔島照樣連續;其他路口都讓開
  const throughGap = (h: Hit) => {
    const x = ways[h.xi];
    if (!x.oneway) return true;
    const n = leftNormal(tangentAt(x.line, x.nodes.indexOf(h.node)));
    return !h.crossers.every((c) => {
      const o = ways[c];
      const k = o.nodes.indexOf(h.node);
      if (k !== 0 && k !== o.nodes.length - 1) return false;
      const next = o.line[k === 0 ? 1 : k - 1];
      return (next[0] - o.line[k][0]) * n[0] + (next[1] - o.line[k][1]) * n[1] < 0;
    });
  };
  const keepOut: Zone[][] = ways.map((_, xi) => [
    ...hits.filter((h) => h.xi === xi && throughGap(h)).map((h) => ({ s0: h.s - h.r, s1: h.s + h.r, stop: false })),
    ...bands[xi].map((b) => ({ s0: b.s - b.half - MEDIAN_NOSE, s1: b.s + b.half + MEDIAN_NOSE, stop: false })),
  ]);
  const junctions = junctionPatches(ways, cums, hits, bands);
  return { strips, crosswalks, medians: clipMedians(medians(ways, cums, keepOut, pairs, new SegmentGrid(ways)), junctions), junctions, approaches, laneStart };
}

/**
 * 路口鋪面:只補「同一條路平行的兩條單行道之間的空隙」穿過路口的那一段(含旁邊的枕木紋),其他地方一律不動。
 * 空隙可以是兩向之間(分隔島)或同向快慢車道之間(快慢分隔島,例:臺灣大道)。
 * 對每條單行道 X 與它同名、平行的其他 way(多條短 way 當成一條路;兩側各做一次):
 *   只看「同一條橫交道路兩向都接到」的路口(十字路口、分隔島迴轉缺口;只從外側接進來的 T 字路口不算);
 *   X 上的路口範圍 = X 自己的路口 node ± 橫交道路佔的長度,聯集 Y 的路口範圍投影到 X 上,再延伸到相鄰的枕木紋;
 *   沿 X 每 PAVE_STEP 公尺取 X 的內緣點與 Y 的內緣點,圍成一塊多邊形。
 * 2026-10-31 第一版用整個路口的凸包,驗收量到 10.9% 鋪到人行道、空地、綠地、梅川、建築,改成這個做法。
 */
function junctionPatches(ways: StreetWay[], cums: number[][], hits: Hit[], bands: { s: number; half: number }[][]): Pt[][] {
  const hitsOf = ways.map(() => [] as Hit[]);
  for (const h of hits) hitsOf[h.xi].push(h);
  const byName = new Map<string, number[]>();
  ways.forEach((w, i) => {
    if (w.oneway && w.name && !isMinor(w)) byName.set(w.name, [...(byName.get(w.name) ?? []), i]);
  });
  const out: Pt[][] = [];
  ways.forEach((x, xi) => {
    const sibs = (byName.get(x.name) ?? []).filter((j) => j !== xi);
    if (!x.oneway || isMinor(x) || !sibs.length) return;
    const cum = cums[xi];
    const len = cum[cum.length - 1];
    // 只有同一條橫交道路也接到這條路的其他平行 way(真的十字路口,或分隔島迴轉缺口)才打開空隙;
    // 只從外側接進來的 T 字路口,分隔島照樣連續
    const xCross = new Set(hitsOf[xi].flatMap((h) => h.crossers));
    const sCross = new Set(sibs.flatMap((j) => hitsOf[j].flatMap((h) => h.crossers)));
    const names = (h: Hit) => new Set(h.crossers.map((c) => ways[c].name).filter(Boolean));
    const iv: PaveZone[] = hitsOf[xi].filter((h) => h.crossers.some((c) => sCross.has(c))).map((h) => ({ s0: h.s - h.r, s1: h.s + h.r, names: names(h) }));
    for (const j of sibs)
      for (const h of hitsOf[j]) {
        if (!h.crossers.some((c) => xCross.has(c))) continue;
        const { p: py, dir: dy } = pointAt(ways[j].line, cums[j], h.s);
        const ends = [-h.r, h.r].map((t) => projectS(x.line, cum, [py[0] + dy[0] * t, py[1] + dy[1] * t]));
        if (ends.every((e) => e.d < x.width / 2 + ways[j].width / 2 + PAVE_MAX_GAP))
          iv.push({ s0: Math.min(ends[0].s, ends[1].s), s1: Math.max(ends[0].s, ends[1].s), names: names(h) });
      }
    // 只合併重疊的範圍,或同一條橫交道路(同名)兩向車道各自的範圍(中間是它的分隔帶,也在路口裡);
    // 不同路的兩個路口之間的空隙(可能是分隔島、綠帶或河,例:梅川東路與梅川西路之間)不鋪
    for (const z of mergePave(iv)) {
      let a = z.s0, b = z.s1;
      for (const band of bands[xi])
        // 和原本的路口範圍比(不是和延伸後的比),一個接一個延伸會把隔壁路口的穿越道也串進來
        if (band.s + band.half >= z.s0 - PAVE_BAND_REACH && band.s - band.half <= z.s1 + PAVE_BAND_REACH) {
          a = Math.min(a, band.s - band.half);
          b = Math.max(b, band.s + band.half);
        }
      a = Math.max(0, a);
      b = Math.min(len, b);
      if (b - a < 1) continue;
      // 對向(分隔島)與同向(快慢分隔島)各自一串;每個取樣點找最近的平行 way(多條短 way 當成一條路)
      for (const anti of [true, false]) {
        // 每兩個相鄰取樣點輸出一塊四邊形:最近的平行 way 會在短 way 之間切換,整串圍成一圈可能自我相交
        let prev: [Pt, Pt] | null = null;
        const flush = () => (prev = null);
        for (let s = a; ; s = Math.min(b, s + PAVE_STEP)) {
          const { p, dir } = pointAt(x.line, cum, s);
          let best: { pr: ReturnType<typeof projectS>; y: StreetWay } | null = null;
          for (const j of sibs) {
            const y = ways[j];
            const pr = projectS(y.line, cums[j], p);
            // 投影被夾到端點 = 不是並排(例:頭尾相接的同一條路),不算平行
            if (pr.end) continue;
            const dy = pointAt(y.line, cums[j], pr.s).dir;
            const dot = dir[0] * dy[0] + dir[1] * dy[1];
            if (anti ? dot >= ANTI_PARALLEL : dot <= -ANTI_PARALLEL) continue;
            if (!best || pr.d < best.pr.d) best = { pr, y };
          }
          const gap = best ? best.pr.d - x.width / 2 - best.y.width / 2 : -1;
          // 兩側都產生(重疊處同色同高看不出來):OSM 在路口常把一條路切成好幾段短 way,只從一側產生會漏
          if (!best || gap <= 0.05 || gap > PAVE_MAX_GAP) flush();
          else {
            const { pr, y } = best;
            const toY: Pt = [(pr.q[0] - p[0]) / pr.d, (pr.q[1] - p[1]) / pr.d];
            // 往兩邊路面內多蓋 PAVE_OVERLAP:鋪面和路面同色同高,重疊看不出來,邊緣才不會留下細縫
            const cur: [Pt, Pt] = [
              [p[0] + toY[0] * (x.width / 2 - PAVE_OVERLAP), p[1] + toY[1] * (x.width / 2 - PAVE_OVERLAP)],
              [pr.q[0] - toY[0] * (y.width / 2 - PAVE_OVERLAP), pr.q[1] - toY[1] * (y.width / 2 - PAVE_OVERLAP)],
            ];
            if (prev) out.push([prev[0], cur[0], cur[1], prev[1]]);
            prev = cur;
          }
          if (s >= b) break;
        }
        flush();
      }
    }
  });
  return out;
}

interface PaveZone {
  s0: number;
  s1: number;
  /** 造成這段範圍的橫交道路名稱 */
  names: Set<string>;
}

function mergePave(zs: PaveZone[]): PaveZone[] {
  const out: PaveZone[] = [];
  for (const z of [...zs].sort((a, b) => a.s0 - b.s0)) {
    const last = out[out.length - 1];
    const sameRoad = last && [...z.names].some((n) => last.names.has(n));
    if (last && (z.s0 <= last.s1 || (sameRoad && z.s0 - last.s1 <= PAVE_MAX_GAP))) {
      last.s1 = Math.max(last.s1, z.s1);
      for (const n of z.names) last.names.add(n);
    } else out.push({ ...z, names: new Set(z.names) });
  }
  return out;
}

/** 某條路在某個路口 node 上:橫交道路佔的長度 r(不含 pad)、有哪些橫交道路(夾角 ≥ 30°) */
interface Hit {
  node: number;
  p: Pt;
  xi: number;
  s: number;
  r: number;
  crossers: number[];
}

/** 分隔島落在路口鋪面裡的點拿掉(兩套判定在少數複雜路口不一致時,以鋪面為準:路口中央不該有分隔島) */
function clipMedians(ms: StreetResult['medians'], junctions: Pt[][]): StreetResult['medians'] {
  const boxes = junctions.map((j) => {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, z] of j) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    return { j, minX, minZ, maxX, maxZ };
  });
  const S = 50;
  const grid = new Map<string, typeof boxes>();
  for (const b of boxes)
    for (let cx = Math.floor(b.minX / S); cx <= Math.floor(b.maxX / S); cx++)
      for (let cz = Math.floor(b.minZ / S); cz <= Math.floor(b.maxZ / S); cz++) grid.set(`${cx},${cz}`, [...(grid.get(`${cx},${cz}`) ?? []), b]);
  const inside = (p: Pt) =>
    (grid.get(`${Math.floor(p[0] / S)},${Math.floor(p[1] / S)}`) ?? []).some(
      (b) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ && pointInPolygon(p, b.j),
    );
  const out: StreetResult['medians'] = [];
  for (const m of ms) {
    let run: { pts: Pt[]; ws: number[] } = { pts: [], ws: [] };
    m.pts.forEach((p, i) => {
      if (inside(p)) {
        if (run.pts.length >= 2) out.push(run);
        run = { pts: [], ws: [] };
        return;
      }
      run.pts.push(p);
      run.ws.push(m.ws[i]);
    });
    if (run.pts.length >= 2) out.push(run);
  }
  return out;
}

/** 點 q 投影到折線上:長度座標 s、最近點、距離 */
function projectS(line: Pt[], cum: number[], q: Pt): { s: number; q: Pt; d: number; end: boolean } {
  let best = { s: 0, q: line[0], d: Infinity, end: false };
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const raw = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / l2;
    const t = Math.max(0, Math.min(1, raw));
    const p: Pt = [a[0] + ex * t, a[1] + ez * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    // end:投影落在整條折線的頭尾之外(被夾到端點),代表 q 不在這條線旁邊
    if (d < best.d) best = { s: cum[i] + t * (cum[i + 1] - cum[i]), q: p, d, end: (i === 0 && raw < 0) || (i === line.length - 2 && raw > 1) };
  }
  return best;
}

/** 道路線段的格網索引:查某點是否落在某條一般道路的路面上 */
class SegmentGrid {
  private cells = new Map<string, { w: number; a: Pt; b: Pt }[]>();
  private static SIZE = 50;

  constructor(private ways: StreetWay[]) {
    ways.forEach((w, wi) => {
      if (isMinor(w)) return;
      for (let i = 0; i + 1 < w.line.length; i++) {
        const [a, b] = [w.line[i], w.line[i + 1]];
        const pad = w.width / 2;
        for (const key of this.keys(Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad)) {
          const arr = this.cells.get(key) ?? [];
          arr.push({ w: wi, a, b });
          this.cells.set(key, arr);
        }
      }
    });
  }

  private *keys(x0: number, z0: number, x1: number, z1: number) {
    const S = SegmentGrid.SIZE;
    for (let cx = Math.floor(x0 / S); cx <= Math.floor(x1 / S); cx++) for (let cz = Math.floor(z0 / S); cz <= Math.floor(z1 / S); cz++) yield `${cx},${cz}`;
  }

  /** p 是否落在(exclude 以外的)道路路面上 */
  onRoad(p: Pt, exclude: Set<number>): boolean {
    const S = SegmentGrid.SIZE;
    for (const { w, a, b } of this.cells.get(`${Math.floor(p[0] / S)},${Math.floor(p[1] / S)}`) ?? []) {
      if (exclude.has(w)) continue;
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2));
      if (Math.hypot(a[0] + ex * t - p[0], a[1] + ez * t - p[1]) < this.ways[w].width / 2) return true;
    }
    return false;
  }
}

/** 緊貼(空隙 < MEDIAN_MIN 或重疊)且對向車道在左手邊(台灣靠右行駛) */
const isTouching = (p: PairSample) => p.gap < MEDIAN_MIN && p.left;

/**
 * 緊貼的對向車道之間的雙黃線:沿兩條中心線的中點畫,兩條黃線由同一條折線平移 ±(線寬 + 間隔) / 2,
 * 不論兩條 OSM 中心線平不平行、兩向路寬一不一樣,間距都是第 165 條的 10 cm。每對只從 id 較小的那條產生。
 */
function pairYellow(x: StreetWay, ps: PairSample[]): StreetResult['strips'] {
  const d = (LINE_W + DOUBLE_GAP) / 2;
  const m: Mark[] = [{ c: 1, d: 0, w: LINE_W, o: d }, { c: 1, d: 0, w: LINE_W, o: -d }];
  const out: StreetResult['strips'] = [];
  let run: Pt[] = [];
  let lastS = -Infinity;
  const flush = () => {
    if (run.length >= 2) out.push({ pts: simplifyLine(smoothLine(run, Math.round(YELLOW_SMOOTH / PAIR_STEP)), YELLOW_SIMPLIFY), m, way: x.id });
    run = [];
  };
  for (const p of ps) {
    const ok = isTouching(p) && p.y.id > x.id;
    if (!ok || p.s - lastS > PAIR_STEP * PAIR_BREAK) flush();
    if (!ok) continue;
    lastS = p.s;
    run.push([(p.p[0] + p.q[0]) / 2, (p.p[1] + p.q[1]) / 2]);
  }
  flush();
  return out;
}

/** 移動平均:每點取前後各 half 點的平均(靠近兩端時視窗跟著縮,兩端點不動) */
export function smoothLine(pts: Pt[], half: number): Pt[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const h = Math.min(half, i, n - 1 - i);
    let x = 0;
    let z = 0;
    for (let j = i - h; j <= i + h; j++) {
      x += pts[j][0];
      z += pts[j][1];
    }
    return [x / (2 * h + 1), z / (2 * h + 1)];
  });
}

/** Douglas–Peucker 簡化:保留頭尾,刪掉偏差 < tol 公尺的中間點 */
export function simplifyLine(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ex = pts[b][0] - pts[a][0];
    const ez = pts[b][1] - pts[a][1];
    const l = Math.hypot(ex, ez) || 1;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - pts[a][0]) * ez - (pts[i][1] - pts[a][1]) * ex) / l;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

interface PairSample {
  s: number;
  p: Pt;
  /** 對向車道上最近的點 */
  q: Pt;
  /** 兩條中心線的距離 */
  d: number;
  /** 兩條路內緣之間的空隙(負值 = 重疊) */
  gap: number;
  /** 對向車道在行進方向的左手邊 */
  left: boolean;
  y: StreetWay;
}

/**
 * 同名、對向、平行的單行道配對:沿每條路每 PAIR_STEP 公尺取樣,找另一條上最近的點。
 * 投影落在另一條路端點之外、或方向不是對向的不算。
 */
function pairSamples(ways: StreetWay[], cums: number[][]): PairSample[][] {
  const byName = new Map<string, number[]>();
  ways.forEach((w, i) => {
    if (!w.oneway || !w.name || isMinor(w)) return;
    byName.set(w.name, [...(byName.get(w.name) ?? []), i]);
  });
  return ways.map((x, xi) => {
    const out: PairSample[] = [];
    const sibs = x.oneway && !isMinor(x) ? (byName.get(x.name) ?? []).filter((j) => j !== xi) : [];
    if (!sibs.length) return out;
    const cum = cums[xi];
    const len = cum[cum.length - 1];
    for (let s = 0; s <= len; s += PAIR_STEP) {
      const { p, dir } = pointAt(x.line, cum, s);
      let best: { d: number; q: Pt; y: StreetWay } | null = null;
      for (const j of sibs) {
        const y = ways[j];
        for (let i = 0; i + 1 < y.line.length; i++) {
          const a = y.line[i];
          const b = y.line[i + 1];
          const ex = b[0] - a[0];
          const ez = b[1] - a[1];
          const l2 = ex * ex + ez * ez || 1;
          const t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2;
          if ((i === 0 && t < 0) || (i === y.line.length - 2 && t > 1)) continue;
          if ((dir[0] * ex + dir[1] * ez) / Math.sqrt(l2) > ANTI_PARALLEL) continue;
          const tc = Math.min(1, Math.max(0, t));
          const q: Pt = [a[0] + ex * tc, a[1] + ez * tc];
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (!best || d < best.d) best = { d, q, y };
        }
      }
      // 太遠的不是同一條路的另一向
      if (!best || best.d > x.width / 2 + best.y.width / 2 + MEDIAN_MAX) continue;
      const n = leftNormal(dir);
      const left = (best.q[0] - p[0]) * n[0] + (best.q[1] - p[1]) * n[1] > 0;
      out.push({ s, p, q: best.q, d: best.d, gap: best.d - x.width / 2 - best.y.width / 2, left, y: best.y });
    }
    return out;
  });
}

/** 合併重疊或相距 < ZONE_MERGE 的範圍(分隔幹道的路口在 OSM 是兩個 node) */
export function mergeZones(zs: Zone[]): Zone[] {
  const sorted = [...zs].sort((a, b) => a.s0 - b.s0);
  const out: Zone[] = [];
  for (const z of sorted) {
    const last = out[out.length - 1];
    if (last && z.s0 <= last.s1 + ZONE_MERGE) {
      last.s1 = Math.max(last.s1, z.s1);
      last.stop ||= z.stop;
    } else out.push({ ...z });
  }
  return out;
}

/**
 * 分隔島:對向車道配對之間的空隙寬度在 MEDIAN_MIN–MEDIAN_MAX 之內就填;路口範圍內不填。
 * 每對只從 id 較小的那條產生一次。
 */
function medians(ways: StreetWay[], cums: number[][], zones: Zone[][], pairs: PairSample[][], grid: SegmentGrid): StreetResult['medians'] {
  const out: StreetResult['medians'] = [];
  const index = new Map(ways.map((w, i) => [w, i]));
  ways.forEach((x, xi) => {
    const merged = mergeZones(zones[xi]);
    let run: { pts: Pt[]; ws: number[] } = { pts: [], ws: [] };
    let lastS = -Infinity;
    const flush = () => {
      if (run.pts.length >= 2) out.push(run);
      run = { pts: [], ws: [] };
    };
    for (const ps of pairs[xi]) {
      const k = (x.width / 2 + ps.gap / 2) / ps.d;
      const m: Pt = [ps.p[0] + (ps.q[0] - ps.p[0]) * k, ps.p[1] + (ps.q[1] - ps.p[1]) * k];
      // 中間夾著別條路(例:臺灣大道的慢車道配到對向的慢車道,中間是快車道)就不是分隔島
      const across: Pt = [(ps.q[0] - ps.p[0]) / ps.d, (ps.q[1] - ps.p[1]) / ps.d];
      const probe = (t: number): Pt => [m[0] + across[0] * t, m[1] + across[1] * t];
      const exclude = new Set([xi, index.get(ps.y)!]);
      const ok =
        ps.y.id > x.id &&
        ps.gap >= MEDIAN_MIN &&
        ps.gap <= MEDIAN_MAX &&
        !merged.some((z) => ps.s >= z.s0 && ps.s <= z.s1) &&
        ![0, ps.gap * MEDIAN_PROBE, -ps.gap * MEDIAN_PROBE].some((t) => grid.onRoad(probe(t), exclude));
      // 取樣點不連續(中間有被略過的點)就斷開
      if (!ok || ps.s - lastS > PAIR_STEP * PAIR_BREAK) flush();
      if (!ok) continue;
      lastS = ps.s;
      run.pts.push(m);
      run.ws.push(ps.gap);
    }
    flush();
  });
  return out;
}
