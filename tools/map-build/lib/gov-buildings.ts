// 臺中市建物圖(114 年版,data.gov.tw 158889;decisions/0039)讀取與分類。
// 檔案:ESRI Shapefile(.shp 多邊形 + .shx 索引 + .dbf 屬性),座標 TWD97 TM2 121 分帶,屬性 UTF-8。
// 不用外部套件:Shapefile 格式簡單,直接讀位元組。只在建置端使用。
import { closeSync, openSync, readSync, readFileSync } from 'node:fs';
import { FLOOR_HEIGHT, KIND, type BuildingKind } from '../../../src/config/buildings';

/** 一筆建物(座標仍是 TM2 公尺) */
export interface GovBuilding {
  id: number;
  /** 地上樓層數(B1D;0 = 未標) */
  floors: number;
  /** 房屋型態(B1B):1 獨戶、2 雙併、3 連棟透天、4 連棟公寓、5 獨棟公寓、6 大廈;'' = 未標 */
  type: string;
  /** 房屋結構(B1C):1 木造、2 磚造、3 鐵架搭建、4 R.C.、5 其他 */
  struct: string;
  /** Shapefile 的各個 part(外環順時針、內環逆時針;頭尾點相同) */
  parts: [number, number][][];
}

/** TM2 外框 [minE, minN, maxE, maxN] */
export type Tm2Box = readonly [number, number, number, number];

interface DbfField {
  name: string;
  off: number;
  len: number;
}

/**
 * 讀出外框中心落在 box 內的建物。base = 不含副檔名的路徑(例 data/gov/buildings/shp/01-SHP/b114)。
 * 先只讀每筆的外框(36 bytes)篩選,再讀幾何與屬性,全市 126 萬筆約數秒。
 */
export function readGovBuildings(base: string, box: Tm2Box): GovBuilding[] {
  const shx = readFileSync(base + '.shx');
  const n = (shx.length - 100) / 8;
  const dbf = openSync(base + '.dbf', 'r');
  const shp = openSync(base + '.shp', 'r');
  try {
    const head = Buffer.alloc(32);
    readSync(dbf, head, 0, 32, 0);
    const records = head.readUInt32LE(4), headLen = head.readUInt16LE(8), recLen = head.readUInt16LE(10);
    if (records !== n) throw new Error(`建物圖 .dbf 筆數 ${records} 和 .shx ${n} 不一致`);
    const fields = new Map<string, DbfField>();
    const fd = Buffer.alloc(headLen - 32);
    readSync(dbf, fd, 0, fd.length, 32);
    for (let p = 0, off = 1; p + 32 <= fd.length && fd[p] !== 0x0d; p += 32) {
      const name = fd.toString('ascii', p, p + 11).replace(/\0.*$/, '');
      const len = fd[p + 16];
      fields.set(name, { name, off, len });
      off += len;
    }
    for (const k of ['ID', 'B1B', 'B1C', 'B1D']) if (!fields.has(k)) throw new Error(`建物圖 .dbf 缺欄位 ${k}`);
    const field = (rec: Buffer, k: string) => {
      const f = fields.get(k)!;
      return rec.toString('utf8', f.off, f.off + f.len).trim();
    };

    const out: GovBuilding[] = [];
    const bbox = Buffer.alloc(44);
    const rec = Buffer.alloc(recLen);
    for (let i = 0; i < n; i++) {
      const off = shx.readUInt32BE(100 + 8 * i) * 2;
      const len = shx.readUInt32BE(104 + 8 * i) * 2;
      readSync(shp, bbox, 0, 44, off + 8);
      const type = bbox.readInt32LE(0);
      if (type !== 5 && type !== 15) continue; // 只收多邊形(5)與 PolygonZ(15;114 年版是這種,前段格式相同,Z 值不用)
      const e0 = bbox.readDoubleLE(4), n0 = bbox.readDoubleLE(12), e1 = bbox.readDoubleLE(20), n1 = bbox.readDoubleLE(28);
      const ce = (e0 + e1) / 2, cn = (n0 + n1) / 2;
      if (ce < box[0] || ce > box[2] || cn < box[1] || cn > box[3]) continue;
      const body = Buffer.alloc(len);
      readSync(shp, body, 0, len, off + 8);
      const numParts = body.readInt32LE(36), numPoints = body.readInt32LE(40);
      const starts: number[] = [];
      for (let k = 0; k < numParts; k++) starts.push(body.readInt32LE(44 + 4 * k));
      starts.push(numPoints);
      const pts0 = 44 + 4 * numParts;
      const parts: [number, number][][] = [];
      for (let k = 0; k < numParts; k++) {
        const ring: [number, number][] = [];
        for (let j = starts[k]; j < starts[k + 1]; j++) ring.push([body.readDoubleLE(pts0 + 16 * j), body.readDoubleLE(pts0 + 16 * j + 8)]);
        parts.push(ring);
      }
      readSync(dbf, rec, 0, recLen, headLen + recLen * i);
      out.push({ id: Number(field(rec, 'ID')), floors: Number(field(rec, 'B1D')) || 0, type: field(rec, 'B1B'), struct: field(rec, 'B1C'), parts });
    }
    return out;
  } finally {
    closeSync(dbf);
    closeSync(shp);
  }
}

