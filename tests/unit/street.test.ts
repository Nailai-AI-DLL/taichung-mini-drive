// 街道細節(decisions/0015):標線規則、路口範圍、分隔島,以及範圍 A 樣張區的實際資料。
// 實際資料的測試需要先建置:npm run map:build:range-a
import { describe, expect, it } from 'vitest';
import { BAR_LEN, DOUBLE_GAP, LINE_W, STOP_CLEAR, STOP_W } from '../../src/config/street';
import { QUANT, type WorldRoad } from '../../src/map/types';
import { clipPolyline, type Pt } from '../../src/world/gen/geom';
import { cumLength, dashes, offsetLine } from '../../src/world/gen/polyline';
import { generateStreet, lanePlan, mergeZones, type StreetWay } from '../../tools/map-build/lib/street';
import { pointInPolygon } from '../../src/world/gen/geom';
import { loadWorld } from '../helpers/load-map';

const way = (id: number, line: Pt[], o: Partial<StreetWay> = {}): StreetWay => ({
  id, name: `路${id}`, highway: 'tertiary', oneway: false, width: 12, sidewalk: 2.5, nodes: line.map((_, i) => id * 100 + i), line, ...o,
});

describe('標線規則(依路寬)', () => {
  it('12 m 雙向有人行道:黃虛線中線、兩側快慢分隔線,不畫邊線', () => {
    const m = lanePlan({ width: 12, oneway: false, sidewalk: 2.5 });
    expect(m.filter((k) => k.c === 1)).toEqual([{ c: 1, d: 1, w: LINE_W, o: 0 }]);
    expect(m.filter((k) => k.c === 0 && !k.d).map((k) => k.o).sort()).toEqual([-3.3, 3.3]);
    expect(m.some((k) => k.w === 0.15)).toBe(false);
  });

  it('每向 ≥ 2 車道:雙黃實線,兩線中心距 = 線寬 + 間隔(第 165 條)', () => {
    const y = lanePlan({ width: 17, oneway: false, sidewalk: 4 }).filter((k) => k.c === 1);
    expect(y).toHaveLength(2);
    expect(y.every((k) => k.d === 0)).toBe(true);
    expect(Math.abs(y[0].o - y[1].o)).toBeCloseTo(LINE_W + DOUBLE_GAP);
  });

  it('窄路不畫;沒有人行道才畫路面邊線', () => {
    expect(lanePlan({ width: 5, oneway: false, sidewalk: 0 })).toEqual([]);
    expect(lanePlan({ width: 7, oneway: false, sidewalk: 0 })).toEqual([]); // 雙向 < 8 m 不畫中線
    expect(lanePlan({ width: 9, oneway: false, sidewalk: 0 }).filter((k) => k.w === 0.15)).toHaveLength(2);
  });

  it('單行道緊貼對向車道:不自己畫黃線(雙黃線另沿中線畫),車道線都在分界的右側、路面內', () => {
    const m = lanePlan({ width: 16, oneway: true, sidewalk: 4 }, 6.4);
    expect(m.filter((k) => k.c === 1)).toHaveLength(0);
    for (const k of m) {
      expect(k.o).toBeLessThan(6.4 - (LINE_W + DOUBLE_GAP / 2) + 1e-9);
      expect(k.o).toBeGreaterThanOrEqual(-8);
    }
  });
});

