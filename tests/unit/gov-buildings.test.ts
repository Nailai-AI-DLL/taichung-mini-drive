// 臺中市建物圖讀取與分類(decisions/0039)。用程式寫一個最小的 Shapefile(.shp/.shx/.dbf)測讀取器,不依賴下載的原始檔。
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { govKind, readGovBuildings } from '../../tools/map-build/lib/gov-buildings';
import { FLOOR_HEIGHT, KIND } from '../../src/config/buildings';

type Rec = { id: number; type: string; struct: string; floors: number; parts: [number, number][][]; shape?: 5 | 15 };

/** 寫出 base.shp / .shx / .dbf(欄位和 114 年版相同:ID、B1A、B1B、B1C、B1D、B1E、B1F) */
function writeShapefile(base: string, recs: Rec[]) {
  const bodies = recs.map((r) => {
    const pts = r.parts.flat();
    const z = r.shape === 15 ? 16 + 8 * pts.length : 0; // PolygonZ:多出 Z 範圍與每點 Z(讀取器不用)
    const b = Buffer.alloc(44 + 4 * r.parts.length + 16 * pts.length + z);
    b.writeInt32LE(r.shape ?? 15, 0);
    const es = pts.map((p) => p[0]), ns = pts.map((p) => p[1]);
    [Math.min(...es), Math.min(...ns), Math.max(...es), Math.max(...ns)].forEach((v, i) => b.writeDoubleLE(v, 4 + 8 * i));
    b.writeInt32LE(r.parts.length, 36);
    b.writeInt32LE(pts.length, 40);
    let s = 0;
    r.parts.forEach((p, i) => {
      b.writeInt32LE(s, 44 + 4 * i);
      s += p.length;
    });
    const p0 = 44 + 4 * r.parts.length;
    pts.forEach((p, i) => {
      b.writeDoubleLE(p[0], p0 + 16 * i);
      b.writeDoubleLE(p[1], p0 + 16 * i + 8);
    });
    return b;
  });
  const head = (len: number) => {
    const h = Buffer.alloc(100);
    h.writeInt32BE(9994, 0);
    h.writeInt32BE(len / 2, 24);
    h.writeInt32LE(1000, 28);
    h.writeInt32LE(15, 32);
    return h;
  };
  const shpLen = 100 + bodies.reduce((s, b) => s + 8 + b.length, 0);
  const shp = [head(shpLen)], shx = [head(100 + 8 * recs.length)];
  let off = 100;
  for (const [i, b] of bodies.entries()) {
    const rh = Buffer.alloc(8);
    rh.writeInt32BE(i + 1, 0);
    rh.writeInt32BE(b.length / 2, 4);
    shp.push(rh, b);
    const x = Buffer.alloc(8);
    x.writeInt32BE(off / 2, 0);
    x.writeInt32BE(b.length / 2, 4);
    shx.push(x);
    off += 8 + b.length;
  }
  writeFileSync(base + '.shp', Buffer.concat(shp));
  writeFileSync(base + '.shx', Buffer.concat(shx));
  const fields: [string, string, number][] = [['ID', 'N', 8], ['B1A', 'C', 8], ['B1B', 'C', 1], ['B1C', 'C', 1], ['B1D', 'N', 2], ['B1E', 'N', 4], ['B1F', 'C', 20]];
  const recLen = 1 + fields.reduce((s, f) => s + f[2], 0);
  const hdrLen = 32 + 32 * fields.length + 1;
  const dh = Buffer.alloc(hdrLen);
  dh[0] = 3;
  dh.writeUInt32LE(recs.length, 4);
  dh.writeUInt16LE(hdrLen, 8);
  dh.writeUInt16LE(recLen, 10);
  fields.forEach(([n, t, l], i) => {
    dh.write(n, 32 + 32 * i, 'ascii');
    dh.write(t, 32 + 32 * i + 11, 'ascii');
    dh[32 + 32 * i + 16] = l;
  });
  dh[hdrLen - 1] = 0x0d;
  const rows = recs.map((r) => {
    const vals = [String(r.id).padStart(8), 'B0001'.padEnd(8), r.type.padEnd(1), r.struct.padEnd(1), String(r.floors).padStart(2), '0'.padStart(4), ''.padEnd(20)];
    return Buffer.from(' ' + vals.join(''), 'utf8');
  });
  writeFileSync(base + '.dbf', Buffer.concat([dh, ...rows, Buffer.from([0x1a])]));
}

/** 順時針(E-N 平面)正方形 */
const square = (e: number, n: number, s: number): [number, number][] => [[e, n], [e, n + s], [e + s, n + s], [e + s, n], [e, n]];

describe('臺中市建物圖讀取', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gov-b-'));
  const base = join(dir, 'b');
  writeShapefile(base, [
    { id: 1, type: '3', struct: '4', floors: 4, parts: [square(1000, 2000, 10)] },
    { id: 2, type: '6', struct: '4', floors: 23, parts: [square(1050, 2000, 30), square(1060, 2010, 5).reverse()], shape: 5 },
    { id: 3, type: '1', struct: '3', floors: 1, parts: [square(5000, 5000, 10)] }, // 範圍外
  ]);

  it('只讀外框中心在範圍內的,樓層、型態、結構、幾何(含內環)都正確;PolygonZ 與 Polygon 都收', () => {
    const got = readGovBuildings(base, [900, 1900, 1200, 2100]);
    expect(got.map((g) => g.id)).toEqual([1, 2]);
    expect(got[0]).toMatchObject({ floors: 4, type: '3', struct: '4' });
    expect(got[0].parts[0]).toEqual(square(1000, 2000, 10));
    expect(got[1].floors).toBe(23);
    expect(got[1].parts).toHaveLength(2);
    expect(got[1].parts[1][1]).toEqual([1065, 2010]);
  });
});