/** 推論:面積小於此值(平方公尺)的多邊形不收(樓梯間、雨遮、描圖碎片) */
export const GOV_MIN_AREA = 6;

/**
 * 建物圖的型態 / 結構 / 樓層 → 遊戲的細分類與高度(公尺)。
 * 推論的對應:鐵架搭建 = 低矮附屬(鐵皮屋,不畫窗);透天與獨戶、雙併 = 透天(6 樓以上算大樓);公寓、大廈 = 大樓。
 * 樓層未標(0)當 1 樓低矮建築。
 */
export function govKind(b: Pick<GovBuilding, 'floors' | 'type' | 'struct'>): { kind: BuildingKind; height: number } {
  const floors = Math.max(1, b.floors);
  const height = floors * FLOOR_HEIGHT;
  if (b.struct === '3' || b.floors === 0) return { kind: KIND.Low, height: Math.max(1, b.floors) * FLOOR_HEIGHT * 0.9 };
  if (b.type === '6' || floors >= 6) return { kind: KIND.Apartment, height };
  if (b.type === '4' || b.type === '5') return { kind: KIND.Apartment, height };
  if (b.type === '1' || b.type === '2' || b.type === '3') return { kind: KIND.House, height };
  return { kind: KIND.Generic, height };
}

/** 推論:外框簡化容許誤差(公尺)。測繪圖的牆線常有多餘的共線點,拿掉可減少擠出的三角形(0039 鋪全區前的效能處理) */
export const GOV_SIMPLIFY = 0.25;

/** Douglas–Peucker 簡化閉合外環(不含重複的頭尾點);至少留 3 點 */
export function simplifyRing(ring: [number, number][], tol = GOV_SIMPLIFY): [number, number][] {
  const n = ring.length;
  if (n <= 4) return ring;
  // 從離第 0 點最遠的點切成兩段折線分別簡化
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const dp = (a: number, b: number) => {
    // a → b 沿環前進(b 可以回到 0)
    const A = ring[a], B = ring[b % n];
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      // 量到「線段」的距離(不是無限長直線;0039 驗收:用直線距離會丟掉落在端點外的真實轉角)
      const d = segDist(ring[i], A, B);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd > tol) {
      keep[best] = 1;
      dp(a, best);
      dp(best, b);
    }
  };
  dp(0, far);
  dp(far, n);
  const out = ring.filter((_, i) => keep[i]);
  // 簡化後自交(原本不自交)就不簡化
  return out.length >= 3 && (!selfIntersects(out) || selfIntersects(ring)) ? out : ring;
}

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** 閉合環的不相鄰邊是否相交(O(n²),建物外框點數少) */
export function selfIntersects(r: [number, number][]): boolean {
  const n = r.length;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = r[i], b = r[(i + 1) % n], c = r[j], d = r[(j + 1) % n];
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  return false;
}

/** 推論:建物圖建築繼承「廟宇」的最高樓層(OSM 廟宇外框常包到旁邊大樓,廟宇樣式沒有窗) */
export const TEMPLE_MAX_FLOORS = 4;
/** 建物圖沒有用途分類,從被換掉的 OSM 建築繼承的細分類 */
export const INHERIT_KINDS: ReadonlySet<number> = new Set([KIND.Temple, KIND.School, KIND.Public, KIND.Commercial]);

/**
 * 建物圖建築落在被換掉的 OSM 建築裡時,決定最後的細分類(0039):
 * 低矮(鐵皮)不繼承;廟宇只給 TEMPLE_MAX_FLOORS 樓以下;其他 INHERIT_KINDS 照繼承。高度一律用建物圖樓層。
 */
export function inheritKind(own: BuildingKind, floors: number, from: number | undefined): BuildingKind {
  if (from === undefined || own === KIND.Low || !INHERIT_KINDS.has(from)) return own;
  if (from === KIND.Temple && floors > TEMPLE_MAX_FLOORS) return own;
  return from as BuildingKind;
}