describe('路口範圍', () => {
  it('重疊或相距 < ZONE_MERGE(18 m)的範圍合併,停止線旗標保留', () => {
    expect(mergeZones([{ s0: 30, s1: 40, stop: false }, { s0: 0, s1: 10, stop: true }, { s0: 48, s1: 50, stop: false }])).toEqual([
      { s0: 0, s1: 10, stop: true },
      { s0: 30, s1: 50, stop: false },
    ]);
  });

  // 十字路口:X 東西向、Y 南北向,共用 node 999;另有一條穿越 X 的行人穿越道(node 998 在 X 上)
  const X = way(1, [[-100, 0], [-30, 0], [0, 0], [100, 0]]);
  X.nodes = [100, 998, 999, 103];
  const Y = way(2, [[0, -100], [0, 0], [0, 100]]);
  Y.nodes = [200, 999, 202];
  const crossing = { id: 3, nodes: [300, 998, 302], line: [[-30, -8], [-30, 0], [-30, 8]] as Pt[] };
  const out = generateStreet([X, Y], [crossing]);

  it('縱向標線不進入橫交道路的路面', () => {
    for (const s of out.strips.filter((s) => s.way === X.id && s.m.length > 1)) for (const [x] of s.pts) expect(Math.abs(x)).toBeGreaterThan(Y.width / 2);
  });

  it('行人穿越道:位置在共用 node,範圍涵蓋整個路面;前後 BAR_LEN/2 + 停止線淨距內不畫縱向標線', () => {
    expect(out.crosswalks).toHaveLength(1);
    expect(out.crosswalks[0].p).toEqual([-30, 0]);
    expect(out.crosswalks[0].h).toBeCloseTo(X.width / 2);
    const keep = BAR_LEN / 2 + STOP_CLEAR;
    for (const s of out.strips.filter((s) => s.way === X.id && s.m.length > 1)) for (const [x] of s.pts) expect(Math.abs(x + 30) >= keep - 1e-6).toBe(true);
  });

  it('對向停止線:往西行駛的車在穿越道東側停,佔它的右半邊(z < 0)', () => {
    const stops = out.strips.filter((s) => s.way === X.id && s.m.length === 1 && s.m[0].w === STOP_W);
    const west = stops.find((s) => s.pts[0][0] > -30 + BAR_LEN / 2 && s.pts[0][0] < -10);
    expect(west).toBeDefined();
    expect(west!.pts[0][0]).toBeCloseTo(-30 + BAR_LEN / 2 + STOP_CLEAR + STOP_W / 2);
    expect(Math.max(west!.pts[0][1], west!.pts[1][1])).toBeCloseTo(0);
    expect(Math.min(west!.pts[0][1], west!.pts[1][1])).toBeLessThan(-5);
  });

  it('單行道只在進入路口的那一端畫停止線,橫跨整個路面', () => {
    const O = way(6, [[-100, 50], [0, 50], [100, 50]], { oneway: true });
    O.nodes = [600, 999, 602];
    const V = way(7, [[0, -100], [0, 50], [0, 100]]);
    V.nodes = [700, 999, 702];
    const r = generateStreet([O, V], []);
    const stops = r.strips.filter((s) => s.way === O.id && s.m[0].w === STOP_W);
    expect(stops).toHaveLength(1);
    expect(stops[0].pts[0][0]).toBeLessThan(0); // 路口西側(往東行駛的車進入前)
    const zs = stops[0].pts.map((p) => p[1] - 50).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-6 + 0.3);
    expect(zs[1]).toBeCloseTo(6 - 0.3);
  });

  it('斜的穿越道:停止線到最近的枕木線仍保持 STOP_CLEAR 淨距', () => {
    for (const deg of [90, 60, 45, 25]) {
      const a = (deg * Math.PI) / 180;
      const R = way(8, [[-100, 0], [0, 0], [100, 0]], { width: 16, oneway: true });
      R.nodes = [800, 801, 802];
      const c = { id: 9, nodes: [900, 801, 902], line: [[-Math.cos(a) * 10, -Math.sin(a) * 10], [0, 0], [Math.cos(a) * 10, Math.sin(a) * 10]] as Pt[] };
      const r = generateStreet([R], [c]);
      const cw = r.crosswalks[0];
      const v: Pt = [Math.cos(cw.v), Math.sin(cw.v)];
      // 枕木線最西端:沿穿越方向的兩端,再減半個枕木線長
      const barMinX = Math.min(cw.p[0] + v[0] * cw.h, cw.p[0] - v[0] * cw.h) - BAR_LEN / 2;
      const stop = r.strips.find((s) => s.m[0].w === STOP_W)!;
      expect(barMinX - (stop.pts[0][0] + STOP_W / 2)).toBeGreaterThanOrEqual(STOP_CLEAR - 1e-6);
    }
  });

  it('停止線:在穿越道前、淨距 STOP_CLEAR,橫跨行車方向的右半邊(台灣靠右)', () => {
    const stops = out.strips.filter((s) => s.way === X.id && s.m.length === 1 && s.m[0].w === STOP_W);
    // 往東行駛(+x),進入穿越道前的停止線在 x = -30 - keep 前方,佔右半邊(z > 0,即行進方向右手邊)
    const east = stops.find((s) => s.pts[0][0] < -30 - BAR_LEN / 2);
    expect(east).toBeDefined();
    expect(east!.pts[0][0]).toBeCloseTo(-30 - BAR_LEN / 2 - STOP_CLEAR - STOP_W / 2);
    expect(Math.min(east!.pts[0][1], east!.pts[1][1])).toBeCloseTo(0);
    expect(Math.max(east!.pts[0][1], east!.pts[1][1])).toBeGreaterThan(5);
  });

  it('穿越道剛好在同一條路兩段 way 的接點:枕木紋只畫一次,兩段都讓出範圍', () => {
    const A = way(40, [[-100, 0], [0, 0]], { name: '市政北七路' });
    const B = way(41, [[0, 0], [100, 0]], { name: '市政北七路' });
    A.nodes = [4000, 4001];
    B.nodes = [4001, 4002];
    const c = { id: 42, nodes: [4200, 4001, 4202], line: [[0, -8], [0, 0], [0, 8]] as Pt[] };
    const r = generateStreet([A, B], [c]);
    expect(r.crosswalks).toHaveLength(1);
    const keep = BAR_LEN / 2 + STOP_CLEAR;
    for (const s of r.strips) for (const [x] of s.pts) expect(Math.abs(x)).toBeGreaterThanOrEqual(keep - 1e-6);
  });

  it('不同名的路以淺角(25°)接進來也算路口,標線不穿過它的路面', () => {
    const M = way(20, [[-100, 0], [0, 0], [100, 0]]);
    M.nodes = [2000, 2001, 2002];
    const a = (25 * Math.PI) / 180;
    const B = way(21, [[0, 0], [Math.cos(a) * 80, -Math.sin(a) * 80]], { width: 7 });
    B.nodes = [2001, 2101];
    const r = generateStreet([M, B], []);
    const n: Pt = [Math.sin(a), Math.cos(a)]; // B 的法向量
    let checked = 0;
    for (const s of r.strips.filter((s) => s.way === M.id))
      for (const k of s.m)
        for (const p of offsetLine(s.pts, k.o)) {
          const along = p[0] * Math.cos(a) - p[1] * Math.sin(a);
          const off = Math.abs(p[0] * n[0] + p[1] * n[1]);
          expect(along < 0 || along > 80 || off > B.width / 2).toBe(true);
          checked++;
        }
    expect(checked).toBeGreaterThan(10);
  });

  it('換段改名或過橋(不同名、頭尾相接、只有這兩條路)不算路口:不斷標線、不畫停止線', () => {
    const A = way(30, [[0, 0], [50, 0]], { name: '朝馬三街' });
    const Br = way(31, [[50, 0], [80, 1]], { name: '朝馬三橋' });
    A.nodes = [3000, 3001];
    Br.nodes = [3001, 3101];
    const r = generateStreet([A, Br], []);
    const a = r.strips.filter((s) => s.way === A.id);
    expect(a).toHaveLength(1);
    expect(a[0].pts[a[0].pts.length - 1][0]).toBeCloseTo(50);
    expect(r.strips.some((s) => s.m[0].w === STOP_W)).toBe(false);
  });

  it('頭尾相接的地方還有第三條路(也是淺角分岔)接進來,就是路口', () => {
    const A = way(30, [[0, 0], [50, 0]], { name: '甲路' });
    const B = way(31, [[50, 0], [100, 2]], { name: '乙路' });
    const C = way(32, [[50, 0], [100, -18]], { name: '丙路' }); // 約 20° 分岔
    A.nodes = [3000, 3001];
    B.nodes = [3001, 3101];
    C.nodes = [3001, 3201];
    const r = generateStreet([A, B, C], []);
    const a = r.strips.find((s) => s.way === A.id && s.m.length > 1)!;
    expect(a.pts[a.pts.length - 1][0]).toBeLessThan(50 - C.width / 2);
    // 淺角分岔只切斷標線,不畫停止線
    expect(r.strips.some((s) => s.way === A.id && s.m[0].w === STOP_W)).toBe(false);
  });

  it('同一條路的延續(同名的兩條 way 接成直線)不算路口', () => {
    const A = way(4, [[0, 0], [50, 0]], { name: '同一條路' });
    const B = way(5, [[50, 0], [100, 0]], { name: '同一條路' });
    A.nodes = [1, 2];
    B.nodes = [2, 3];
    const r = generateStreet([A, B], []);
    const a = r.strips.find((s) => s.way === 4)!;
    expect(a.pts[a.pts.length - 1][0]).toBeCloseTo(50);
  });
});