describe('建物圖 → 遊戲分類與高度', () => {
  it('透天 4 樓 = 透天、高度 4 層', () => {
    expect(govKind({ floors: 4, type: '3', struct: '4' })).toEqual({ kind: KIND.House, height: 4 * FLOOR_HEIGHT });
  });
  it('大廈或 6 樓以上 = 大樓', () => {
    expect(govKind({ floors: 23, type: '6', struct: '4' }).kind).toBe(KIND.Apartment);
    expect(govKind({ floors: 7, type: '3', struct: '4' }).kind).toBe(KIND.Apartment);
  });
  it('鐵架搭建、樓層未標 = 低矮建築,至少 1 層高', () => {
    expect(govKind({ floors: 1, type: '1', struct: '3' }).kind).toBe(KIND.Low);
    const z = govKind({ floors: 0, type: '', struct: '4' });
    expect(z.kind).toBe(KIND.Low);
    expect(z.height).toBeGreaterThan(2);
  });
});

import { interiorPoint } from '../../src/world/gen/geom';
import { pointInPolygon, centroid } from '../../src/world/gen/geom';
describe('多邊形內部代表點(0039 驗收:凹多邊形的頂點平均中心可能在外面)', () => {
  it('凸多邊形直接用頂點平均中心', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(interiorPoint(sq)).toEqual(centroid(sq));
  });
  it('C 形多邊形:頂點平均中心在外面,代表點在裡面', () => {
    const c: [number, number][] = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10]];
    expect(pointInPolygon(centroid(c), c)).toBe(false);
    expect(pointInPolygon(interiorPoint(c), c)).toBe(true);
  });
});

import { inheritKind, selfIntersects, simplifyRing } from '../../tools/map-build/lib/gov-buildings';
describe('外框簡化(0039 鋪全區的效能處理)', () => {
  it('拿掉共線的多餘點,真實轉角都留著', () => {
    const r: [number, number][] = [[0, 0], [5, 0.05], [10, 0], [10, 10], [5, 10], [0, 10]];
    expect(simplifyRing(r)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });
  it('每個原始頂點離簡化後的外框都 ≤ 容許誤差(驗收發現:量到直線而非線段時,真實轉角最多丟 0.92 m)', () => {
    const segD = (p: [number, number], a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
    };
    const shapes: [number, number][][] = [
      // 實際建物(建物圖 ID 437376,世界座標、以第一點為原點):驗收發現舊版會丟掉 (0.754, -0.53) 這個角,偏差 0.92 m
      [[0, 0], [-0.75, 0.61], [-0.83, 4.555], [-2.95, 4.57], [-3.09, 1.73], [0.754, -0.53]],
      // 細長突出:(11, 1.01) 幾乎在 (10,1)–(0,1.02) 的延長線上,但離線段 1 m
      [[0, 0], [10, 0], [10, 1], [11, 1.01], [0, 1.02]],
      // 凹口 + 共線點
      [[0, 0], [4, 0.02], [8, 0], [8, 6], [5, 6], [5, 3], [3, 3], [3, 6], [0, 6]],
      // 鋸齒牆
      Array.from({ length: 20 }, (_, i) => [i, i % 2 ? 0.1 : 0] as [number, number]).concat([[19, 5], [0, 5]]),
    ];
    for (const r of shapes) {
      const out = simplifyRing(r);
      for (const p of r) {
        const d = Math.min(...out.map((a, i) => segD(p, a, out[(i + 1) % out.length])));
        expect(d).toBeLessThanOrEqual(0.25 + 1e-9);
      }
      expect(selfIntersects(out)).toBe(false);
    }
  });
  it('簡化後不會自交', () => {
    const r: [number, number][] = [[0, 0], [10, 0], [10, 0.2], [0.3, 0.2], [0.3, 5], [0, 5]];
    expect(selfIntersects(simplifyRing(r))).toBe(false);
  });
});

describe('從被換掉的 OSM 建築繼承類別', () => {
  it('廟宇、學校、公共、商辦繼承;低矮不繼承;廟宇只給 4 樓以下', () => {
    expect(inheritKind(KIND.House, 2, KIND.Temple)).toBe(KIND.Temple);
    expect(inheritKind(KIND.Apartment, 13, KIND.Temple)).toBe(KIND.Apartment);
    expect(inheritKind(KIND.Apartment, 8, KIND.School)).toBe(KIND.School);
    expect(inheritKind(KIND.Low, 1, KIND.Temple)).toBe(KIND.Low);
    expect(inheritKind(KIND.House, 3, KIND.Apartment)).toBe(KIND.House);
    expect(inheritKind(KIND.House, 3, undefined)).toBe(KIND.House);
  });
});

import { GOV_NO_SHOP_TYPES, GOV_ROW_TYPE } from '../../tools/map-build/lib/gov-buildings';
describe('建物圖房屋型態 → 店面規則(0041)', () => {
  it('連棟透天是招牌較密的型態;獨戶、雙併不開店;公寓、大廈不受影響', () => {
    expect(GOV_ROW_TYPE).toBe('3');
    expect([...GOV_NO_SHOP_TYPES].sort()).toEqual(['1', '2']);
    for (const t of ['3', '4', '5', '6']) expect(GOV_NO_SHOP_TYPES.has(t)).toBe(false);
  });
});
