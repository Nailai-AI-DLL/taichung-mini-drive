// 小地圖純邏輯(src/ui/minimap-core.ts):方向、快取重畫時機、路名挑選、資料整理。
// 驗收條件(M1-plan §5):北朝上 / 車頭朝上可切換，目前位置與道路對齊。
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../helpers/load-map';
import {
  arrowRotation,
  labelCandidates,
  northMarker,
  landmarkGlyph,
  needsRedraw,
  overlaps,
  pickLabels,
  boxesOverlap,
  uprightAngle,
  prepareMapData,
  viewRotation,
  worldToMap,
  type LabelCandidate,
} from '../../src/ui/minimap-core';
import { RoadIndex } from '../../src/map/road-index';

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('小地圖方向', () => {
  it('北朝上：北邊(-z)的點在圓心正上方，東邊(+x)在右邊', () => {
    const rot = viewRotation('north', 1, 0);
    close(worldToMap(0, -100, 0, 0, 0.5, rot), [0, -50]);
    close(worldToMap(100, 0, 0, 0, 0.5, rot), [50, 0]);
  });

  it('車頭朝上：不論車頭朝哪，正前方的點都在圓心正上方、右手邊在右邊', () => {
    for (const deg of [0, 37, 90, 180, 251, 330]) {
      const b = (deg * Math.PI) / 180;
      const hx = Math.sin(b), hz = -Math.cos(b); // 方位 deg(從北順時針)的車頭方向
      const rot = viewRotation('heading', hx, hz);
      close(worldToMap(hx * 100, hz * 100, 0, 0, 1, rot), [0, -100]);
      // 右手邊 = 車頭方向順時針轉 90°
      close(worldToMap(-hz * 100, hx * 100, 0, 0, 1, rot), [100, 0]);
    }
  });

  it('車子永遠在圓心', () => {
    close(worldToMap(1234, -567, 1234, -567, 0.4, viewRotation('heading', 0.6, 0.8)), [0, 0]);
  });
});

describe('箭頭與北方標記', () => {
  // 箭頭預設朝上(0, -1);轉 a 弧度後的方向
  const arrowDir = (a: number): [number, number] => [Math.sin(a), -Math.cos(a)];
  it('北朝上：箭頭指向車頭方向(東 = 右、南 = 下、西北 = 左上)', () => {
    close(arrowDir(arrowRotation('north', 1, 0)), [1, 0]);
    close(arrowDir(arrowRotation('north', 0, 1)), [0, 1]);
    close(arrowDir(arrowRotation('north', -Math.SQRT1_2, -Math.SQRT1_2)), [-Math.SQRT1_2, -Math.SQRT1_2]);
  });
  it('車頭朝上：箭頭永遠朝上', () => {
    close(arrowDir(arrowRotation('heading', 0.3, -0.95)), [0, -1]);
  });
  it('北方標記：北朝上在正上方;車頭朝東時在左邊(北在車子左手邊)', () => {
    close(northMarker(viewRotation('north', 1, 0), 96), [0, -96]);
    close(northMarker(viewRotation('heading', 1, 0), 96), [-96, 0]);
  });
});

describe('離屏快取', () => {
  it('第一次一定要畫;可視圓還在快取內就不重畫，超出才重畫', () => {
    expect(needsRedraw(null, 0, 0, 260)).toBe(true);
    const cache = { cx: 0, cz: 0, half: 520 };
    expect(needsRedraw(cache, 0, 0, 260)).toBe(false);
    expect(needsRedraw(cache, 250, -250, 260)).toBe(false);
    expect(needsRedraw(cache, 261, 0, 260)).toBe(true);
    expect(needsRedraw(cache, 0, -261, 260)).toBe(true);
  });
});