describe('路口鋪面(分隔幹道交叉時,路口中央兩條分隔帶重疊的地方要鋪成路面)', () => {
  // 東西向分隔幹道(兩條 10 m 單行,中心線 z = 0 / -16)× 南北向分隔幹道(兩條 10 m 單行,中心線 x = 0 / 16)
  const E = way(50, [[-100, 0], [-12, 0], [0, 0], [16, 0], [100, 0]], { name: '東西大道', oneway: true, width: 10 });
  const W = way(51, [[100, -16], [16, -16], [0, -16], [-12, -16], [-100, -16]], { name: '東西大道', oneway: true, width: 10 });
  const S = way(52, [[0, -100], [0, -16], [0, 0], [0, 100]], { name: '南北大道', oneway: true, width: 10 });
  const N = way(53, [[16, 100], [16, 0], [16, -16], [16, -100]], { name: '南北大道', oneway: true, width: 10 });
  E.nodes = [5000, 5401, 9001, 9002, 5003];
  W.nodes = [5100, 9004, 9003, 5404, 5103];
  S.nodes = [5200, 9003, 9001, 5203];
  N.nodes = [5300, 9002, 9004, 5303];
  // 西側穿越道橫跨兩向車道(與兩條路各共用一個 node)
  const crossing = { id: 54, nodes: [5400, 5401, 5404, 5402], line: [[-12, 10], [-12, 0], [-12, -16], [-12, -26]] as Pt[] };
  const r = generateStreet([E, W, S, N], [crossing]);

  const covered = (p: Pt, js: Pt[][]) => js.some((j) => pointInPolygon(p, j));

  it('蓋住正中央(兩條分隔帶交叉處)與分隔帶穿過路口的部分', () => {
    expect(r.junctions.length).toBeGreaterThanOrEqual(2);
    expect(covered([8, -8], r.junctions)).toBe(true);
    expect(covered([8, -3], r.junctions)).toBe(true); // 南北向分隔帶,在東西向車道之間
    expect(covered([3, -8], r.junctions)).toBe(true); // 東西向分隔帶,在南北向車道之間
  });

  it('不蓋到轉角外的人行道,也不沿分隔帶往路口外延伸(那裡是分隔島)', () => {
    expect(covered([16 + 5 + 1.5, 5 + 1.5], r.junctions)).toBe(false);
    expect(covered([-5 - 1.5, -16 - 5 - 1.5], r.junctions)).toBe(false);
    expect(covered([60, -8], r.junctions)).toBe(false);
  });

  it('路口旁的枕木紋那段分隔帶也鋪(西側穿越道在 x = -12)', () => {
    expect(covered([-12, -8], r.junctions)).toBe(true);
  });

  it('只從外側接進來的 T 字路口不打開分隔帶(分隔島照樣連續)', () => {
    const E2 = way(70, [[-100, 0], [0, 0], [100, 0]], { name: '大道', oneway: true, width: 10 });
    const W2 = way(71, [[100, -16], [-100, -16]], { name: '大道', oneway: true, width: 10 });
    const T = way(72, [[0, 60], [0, 0]], { width: 8 });
    E2.nodes = [7000, 7001, 7002];
    W2.nodes = [7100, 7101];
    T.nodes = [7200, 7001];
    const rt = generateStreet([E2, W2, T], []);
    expect(rt.junctions).toHaveLength(0);
    // 分隔島在 T 字路口處也不斷(只避開枕木紋與路口路面,而路口路面只在 E 這一向)
    expect(rt.medians.some((m) => m.pts.some(([x]) => Math.abs(x) < 3))).toBe(true);
  });

  it('分隔島延伸到穿越道邊(留 MEDIAN_NOSE),不壓到枕木線', () => {
    const band = BAR_LEN / 2; // 穿越道與道路垂直:沿道路方向佔 ± 枕木線長 / 2
    const xs = r.medians.flatMap((m) => m.pts.map(([x]) => x));
    for (const x of xs) expect(Math.abs(x + 12)).toBeGreaterThanOrEqual(band + 0.5 - 1e-6);
    // 穿越道西側的分隔島頭離穿越道 ≤ 0.5 + 取樣間距
    const west = Math.max(...xs.filter((x) => x < -12));
    expect(-12 - band - west).toBeLessThanOrEqual(0.5 + 1 + 1e-6);
  });

  it('相距 20 m 的兩個路口之間,分隔帶不鋪(那裡是分隔島、綠帶或河)', () => {
    const E3 = way(80, [[-100, 0], [0, 0], [20, 0], [100, 0]], { name: '大道', oneway: true, width: 10 });
    const W3 = way(81, [[100, -16], [20, -16], [0, -16], [-100, -16]], { name: '大道', oneway: true, width: 10 });
    const A = way(82, [[0, 50], [0, 0], [0, -16], [0, -60]], { width: 8 });
    const B = way(83, [[20, 50], [20, 0], [20, -16], [20, -60]], { width: 8 });
    E3.nodes = [8000, 8001, 8002, 8003];
    W3.nodes = [8100, 8102, 8101, 8103];
    A.nodes = [8200, 8001, 8101, 8203];
    B.nodes = [8300, 8002, 8102, 8303];
    const rr = generateStreet([E3, W3, A, B], []);
    expect(covered([0, -8], rr.junctions)).toBe(true);
    expect(covered([20, -8], rr.junctions)).toBe(true);
    expect(covered([10, -8], rr.junctions)).toBe(false);
  });

  it('同向快慢車道之間的空隙穿過路口也鋪(臺灣大道:快車道與慢車道是兩條同向 way)', () => {
    const F = way(90, [[-100, 0], [0, 0], [100, 0]], { name: '大道', oneway: true, width: 12 });
    const L = way(91, [[-100, 9], [0, 9], [100, 9]], { name: '大道', oneway: true, width: 4 }); // 慢車道在右側,中間空 1 m
    const V = way(92, [[0, -60], [0, 0], [0, 9], [0, 60]], { width: 10 });
    F.nodes = [9000, 9001, 9002];
    L.nodes = [9100, 9101, 9102];
    V.nodes = [9200, 9001, 9101, 9203];
    const rs = generateStreet([F, L, V], []);
    expect(covered([0, 6.5], rs.junctions)).toBe(true);
    expect(covered([40, 6.5], rs.junctions)).toBe(false); // 路口外是快慢分隔島
  });

  it('鋪面往兩側路面內多蓋 0.3 m,邊緣不留細縫', () => {
    // 東向車道 E(z = 0、寬 10)的內緣在 z = -5;在穿越道那段(x = -12,不在南北向分隔帶的鋪面裡)往路面內 0.15 m 的點要被蓋到
    expect(covered([-12, -4.85], r.junctions)).toBe(true);
  });

  it('兩個路口各有自己的穿越道時,穿越道之間的分隔帶不鋪(不把兩個路口接起來)', () => {
    const E4 = way(110, [[-100, 0], [0, 0], [8, 0], [18, 0], [26, 0], [100, 0]], { name: '大道', oneway: true, width: 10 });
    const W4 = way(111, [[100, -16], [26, -16], [18, -16], [8, -16], [0, -16], [-100, -16]], { name: '大道', oneway: true, width: 10 });
    const A = way(112, [[0, 50], [0, 0], [0, -16], [0, -60]], { width: 8 });
    const B = way(113, [[26, 50], [26, 0], [26, -16], [26, -60]], { width: 8 });
    E4.nodes = [11000, 11001, 11002, 11003, 11004, 11005];
    W4.nodes = [11100, 11104, 11103, 11102, 11101, 11105];
    A.nodes = [11200, 11001, 11101, 11203];
    B.nodes = [11300, 11004, 11104, 11303];
    const c1 = { id: 114, nodes: [11400, 11002, 11102, 11403], line: [[8, 10], [8, 0], [8, -16], [8, -26]] as Pt[] };
    const c2 = { id: 115, nodes: [11500, 11003, 11103, 11503], line: [[18, 10], [18, 0], [18, -16], [18, -26]] as Pt[] };
    const rb = generateStreet([E4, W4, A, B], [c1, c2]);
    expect(covered([8, -8], rb.junctions)).toBe(true);
    expect(covered([18, -8], rb.junctions)).toBe(true);
    expect(covered([13, -8], rb.junctions)).toBe(false);
  });

  it('頭尾相接的同名同向單行道不算「平行」,不產生鋪面(投影會被夾到對方端點)', () => {
    // 寬 30 m 的路橫交在接點上:接點前後 15 m 都是路口範圍,A 上離接點 10 m 以外的點投影到 B 的起點,距離 > 兩半寬
    const A = way(120, [[0, 0], [50, 0]], { name: '大道', oneway: true, width: 10 });
    const B = way(121, [[50, 0], [100, 0]], { name: '大道', oneway: true, width: 10 });
    const V = way(122, [[50, -60], [50, 0], [50, 60]], { width: 30 });
    A.nodes = [12000, 12001];
    B.nodes = [12001, 12102];
    V.nodes = [12200, 12001, 12202];
    expect(generateStreet([A, B, V], []).junctions).toHaveLength(0);
  });

  it('沒有分隔帶的一般十字路口不鋪', () => {
    const A = way(60, [[-50, 0], [0, 0], [50, 0]]);
    const B = way(61, [[0, -50], [0, 0], [0, 50]]);
    A.nodes = [6000, 6001, 6002];
    B.nodes = [6100, 6001, 6102];
    expect(generateStreet([A, B], []).junctions).toHaveLength(0);
  });
});

