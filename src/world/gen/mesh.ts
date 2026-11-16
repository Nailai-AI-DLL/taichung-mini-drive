// 累積網格資料(位置、法向量、頂點色、索引),最後輸出為型別陣列。
// 建築另外帶 wall 屬性(每頂點 2 個數):沿外牆的水平距離(公尺)與建築代碼(細分類、店面、亂數種子),材質用來畫窗格。
import earcut from 'earcut';
import type { Pt } from './geom';
import type { MeshArrays } from '../../map/types';

export class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  /** 建築用:每頂點 [沿牆距離, 建築代碼];null = 不輸出 */
  wall: number[] | null;
  /** 接下來加的頂點用的建築代碼(packBuildingCode) */
  code = 0;

  constructor(opts: { wall?: boolean } = {}) {
    this.wall = opts.wall ? [] : null;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  /** u = 沿外牆的水平距離(公尺),只有建築牆面用得到 */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, rgb: [number, number, number], u = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(rgb[0], rgb[1], rgb[2]);
    this.wall?.push(u, this.code);
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  /** 水平多邊形(朝上),y 為高度。ring 不需封閉。 */
  flatPolygon(ring: Pt[], y: number, rgb: [number, number, number], holes: Pt[][] = []) {
    const flat: number[] = [];
    const holeIdx: number[] = [];
    for (const p of ring) flat.push(p[0], p[1]);
    for (const h of holes) {
      holeIdx.push(flat.length / 2);
      for (const p of h) flat.push(p[0], p[1]);
    }
    const tris = earcut(flat, holeIdx.length ? holeIdx : undefined);
    const base = this.vertexCount;
    for (let i = 0; i < flat.length; i += 2) this.vertex(flat[i], y, flat[i + 1], 0, 1, 0, rgb);
    for (let i = 0; i < tris.length; i += 3) {
      // earcut 回傳的繞向不固定;依面積判斷,保證正面朝上(+Y)
      const a = base + tris[i];
      const b = base + tris[i + 1];
      const c = base + tris[i + 2];
      if (this.isUpward(a, b, c)) this.tri(a, b, c);
      else this.tri(a, c, b);
    }
  }

  /** 三角形 (a,b,c) 以右手定則的法向量是否朝 +Y */
  isUpward(a: number, b: number, c: number): boolean {
    const p = this.pos;
    const ax = p[a * 3], az = p[a * 3 + 2];
    const bx = p[b * 3], bz = p[b * 3 + 2];
    const cx = p[c * 3], cz = p[c * 3 + 2];
    // n_y = (b-a).z*(c-a).x - (b-a).x*(c-a).z
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    return ny > 0;
  }

  toArrays(): MeshArrays {
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      color: new Uint8Array(this.col),
      index: new Uint32Array(this.idx),
      ...(this.wall && { wall: new Float32Array(this.wall) }),
    };
  }
}

/**
 * 建築代碼:細分類(0–7)+ 店面(× CODE_SHOP)+ 亂數種子 0–255(× CODE_SEED)。存成 float,著色器裡用 floor / mod 拆回來;
 * 最大 4095,float 精確表示沒問題。著色器(src/render/building-material.ts)直接用這兩個常數組字串,改這裡兩邊一起變。
 */
export const CODE_SHOP = 8;
export const CODE_SEED = 16;

export function packBuildingCode(kind: number, shop: boolean, seed: number): number {
  return kind + (shop ? CODE_SHOP : 0) + (seed & 255) * CODE_SEED;
}

export function unpackBuildingCode(code: number): { kind: number; shop: boolean; seed: number } {
  return { kind: code % CODE_SHOP, shop: Math.floor(code / CODE_SHOP) % 2 === 1, seed: Math.floor(code / CODE_SEED) };
}

/**
 * 夜裡會自己發光的街道傢俱(招牌板、號誌燈;decisions/0042):用「低矮建築 + 店面」這個建築永遠不會出現的組合當標記
 * (低矮建築不開店),著色器看到就在夜裡把頂點色當自發光。
 */
export const GLOW_CODE = packBuildingCode(6, true, 0);