describe('路名挑選(仿地圖 App:沿道路方向、不上下顛倒)', () => {
  const measure = (s: string) => s.length * 12;
  const opts = { maxR: 80, radius: 100, max: 3, height: () => 14, avoidCenter: 20 };
  const id = (x: number, z: number): [number, number] => [x, z];
  // 水平路段(ang = 0),每個候選點都有足夠空間放字
  const cand = (name: string, rank: number, x: number, z: number, ang = 0, room = 200): LabelCandidate => ({ name, rank, x, z, ang, room });

  it('同名只出現一次，取離圓心最近的點', () => {
    const out = pickLabels([cand('文心路三段', 3, 0, -60), cand('文心路三段', 3, 0, -35)], id, 0, 1, measure, opts);
    expect(out).toHaveLength(1);
    expect(out[0].y).toBe(-35);
  });

  it('等級高的優先;重疊的跳過;超出圓或壓到車子的跳過;最多 max 個', () => {
    const c = [
      cand('小路甲', 1, 0, -40),
      cand('臺灣大道二段', 3, 0, -42), // 和小路甲重疊，等級高者勝
      cand('壓到車子', 4, 0, 2),
      cand('太遠的路', 4, 0, 95),
      cand('路乙', 2, 0, 40),
      cand('路丙', 2, -40, 20, Math.PI / 2), // 直的路：字直排，不會和路乙相撞
      cand('路丁', 1, 40, -10),
    ];
    expect(pickLabels(c, id, 0, 1, measure, opts).map((l) => l.name)).toEqual(['臺灣大道二段', '路乙', '路丙']);
  });

  it('一般道路(rank 0)也會顯示，但排在主要道路之後', () => {
    const c = [cand('惠來路二段', 0, 0, -40), cand('市政北七路', 1, 0, 40)];
    expect(pickLabels(c, id, 0, 1, measure, opts).map((l) => l.name)).toEqual(['市政北七路', '惠來路二段']);
  });

  it('路段太短放不下整個路名就不放', () => {
    // 字寬 7 × 12 + 6 = 90 px;直線段至少要 0.6 倍 = 54 px
    expect(pickLabels([cand('很長很長的路名', 0, 0, -40, 0, 50)], id, 0, 1, measure, opts)).toHaveLength(0);
    expect(pickLabels([cand('很長很長的路名', 0, 0, -40, 0, 60)], id, 0, 1, measure, opts)).toHaveLength(1);
  });

  it('文字角度跟著道路，且永遠不上下顛倒', () => {
    for (const [ang, rot] of [[0, 0], [Math.PI, 0], [Math.PI / 3, Math.PI], [-2.5, 0.4]]) {
      const [l] = pickLabels([cand('某路', 0, 0, -50, ang)], id, rot, 1, measure, opts);
      expect(l.angle).toBeGreaterThanOrEqual(-Math.PI / 2 - 1e-9);
      expect(l.angle).toBeLessThan(Math.PI / 2);
      // 和道路方向平行(差 0 或 π)
      const diff = (((l.angle - (ang + rot)) % Math.PI) + Math.PI) % Math.PI;
      expect(Math.min(diff, Math.PI - diff)).toBeLessThan(1e-9);
    }
    expect(uprightAngle(Math.PI)).toBeCloseTo(0);
    // 直向的路：字由下往上讀(-π/2),不論道路方向是往北還是往南
    expect(uprightAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(uprightAngle(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });

  it('旋轉矩形重疊判定：十字交叉會撞、平行錯開不會撞', () => {
    const a = { x: 0, y: 0, w: 60, h: 12, angle: 0 };
    expect(boxesOverlap(a, { x: 0, y: 0, w: 60, h: 12, angle: Math.PI / 2 })).toBe(true);
    expect(boxesOverlap(a, { x: 0, y: 14, w: 60, h: 12, angle: 0 })).toBe(false);
    expect(boxesOverlap(a, { x: 40, y: 40, w: 60, h: 12, angle: Math.PI / 4 })).toBe(false);
    expect(boxesOverlap(a, { x: 40, y: 30, w: 60, h: 12, angle: Math.PI / 4 })).toBe(true); // 斜框的一角伸進 a
  });

  it('最近的點放不下時改用次近的點(正在開的路，最近點常壓到車子)', () => {
    const out = pickLabels([cand('文心路三段', 3, 0, 3), cand('文心路三段', 3, 0, 45)], id, 0, 1, measure, opts);
    expect(out.map((l) => [l.name, l.y])).toEqual([['文心路三段', 45]]);
    expect([out[0].wx, out[0].wz]).toEqual([0, 45]);
  });
});

describe('範圍 A 資料', () => {
  const world = loadWorld('range-a');
  const data = prepareMapData(world.json, world.roads);

  it('道路、水道、綠地、地標都整理進來，主要道路有等級', () => {
    expect(data.roads.length).toBe(world.roads.length);
    // 下沉地標(秋紅谷,decisions/0035)的外框也照綠地畫
    const sinkRings = world.json.landmarks.filter((l) => l.sink).reduce((n, l) => n + l.rings.length, 0);
    expect(sinkRings).toBeGreaterThan(0);
    expect(data.areas.length).toBe(world.json.areas.length + sinkRings);
    // 原本的 5 個 P0 地標 + 做了專屬造型的知名地點(decisions/0032:三棟百貨)
    expect(data.landmarks.map((l) => l.id).sort()).toEqual(['city-hall', 'council', 'fulfillment', 'ikea', 'maple-garden', 'mcdonalds', 'millennium', 'opera', 'shin-kong', 'station-new', 'station-old', 'the-lin', 'tiger-city', 'top-city']);
    expect(data.roads.find((r) => r.name === '臺灣大道二段')!.rank).toBeGreaterThan(0);
  });

  it('出生點附近有路名候選(含一般道路),且候選點都在道路上', () => {
    const sp = world.json.spawn;
    const area = { minX: sp.x - 520, minZ: sp.z - 520, maxX: sp.x + 520, maxZ: sp.z + 520 };
    const cands = labelCandidates(data, area);
    expect(new Set(cands.map((c) => c.name)).size).toBeGreaterThan(3);
    expect(cands.some((c) => c.rank === 0 && c.name === '惠來路二段')).toBe(true);
    // 對齊：候選點(小地圖上畫路名的位置)用路名索引查回去，要落在同名道路上
    const idx = new RoadIndex(world.roads);
    for (const c of cands.filter((_, i) => i % 50 === 0)) {
      const hit = idx.nearest(c.x, c.z);
      expect(hit, c.name).toBeTruthy();
      expect(Math.hypot(hit!.x - c.x, hit!.z - c.z)).toBeLessThan(1);
    }
  });

  it('直路被切成很多短段時，合併成一段直線再算可放路名的長度', () => {
    const one = {
      roads: [{ pts: Float32Array.from([0, 0, 20, 0, 40, 1, 60, 0, 80, 0, 80, 60]), bbox: { minX: 0, minZ: 0, maxX: 80, maxZ: 60 }, width: 10, rank: 2, name: '某路' }],
      waterways: [], areas: [], landmarks: [],
    };
    const c = labelCandidates(one, { minX: -1, minZ: -1, maxX: 100, maxZ: 100 });
    // 前 4 小段(方向差 < 15°)合成一段 80 m;最後一段轉 90° 另成一段 60 m
    expect(Math.max(...c.filter((p) => Math.abs(p.ang) < 0.1).map((p) => p.room))).toBeGreaterThan(70);
    expect(c.some((p) => Math.abs(p.ang - Math.PI / 2) < 0.01)).toBe(true);
  });

  it('包圍盒篩選不會漏掉跨進範圍的道路', () => {
    const r = data.roads[0];
    const inside = { minX: r.pts[0] - 1, minZ: r.pts[1] - 1, maxX: r.pts[0] + 1, maxZ: r.pts[1] + 1 };
    expect(overlaps(r.bbox, inside)).toBe(true);
  });

  it('地標圖示字', () => {
    expect(landmarkGlyph('opera', '臺中國家歌劇院')).toBe('歌');
    expect(landmarkGlyph('unknown', '某某館')).toBe('某');
  });
});