describe('分隔島與雙黃線(台灣靠右:往東的車道,對向車道在北側 = -z)', () => {
  // 兩條同名、對向的 10 m 單行道,中心線相距 16 m → 空隙 6 m
  const E = way(10, [[0, 0], [200, 0]], { name: '大道', oneway: true, width: 10 });
  const W = way(11, [[200, -16], [0, -16]], { name: '大道', oneway: true, width: 10 });

  it('分隔島填在兩條路內緣之間,寬度 = 空隙,每對只產生一次', () => {
    const r = generateStreet([E, W], []);
    expect(r.medians).toHaveLength(1);
    for (const [, z] of r.medians[0].pts) expect(z).toBeCloseTo(-8);
    for (const w of r.medians[0].ws) expect(w).toBeCloseTo(6);
  });

  // 緊貼且不平行、兩向路寬不同:中心線距離從 9.5 m(x = 0)收斂到 8 m(x = 200),東向 12 m、西向 6 m(重疊 0.5–1 m)
  const E2 = way(10, [[0, 0], [200, 0]], { name: '大道', oneway: true, width: 12 });
  const W2 = way(11, [[200, -8], [0, -9.5]], { name: '大道', oneway: true, width: 6 });
  const r2 = generateStreet([E2, W2], []);

  it('緊貼時不填分隔島;雙黃線只有一組,沿兩條中心線的中點畫,兩線間距固定 10 cm(第 165 條)', () => {
    expect(r2.medians).toHaveLength(0);
    const yellow = r2.strips.filter((s) => s.m.some((k) => k.c === 1));
    expect(yellow).toHaveLength(1);
    const m = yellow[0].m.map((k) => k.o).sort((a, b) => a - b);
    expect(m[1] - m[0]).toBeCloseTo(LINE_W + DOUBLE_GAP);
    for (const [x, z] of yellow[0].pts) expect(z).toBeCloseTo(-(9.5 - 1.5 * (x / 200)) / 2, 2);
  });

  it('緊貼的單行道:停止線只畫到中線旁,不越過雙黃線;雙黃線一路接到停止線前', () => {
    // 在 x = 150(兩條中心線距離 8.375 m,比西端窄)放一條橫交道路
    const E4 = way(10, [[0, 0], [150, 0], [200, 0]], { name: '大道', oneway: true, width: 12 });
    const W4 = way(11, [[200, -8], [150, -8.375], [0, -9.5]], { name: '大道', oneway: true, width: 6 });
    const V = way(12, [[150, 40], [150, 0], [150, -8.375], [150, -60]], { width: 10 });
    E4.nodes = [4000, 4001, 4002];
    W4.nodes = [4100, 4101, 4102];
    V.nodes = [4200, 4001, 4101, 4203];
    const r = generateStreet([E4, W4, V], []);
    const stop = r.strips.find((s) => s.way === E4.id && s.m[0].w === STOP_W)!;
    expect(stop).toBeDefined();
    const x = stop.pts[0][0];
    const mid = -(9.5 - 1.5 * (x / 200)) / 2; // 中線的 z
    const half = LINE_W + DOUBLE_GAP / 2; // 雙黃線半寬
    for (const [, z] of stop.pts) expect(z).toBeGreaterThanOrEqual(mid + half - 1e-6);
    // 雙黃線的終點離停止線不超過 1.5 m
    const yellow = r.strips.filter((s) => s.m.some((k) => k.c === 1));
    const end = Math.max(...yellow.flatMap((s) => s.pts.map((p) => p[0])).filter((px) => px < x));
    expect(x - end).toBeLessThan(1.5);
  });

  it('兩條路的車道線都不越過中線(取中心線最近距離的一半當分界)', () => {
    const minHalf = 8 / 2 - (LINE_W + DOUBLE_GAP / 2);
    for (const s of r2.strips.filter((s) => s.m.every((k) => k.c === 0) && s.m[0].w !== STOP_W)) {
      for (const k of s.m) expect(k.o).toBeLessThanOrEqual(minHalf + 1e-6);
    }
  });

  it('分隔島在路口(橫交道路的路面上)斷開', () => {
    const E3 = way(10, [[0, 0], [100, 0], [200, 0]], { name: '大道', oneway: true, width: 10 });
    const W3 = way(11, [[200, -16], [100, -16], [0, -16]], { name: '大道', oneway: true, width: 10 });
    const V = way(12, [[100, 40], [100, 0], [100, -16], [100, -60]], { width: 12 });
    E3.nodes = [1000, 1001, 1002];
    W3.nodes = [1100, 1101, 1102];
    V.nodes = [1200, 1001, 1101, 1203];
    const r = generateStreet([E3, W3, V], []);
    expect(r.medians.length).toBeGreaterThanOrEqual(2);
    for (const m of r.medians) for (const [x] of m.pts) expect(Math.abs(x - 100)).toBeGreaterThan(V.width / 2);
  });

  it('對向車道在右手邊(靠左行駛的配置,資料錯誤)不當成緊貼,不畫雙黃線', () => {
    const Wr = way(11, [[200, 9], [0, 9]], { name: '大道', oneway: true, width: 10 });
    const r = generateStreet([E, Wr], []);
    expect(r.strips.filter((s) => s.m.some((k) => k.c === 1))).toHaveLength(0);
  });
});

describe('範圍 A 街道細節(world.json,範圍 = meta.detailRect)', () => {
  const world = loadWorld('range-a');
  const st = world.json.street!;
  const [minX, minZ, maxX, maxZ] = world.json.meta.detailRect!;
  const roads: { r: WorldRoad; pts: Pt[] }[] = world.json.roads
    .map((r) => ({ r, pts: deq(r.pts) }))
    .filter(({ pts }) => pts.some(([x, z]) => x > minX - 50 && x < maxX + 50 && z > minZ - 50 && z < maxZ + 50));
  const minor = new Set(['service', 'living_street']);

  // 道路線段的格網索引(50 m 一格),全區取樣才跑得動
  const CELL = 50;
  const grid = new Map<string, { r: WorldRoad; a: Pt; b: Pt }[]>();
  for (const { r, pts } of roads)
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const pad = r.width / 2;
      for (let cx = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); cx <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL); cx++)
        for (let cz = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); cz <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL); cz++) {
          const k = `${cx},${cz}`;
          const arr = grid.get(k) ?? [];
          arr.push({ r, a, b });
          grid.set(k, arr);
        }
    }

  /** 點 p 落在哪些道路的路面上(離中心線 < 半寬 - margin),回傳該路段的方向 */
  const onSurfaces = (p: Pt, margin: number) => {
    const out: { r: WorldRoad; dir: Pt }[] = [];
    for (const { r, a, b } of grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []) {
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2));
      const d = Math.hypot(a[0] + ex * t - p[0], a[1] + ez * t - p[1]);
      if (d < r.width / 2 - margin) {
        const l = Math.sqrt(l2);
        out.push({ r, dir: [ex / l, ez / l] });
      }
    }
    return out;
  };

  it('範圍內有各種街道細節', () => {
    expect(st.strips.length).toBeGreaterThan(100);
    expect(st.crosswalks.length).toBeGreaterThan(10);
    expect(st.medians.length).toBeGreaterThan(5);
  });

  it('縱向標線不畫在橫交道路的路面上(取樣每 2 m,容許 < 1%:立體交叉沒有共用 node)', () => {
    let total = 0, bad = 0;
    for (const s of st.strips) {
      const line = deq(s.pts);
      for (const m of s.m) {
        if (m.w === STOP_W * 100) continue; // 停止線本身是橫向的
        const off = offsetLine(line, m.o / 100);
        const cum = cumLength(off);
        const len = cum[cum.length - 1];
        for (let t = 0; t <= len; t += 2) {
          const { p, dir } = at(off, cum, t);
          total++;
          // 和這段標線夾角 > 20° 的路面 = 橫交道路(淺角斜交的支路也算)
          if (onSurfaces(p, 0.5).some(({ r, dir: d }) => !minor.has(r.highway) && Math.abs(dir[0] * d[1] - dir[1] * d[0]) > 0.34)) bad++;
        }
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect(bad / total).toBeLessThan(0.01);
  });

  it('標線、分隔島只在範圍內(meta.detailRect)', () => {
    const inside = ([x, z]: Pt) => x >= minX - 0.1 && x <= maxX + 0.1 && z >= minZ - 0.1 && z <= maxZ + 0.1;
    for (const s of st.strips) expect(deq(s.pts).every(inside)).toBe(true);
    for (const m of st.medians) expect(deq(m.pts).every(inside)).toBe(true);
  });

  it('路緣石剛好畫在範圍內:範圍外 0 m;範圍內有人行道的路段全部都有', () => {
    const rect = { minX, minZ, maxX, maxZ };
    let curb = 0, outside = 0, expected = 0;
    for (const c of world.chunks.values())
      for (const r of c.roads) {
        for (const k of r.curbs) {
          curb += polyLen(k);
          for (const [x, z] of k) if (x < minX - 0.1 || x > maxX + 0.1 || z < minZ - 0.1 || z > maxZ + 0.1) outside++;
        }
        if (r.sidewalk > 0) for (const k of clipPolyline(r.pts, rect)) expected += polyLen(k);
      }
    expect(outside).toBe(0);
    expect(expected).toBeGreaterThan(1000);
    expect(curb).toBeCloseTo(expected, 0);
  });

  it('路口鋪面的每個頂點都在某條道路的路緣上(離中心線 ≤ 半寬 + 0.2 m)', () => {
    const js = st.junctions ?? [];
    expect(js.length).toBeGreaterThan(100);
    let bad = 0, total = 0;
    for (const j of js) {
      const ring = deq(j);
      for (const p of ring) {
        total++;
        if (!onSurfaces(p, -0.2).length) bad++;
      }
    }
    // 頂點量化到 0.1 m,偶爾落在路緣外一點;門檻 0.5%
    expect(bad / total).toBeLessThan(0.005);
  });

  it('分隔島的點不在路口鋪面裡(路口中央不會有分隔島;量化 0.1 m 造成的邊界點容許 < 0.2%)', () => {
    const js = (st.junctions ?? []).map((j) => {
      const r = deq(j);
      return { r, minX: Math.min(...r.map((p) => p[0])), maxX: Math.max(...r.map((p) => p[0])), minZ: Math.min(...r.map((p) => p[1])), maxZ: Math.max(...r.map((p) => p[1])) };
    });
    let bad = 0, total = 0;
    for (const m of st.medians)
      for (const p of deq(m.pts)) {
        total++;
        if (js.some((j) => p[0] >= j.minX && p[0] <= j.maxX && p[1] >= j.minZ && p[1] <= j.maxZ && pointInPolygon(p, j.r))) bad++;
      }
    expect(total).toBeGreaterThan(1000);
    expect(bad / total).toBeLessThan(0.002);
  });

  it('枕木紋中心在道路中心線上,且整組都在範圍內', () => {
    for (const c of st.crosswalks) {
      const p: Pt = [c.p[0] / QUANT, c.p[1] / QUANT];
      expect(p[0] >= minX && p[0] <= maxX && p[1] >= minZ && p[1] <= maxZ).toBe(true);
      expect(onSurfaces(p, 0).length).toBeGreaterThan(0);
    }
  });

  it('分隔島不壓到任何一般道路的路面(取樣每個點,容許 < 2%:路口範圍的邊緣)', () => {
    let total = 0, bad = 0;
    for (const md of st.medians) {
      for (const p of deq(md.pts)) {
        total++;
        if (onSurfaces(p, 0.5).some(({ r }) => !minor.has(r.highway))) bad++;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(bad / total).toBeLessThan(0.02);
  });

  it('虛線照第 182 條:4 m 畫、6 m 空', () => {
    const d = dashes([[0, 0], [25, 0]], 4, 6);
    expect(d.map((s) => [s[0][0], s[s.length - 1][0]].map((v) => +v.toFixed(6)))).toEqual([[0, 4], [10, 14], [20, 24]]);
  });
});

function deq(v: number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i] / QUANT, v[i + 1] / QUANT]);
  return out;
}

function polyLen(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** 折線上長度 s 處的點與該段方向 */
function at(line: Pt[], cum: number[], s: number): { p: Pt; dir: Pt } {
  let i = 1;
  while (i < line.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const dx = line[i][0] - line[i - 1][0], dz = line[i][1] - line[i - 1][1];
  const l = Math.hypot(dx, dz) || 1;
  return { p: [line[i - 1][0] + dx * t, line[i - 1][1] + dz * t], dir: [dx / l, dz / l] };
}

describe('地面平面(修正:原本固定 4000 m,蓋不到範圍 A 東西兩側)', () => {
  it('涵蓋整個區域邊界再往外 GROUND_MARGIN', async () => {
    const { groundPlane, GROUND_MARGIN } = await import('../../src/render/scene');
    const b = loadWorld('range-a').json.meta.bounds;
    const g = groundPlane(b);
    expect(g.cx - g.w / 2).toBeLessThanOrEqual(b[0] - GROUND_MARGIN);
    expect(g.cx + g.w / 2).toBeGreaterThanOrEqual(b[2] + GROUND_MARGIN);
    expect(g.cz - g.h / 2).toBeLessThanOrEqual(b[1] - GROUND_MARGIN);
    expect(g.cz + g.h / 2).toBeGreaterThanOrEqual(b[3] + GROUND_MARGIN);
  });
});
