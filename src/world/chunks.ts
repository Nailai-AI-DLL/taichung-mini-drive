// 把 world.json 的 2D 描述分到 250 m 格子,並生成單一格子的網格(docs/decisions/0012)。
// 不依賴 DOM 與 three.js,可在 Node 測試中使用。
import { PALETTE, hexToRgb } from '../config/palette';
import { subdivideElevatedPolyline } from '../map/elevated';
import { QUANT, roadWayOf, type MeshArrays, type RoadWay, type WorldJson, type WorldStreet } from '../map/types';
import type { WorldTileCatalog } from '../map/tiles';
import { BAR_GAP, BAR_LEN, BAR_W, CURB_W, DASH_OFF, DASH_ON, MEDIAN_CURB } from '../config/street';
import { centroid, clipPolygon, clipPolyline, clipPolyline3D, hash32, type Pt, type Rect } from './gen/geom';
import { dashes, miterNormals, offsetLine } from './gen/polyline';
import { MeshBuilder, packBuildingCode } from './gen/mesh';
import { addRibbon } from './gen/ribbon';
import { addElevatedRoads, type ElevatedRoadPiece } from './gen/elevated-road';
import { buildChunkTerrain, drapeMeshArrays, extendBuildingSkirt, shiftMeshRangeY, subdivideLine2D } from './gen/terrain';
import type { ElevationSampler } from './surface';
import { extrude, PLAIN_CODE } from './gen/extrude';
import { addRoofProps } from './gen/roof-props';
import { addBusStop, addSign, addSignal, addStreetLight, propPoses, scooterPoses, type FurnitureColors, genTreePoses } from './gen/furniture';
import { PROP_TREE_SCALE, propsMode } from '../config/props';
import { addViaduct, viaductCollision, viaductSpans, type ViaductSrc } from './gen/viaduct';
import { BUS_POLE_HIT_R, BUS_SHELTER_D, BUS_SHELTER_H, BUS_SHELTER_L, LIGHT_HIT_R, POST_HIT_H, SCOOTER_H, SCOOTER_LEN, SCOOTER_SLOT, SIGNAL_HIT_R, TREE_HIT_R, furnitureShow } from '../config/furniture';
import type { FurnitureCollision } from '../physics/world';
import { FLOOR_HEIGHT, KIND, type BuildingKind } from '../config/buildings';

// 各圖層高度(毫米級差距)。實際的前後順序靠地面材質依高度做的深度偏移(src/render/scene.ts),遠處也不會閃爍
import { SINK_RAIL_H } from '../map/types';
export { SINK_RAIL_H };
const Y_AREA = 0.01;
const Y_WATER = 0.015;
const Y_SIDEWALK = 0.02;
const Y_CURB = 0.025;
const Y_ROAD = 0.03;
const Y_MEDIAN = 0.035;
const Y_MEDIAN_TOP = 0.04;
const Y_MARK = 0.045;

type Rgb = [number, number, number];

interface RoadPiece {
  osmId?: number;
  pts: Pt[];
  width: number;
  sidewalk: number;
  /** 裁切到街道細節範圍內的部分(畫路緣石) */
  curbs: Pt[][];
  /** 高架道路或上下匝道的各折點高度(公尺);未定義或全為 0 時為一般平面道路 */
  elev?: number[];
  lanes?: number;
  oneway?: boolean;
}

/** 街道細節的平面四邊形:枕木線、分隔島(路緣 / 植栽) */
const enum QuadKind {
  Bar,
  MedianCurb,
  MedianTop,
}

interface StreetSrc {
  junctions: Pt[][];
  strips: { line: Pt[]; m: WorldStreet['strips'][number]['m'] }[];
  crosswalks: WorldStreet['crosswalks'];
  medians: { line: Pt[]; ws: number[] }[];
}

export interface ChunkSrc {
  key: string;
  cx: number;
  cz: number;
  rect: Rect;
  roads: RoadPiece[];
  /** 鄰近 15 m 範圍內的高架路段(供匝道與高架主線跨格匯流處判斷護欄開口) */
  elevatedContext?: ElevatedRoadPiece[];
  waterways: { pts: Pt[]; w: number }[];
  areas: { ring: Pt[]; k: 0 | 1 | 2 }[];
  /** t = 細分類(src/config/buildings.ts 的 KIND),s = 一樓畫店面 */
  /** col = 知名地點的外牆色(decisions/0031);沒有就依 id 從色票挑 */
  buildings: { id: number; h: number; t: BuildingKind; s: boolean; rings: Pt[][]; sharp?: boolean[]; col?: Rgb }[];
  /**
   * 經過這一格的街道細節(與其他格共用同一份物件)。虛線、枕木線、分隔島四邊形到 buildChunk 才產生,
   * 用完即丟:全區先展開會多佔約 54 MB 記憶體、載入多 130 ms(2026-10-31 實測)
   */
  street: StreetSrc;
  /** 地標:rings 為相對於 (x, z) 的局部座標 */
  landmarks: { id: string; name: string; model: string; x: number; z: number; h: number; sink?: number; rings: Pt[][] }[];
  /** 街道傢俱(0015 第四批):依位置分格;a = 懸臂朝向(弧度),arm = 懸臂長(公尺) */
  /** 機車排:p = 第一台中心、a = 排列方向、n = 台數、f = 車頭朝向 */
  furniture: {
    trees: Pt[];
    /** 和 trees 一一對應的樹種 */
    treeKinds: number[];
    lights: { p: Pt; a: number }[];
    signals: { p: Pt; a: number; arm: number }[];
    scooters: { p: Pt; a: number; n: number; f: number }[];
    /** 直式招牌:p = 貼牆處、a = 伸出方向、y0 / y1 高度、c 底色 */
    signs: { p: Pt; a: number; y0: number; y1: number; c: number }[];
    /** 公車站:a = 朝向車道 */
    busStops: { p: Pt; a: number; shelter: boolean }[];
    /** 高架捷運經過這一格的部分(decisions/0030);沒有就沒有這個欄位 */
    viaduct?: ViaductSrc;
  };
}

export interface ChunkMeshes {
  /** 地面類:綠地、水、人行道、道路(同一材質,合併成一個網格) */
  ground: MeshArrays;
  /** 建築外牆、屋頂(也是碰撞體) */
  buildings: MeshArrays;
  /** 屋頂附加物(鐵皮加蓋、水塔、屋突):和建築同材質一起畫,但不當碰撞體 */
  roofProps: MeshArrays;
  /** 街道傢俱(行道樹、路燈、號誌桿、機車):和建築同材質一起畫;碰撞不用這個網格,改用 furnitureCollision 的簡單形狀(0015 §11.6) */
  furniture: MeshArrays;
  /** 機車:每台 [x, z, 車頭朝向, 車身色編號];執行端用一個共用的 InstancedMesh 畫(src/render/scooters.ts) */
  scooters: Float32Array;
  /** Tripo 樣板物件(樹、路燈;?props=gen 時為空):每個 [種類, x, z, 朝向, 大小];執行端用 src/render/props.ts 畫 */
  props: Float32Array;
  /** 每個地標外框擠出的量體(世界座標,順序同 ChunkSrc.landmarks):一律當碰撞體;模型載入失敗時拿來顯示 */
  landmarkSolids: MeshArrays[];
  /** 3D 高架道路與匝道路面(含標線;物理摩擦係數 1.0) */
  roadDeck?: MeshArrays;
  /** 3D 高架道路水泥防撞護欄、箱梁底板與橋墩(物理碰撞體) */
  roadBarrier?: MeshArrays;
  /** 3D DTM 地表網格(僅在地形模式存在;同時作為視覺地表與 Rapier 物理碰撞體) */
  terrain?: MeshArrays;
}

export interface World {
  json: WorldJson;
  roads: RoadWay[];
  chunkSize: number;
  chunks: Map<string, ChunkSrc>;
  /** 分區按需載入目錄(從 index.json 載入時啟用;單檔 world.json 模式為 undefined) */
  tiles?: WorldTileCatalog;
  /** 3D 地形高程取樣器(從 elevation.json 載入時啟用;未提供時為平面模式 y = 0) */
  elevation?: ElevationSampler;
}

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

const toPts = (q: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < q.length; i += 2) out.push([q[i] / QUANT, q[i + 1] / QUANT]);
  return out;
};

function bbox(pts: Pt[]): Rect {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** 載入時把所有物件分到格子:建築依外環中心,道路、水道、面依格子裁切 */
export function decodeWorld(json: WorldJson): World {
  const size = json.meta.chunkSize;
  const chunks = new Map<string, ChunkSrc>();
  const get = (cx: number, cz: number) => {
    const key = chunkKey(cx, cz);
    let c = chunks.get(key);
    if (!c) {
      const rect = { minX: cx * size, minZ: cz * size, maxX: (cx + 1) * size, maxZ: (cz + 1) * size };
      c = { key, cx, cz, rect, roads: [], waterways: [], areas: [], buildings: [], street: { junctions: [], strips: [], crosswalks: [], medians: [] }, landmarks: [], furniture: { trees: [], treeKinds: [], lights: [], signals: [], scooters: [], signs: [], busStops: [] } };
      chunks.set(key, c);
    }
    return c;
  };
  /** 依包圍盒找出重疊的格子 */
  const each = (pts: Pt[], pad: number, fn: (c: ChunkSrc) => void) => {
    const b = bbox(pts);
    for (let cx = Math.floor((b.minX - pad) / size); cx <= Math.floor((b.maxX + pad) / size); cx++)
      for (let cz = Math.floor((b.minZ - pad) / size); cz <= Math.floor((b.maxZ + pad) / size); cz++) fn(get(cx, cz));
  };

  const dr = json.meta.detailRect;
  const detailRect: Rect | null = dr ? { minX: dr[0], minZ: dr[1], maxX: dr[2], maxZ: dr[3] } : null;
  const at = (p: Pt) => get(Math.floor(p[0] / size), Math.floor(p[1] / size));
  for (const r of json.roads) {
    const pts = toPts(r.pts);
    const rawElev = r.elev ? r.elev.map((v) => v / QUANT) : undefined;
    const isElev = !!rawElev && rawElev.some((y) => y > 0.05);
    if (isElev) {
      const sub = subdivideElevatedPolyline(pts, rawElev!);
      each(sub.pts, 15, (c) => {
        for (const piece of clipPolyline3D(sub.pts, sub.elev, c.rect)) {
          c.roads.push({
            osmId: r.osmId,
            pts: piece.pts,
            elev: piece.elev,
            width: r.width,
            sidewalk: 0,
            curbs: [],
            lanes: r.lanes,
            oneway: r.oneway,
          });
        }
        const ctxRect = {
          minX: c.rect.minX - 15,
          minZ: c.rect.minZ - 15,
          maxX: c.rect.maxX + 15,
          maxZ: c.rect.maxZ + 15,
        };
        for (const ctxPiece of clipPolyline3D(sub.pts, sub.elev, ctxRect)) {
          (c.elevatedContext ??= []).push({
            osmId: r.osmId,
            pts: ctxPiece.pts,
            elev: ctxPiece.elev,
            width: r.width,
            lanes: r.lanes,
            oneway: r.oneway,
          });
        }
      });
      continue;
    }
    each(pts, 0, (c) => {
      for (const piece of clipPolyline(pts, c.rect)) {
        const curbs = detailRect && r.sidewalk > 0 ? clipPolyline(piece, detailRect) : [];
        c.roads.push({ osmId: r.osmId, pts: piece, width: r.width, sidewalk: r.sidewalk, curbs });
      }
    });
  }
  if (json.street) assignStreet(json.street, at, each);
  for (const w of json.waterways) {
    const pts = toPts(w.pts);
    each(pts, 0, (c) => {
      for (const piece of clipPolyline(pts, c.rect)) c.waterways.push({ pts: piece, w: w.w });
    });
  }
  for (const a of json.areas) {
    const ring = toPts(a.ring);
    each(ring, 0, (c) => {
      const r = clipPolygon(ring, c.rect);
      if (r.length >= 3) c.areas.push({ ring: r, k: a.k });
    });
  }
  for (const b of json.buildings) {
    const rings = b.rings.map(toPts);
    const [x, z] = centroid(rings[0]);
    get(Math.floor(x / size), Math.floor(z / size)).buildings.push({ id: b.id, h: b.h / 10, t: b.t as BuildingKind, s: b.s === 1, rings, ...(b.c && { sharp: sharpFlags(rings[0].length, b.c) }), ...(b.k && { col: placeWallRgb(b.k) }) });
  }
  for (const l of json.landmarks ?? []) {
    get(Math.floor(l.x / size), Math.floor(l.z / size)).landmarks.push({ id: l.id, name: l.name, model: l.model, x: l.x, z: l.z, h: l.h / 10, ...(l.sink && { sink: l.sink }), rings: l.rings.map(toPts) });
  }
  // 高架捷運:橋面小段依中點、墩柱與車站依位置分格
  if (json.viaduct) {
    const vd = (p: Pt) => (at(p).furniture.viaduct ??= { spans: [], piers: [], stations: [] });
    for (const l of json.viaduct.lines) for (const sp of viaductSpans(toPts(l))) vd([(sp[0][0] + sp[1][0]) / 2, (sp[0][1] + sp[1][1]) / 2]).spans.push(sp);
    const ps = json.viaduct.piers;
    for (let i = 0; i + 2 < ps.length; i += 3) {
      const p: Pt = [ps[i] / QUANT, ps[i + 1] / QUANT];
      vd(p).piers.push({ p, a: ps[i + 2] / 1000 });
    }
    for (const st of json.viaduct.stations) vd([st.x, st.z]).stations.push({ name: st.name, p: [st.x, st.z], a: st.a / 1000, bridges: (st.b ?? []).map((b) => [[b[0], b[1]], [b[2], b[3]]] as [Pt, Pt]) });
  }
  const fu = json.furniture;
  if (fu) {
    for (let i = 0; i + 2 < fu.trees.length; i += 3) {
      const p: Pt = [fu.trees[i] / QUANT, fu.trees[i + 1] / QUANT];
      const f = at(p).furniture;
      f.trees.push(p);
      f.treeKinds.push(fu.trees[i + 2]);
    }
    for (let i = 0; i + 5 < (fu.signs ?? []).length; i += 6) {
      const p: Pt = [fu.signs[i] / QUANT, fu.signs[i + 1] / QUANT];
      at(p).furniture.signs.push({ p, a: fu.signs[i + 2] / 1000, y0: fu.signs[i + 3] / 10, y1: fu.signs[i + 4] / 10, c: fu.signs[i + 5] });
    }
    for (let i = 0; i + 3 < (fu.busStops ?? []).length; i += 4) {
      const p: Pt = [fu.busStops[i] / QUANT, fu.busStops[i + 1] / QUANT];
      at(p).furniture.busStops.push({ p, a: fu.busStops[i + 2] / 1000, shelter: fu.busStops[i + 3] === 1 });
    }
    for (let i = 0; i + 2 < fu.lights.length; i += 3) {
      const p: Pt = [fu.lights[i] / QUANT, fu.lights[i + 1] / QUANT];
      at(p).furniture.lights.push({ p, a: fu.lights[i + 2] / 1000 });
    }
    for (let i = 0; i + 3 < fu.signals.length; i += 4) {
      const p: Pt = [fu.signals[i] / QUANT, fu.signals[i + 1] / QUANT];
      at(p).furniture.signals.push({ p, a: fu.signals[i + 2] / 1000, arm: fu.signals[i + 3] / 10 });
    }
    // 一排機車整排跟著第一台所在的格子
    for (let i = 0; i + 4 < (fu.scooters ?? []).length; i += 5) {
      const p: Pt = [fu.scooters[i] / QUANT, fu.scooters[i + 1] / QUANT];
      at(p).furniture.scooters.push({ p, a: fu.scooters[i + 2] / 1000, n: fu.scooters[i + 3], f: fu.scooters[i + 4] / 1000 });
    }
  }
  // 沒有任何內容的格子不保留
  for (const [k, c] of chunks)
    if (!c.roads.length && !c.waterways.length && !c.areas.length && !c.buildings.length && !c.landmarks.length && !c.street.strips.length && !c.street.crosswalks.length && !c.street.medians.length && !c.street.junctions.length && !c.furniture.trees.length && !c.furniture.lights.length && !c.furniture.signals.length && !c.furniture.scooters.length && !c.furniture.signs.length && !c.furniture.busStops.length && !c.furniture.viaduct) chunks.delete(k);
  return { json, roads: json.roads.map(roadWayOf), chunkSize: size, chunks };
}

/** 街道細節分格:依包圍盒放進經過的每一格(標線平移 ≤ 半個路寬、分隔島半寬、枕木紋範圍都在 pad 內) */
function assignStreet(st: WorldStreet, at: (p: Pt) => ChunkSrc, each: (pts: Pt[], pad: number, fn: (c: ChunkSrc) => void) => void) {
  // 路口鋪面整塊跟著形心所在的格子
  for (const j of st.junctions ?? []) {
    const ring = toPts(j);
    at(centroid(ring)).street.junctions.push(ring);
  }
  for (const s of st.strips) {
    const item = { line: toPts(s.pts), m: s.m };
    const pad = Math.max(...s.m.map((k) => Math.abs(k.o))) / 100 + 1;
    each(item.line, pad, (c) => c.street.strips.push(item));
  }
  // 枕木紋整組跟著中心點所在的格子
  for (const cw of st.crosswalks) at([cw.p[0] / QUANT, cw.p[1] / QUANT]).street.crosswalks.push(cw);
  for (const md of st.medians) {
    const item = { line: toPts(md.pts), ws: md.ws };
    each(item.line, Math.max(...md.ws) / 20 + 1, (c) => c.street.medians.push(item));
  }
}

const midpoint = (q: Pt[]): Pt => {
  let x = 0, z = 0;
  for (const p of q) {
    x += p[0];
    z += p[1];
  }
  return [x / q.length, z / q.length];
};
const inChunk = (p: Pt, r: Rect) => p[0] >= r.minX && p[0] < r.maxX && p[1] >= r.minZ && p[1] < r.maxZ;

/**
 * 一格的街道細節幾何(decisions/0015)。虛線、分隔島在整條線上算好,再只留中點落在這格的部分,
 * 虛線的節奏與分隔島的轉角才不會在格子邊界斷開;實線直接裁切到格子。
 */
function streetGeometry(c: ChunkSrc) {
  const marks: { pts: Pt[]; w: number; c: 0 | 1 }[] = [];
  const quads: { q: Pt[]; k: QuadKind }[] = [];
  for (const s of c.street.strips) {
    for (const m of s.m) {
      const off = m.o ? offsetLine(s.line, m.o / 100) : s.line;
      const w = m.w / 100;
      if (m.d) {
        for (const d of dashes(off, DASH_ON, DASH_OFF)) if (inChunk(midpoint(d), c.rect)) marks.push({ pts: d, w, c: m.c });
      } else for (const piece of clipPolyline(off, c.rect)) marks.push({ pts: piece, w, c: m.c });
    }
  }
  for (const cw of c.street.crosswalks) {
    const p: Pt = [cw.p[0] / QUANT, cw.p[1] / QUANT];
    const v: Pt = [Math.cos(cw.v / 1000), Math.sin(cw.v / 1000)];
    const u: Pt = [Math.cos(cw.u / 1000), Math.sin(cw.u / 1000)];
    const span = (2 * cw.h) / 10;
    const n = Math.max(1, Math.floor((span + BAR_GAP) / (BAR_W + BAR_GAP)));
    const t0 = -((n * BAR_W + (n - 1) * BAR_GAP) / 2) + BAR_W / 2;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (BAR_W + BAR_GAP);
      const corner = (a: number, b: number): Pt => [p[0] + v[0] * (t + a) + u[0] * b, p[1] + v[1] * (t + a) + u[1] * b];
      const hw = BAR_W / 2, hl = BAR_LEN / 2;
      quads.push({ q: [corner(-hw, -hl), corner(hw, -hl), corner(hw, hl), corner(-hw, hl)], k: QuadKind.Bar });
    }
  }
  for (const md of c.street.medians) {
    const line = md.line;
    const nm = miterNormals(line);
    const side = (i: number, d: number): Pt => [line[i][0] + nm[i].n[0] * nm[i].k * d, line[i][1] + nm[i].n[1] * nm[i].k * d];
    for (let i = 0; i + 1 < line.length; i++) {
      const wa = md.ws[i] / 20, wb = md.ws[i + 1] / 20; // 半寬
      const q = [side(i, wa), side(i + 1, wb), side(i + 1, -wb), side(i, -wa)];
      if (!inChunk(midpoint(q), c.rect)) continue;
      quads.push({ q, k: QuadKind.MedianCurb });
      const ia = wa - MEDIAN_CURB, ib = wb - MEDIAN_CURB;
      if (ia > 0.1 && ib > 0.1) quads.push({ q: [side(i, ia), side(i + 1, ib), side(i + 1, -ib), side(i, -ia)], k: QuadKind.MedianTop });
    }
  }
  return { marks, quads };
}

/** world.json 的不做圓角頂點索引 → 每個頂點一個旗標 */
export function sharpFlags(n: number, idx: readonly number[]): boolean[] {
  const out = new Array<boolean>(n).fill(false);
  for (const i of idx) out[i] = true;
  return out;
}

/** 知名地點的外牆色:代表色往白色混 PLACE_WALL_TINT(整棟塗飽和色太重;樓頂招牌才用原色) */
export const PLACE_WALL_TINT = 0.55;
export function placeWallRgb(hex: string): Rgb {
  const c = hexToRgb(hex);
  return [0, 1, 2].map((i) => Math.round(c[i] + (255 - c[i]) * PLACE_WALL_TINT)) as Rgb;
}

/** 建築外牆色:依 OSM id 從該細分類的色系中挑一色 */
export function buildingRgb(id: number, kind: BuildingKind): Rgb {
  const set = PALETTE.buildingKinds[kind].walls;
  return hexToRgb(set[hash32(id * 7 + 3) % set.length]);
}

export function buildingRoofRgb(kind: BuildingKind): Rgb {
  return hexToRgb(PALETTE.buildingKinds[kind].roof);
}

/** 建築代碼(畫窗格用):細分類、店面、由 id 決定的亂數種子。廟宇一樓一律畫柱廊(和店面同一套柱子) */
export function buildingCode(id: number, kind: BuildingKind, shop: boolean): number {
  return packBuildingCode(kind, shop || kind === KIND.Temple, hash32(id * 13 + 5));
}

/** 當碰撞體的網格:建築、地標量體、以及 3D 高架道路水泥護欄與橋墩。屋頂附加物不算(車子到不了屋頂,三角形不用進物理) */
export function colliderMeshes(m: ChunkMeshes): MeshArrays[] {
  return [m.buildings, ...m.landmarkSolids, ...(m.roadBarrier?.index.length ? [m.roadBarrier] : [])];
}

/** 街道傢俱的碰撞形狀(世界座標):樹幹、路燈、號誌桿各一個圓柱,一排機車一個長方體;物理端用 addStaticFurniture 加入 */
export function furnitureCollision(c: ChunkSrc, elevation?: ElevationSampler): FurnitureCollision {
  const f = c.furniture;
  const trees = furnitureShow.trees ? f.trees : [];
  const scooters = furnitureShow.scooters ? f.scooters : [];
  const yOpt = (x: number, z: number) => (elevation ? { y: elevation.sampleY(x, z) } : {});
  return {
    posts: [
      ...trees.map((p) => ({ x: p[0], z: p[1], ...yOpt(p[0], p[1]), r: TREE_HIT_R })),
      ...f.lights.map((l) => ({ x: l.p[0], z: l.p[1], ...yOpt(l.p[0], l.p[1]), r: LIGHT_HIT_R })),
      ...f.signals.map((s) => ({ x: s.p[0], z: s.p[1], ...yOpt(s.p[0], s.p[1]), r: SIGNAL_HIT_R })),
      ...f.busStops.filter((b) => !b.shelter).map((b) => ({ x: b.p[0], z: b.p[1], ...yOpt(b.p[0], b.p[1]), r: BUS_POLE_HIT_R })),
    ],
    postH: POST_HIT_H,
    boxes: [
      ...scooters.map((s) => {
        const k = ((s.n - 1) * SCOOTER_SLOT) / 2;
        const x = s.p[0] + Math.cos(s.a) * k;
        const z = s.p[1] + Math.sin(s.a) * k;
        return { x, z, ...yOpt(x, z), a: s.a, hx: (s.n * SCOOTER_SLOT) / 2, hz: SCOOTER_LEN / 2, h: SCOOTER_H };
      }),
      // 候車亭:長邊沿道路(朝向車道 a 轉 90°)
      ...f.busStops.filter((b) => b.shelter).map((b) => ({ x: b.p[0], z: b.p[1], ...yOpt(b.p[0], b.p[1]), a: b.a + Math.PI / 2, hx: BUS_SHELTER_L / 2, hz: BUS_SHELTER_D / 2, h: BUS_SHELTER_H })),
      ...(f.viaduct ? viaductCollision(f.viaduct).map((b) => ({ ...b, ...yOpt(b.x, b.z) })) : []),
    ],
  };
}

/** 擠出一棟建築(代碼、配色、相接轉角;廟宇加斜屋頂所以不做女兒牆),回傳屋頂面 */
export function extrudeBuilding(mb: MeshBuilder, bd: ChunkSrc['buildings'][number]) {
  mb.code = buildingCode(bd.id, bd.t, bd.s);
  return extrude(mb, bd.rings[0], bd.h, bd.col ?? buildingRgb(bd.id, bd.t), buildingRoofRgb(bd.t), bd.rings.slice(1), bd.sharp, bd.t !== KIND.Temple);
}

/** 生成一個格子的網格(提供 elevation 時啟用 3D DTM 地形起伏與全面貼地) */
export function buildChunk(
  c: ChunkSrc,
  withFurniture = true,
  elevation?: ElevationSampler,
  sunkHoles: readonly Pt[][] = [],
): ChunkMeshes {
  const road = hexToRgb(PALETTE.road);
  const sidewalk = hexToRgb(PALETTE.sidewalk);
  const water = hexToRgb(PALETTE.water);
  const areaRgb: Rgb[] = [hexToRgb(PALETTE.park), hexToRgb(PALETTE.pitch), water];
  const curb = hexToRgb(PALETTE.curb);
  const white = hexToRgb(PALETTE.markWhite);
  const yellow = hexToRgb(PALETTE.markYellow);

  const groundRoads: RoadPiece[] = [];
  const elevatedRoads: ElevatedRoadPiece[] = [];
  for (const r of c.roads) {
    if (r.elev && r.elev.some((y) => y > 0.05)) {
      elevatedRoads.push({
        osmId: r.osmId,
        pts: r.pts,
        elev: r.elev,
        width: r.width,
        lanes: r.lanes,
        oneway: r.oneway,
      });
    } else {
      groundRoads.push(r);
    }
  }

  const lineForGround = (pts: Pt[]) => (elevation ? subdivideLine2D(pts, 20) : pts);
  const g = new MeshBuilder();
  for (const a of c.areas) g.flatPolygon(a.ring, a.k === 2 ? Y_WATER : Y_AREA, areaRgb[a.k]);
  for (const w of c.waterways) addRibbon(g, lineForGround(w.pts), w.w, Y_WATER, water);
  for (const r of groundRoads) if (r.sidewalk > 0) addRibbon(g, lineForGround(r.pts), r.width + 2 * r.sidewalk, Y_SIDEWALK, sidewalk);
  // 路緣石:路面外側一圈淺色帶(只是顏色,沒有高度差;車子照樣能開上人行道)
  for (const r of groundRoads) for (const k of r.curbs) addRibbon(g, lineForGround(k), r.width + 2 * CURB_W, Y_CURB, curb);
  for (const r of groundRoads) addRibbon(g, lineForGround(r.pts), r.width, Y_ROAD, road);
  for (const j of c.street.junctions) g.flatPolygon(j, Y_ROAD, road);
  const quadStyle: [number, Rgb][] = [
    [Y_MARK, white],
    [Y_MEDIAN, curb],
    [Y_MEDIAN_TOP, hexToRgb(PALETTE.median)],
  ];
  const st = streetGeometry(c);
  for (const q of st.quads) g.flatPolygon(q.q, quadStyle[q.k][0], quadStyle[q.k][1]);
  for (const m of st.marks) addRibbon(g, lineForGround(m.pts), m.w, Y_MARK, m.c ? yellow : white, false);

  const groundArr = g.toArrays();
  if (elevation) drapeMeshArrays(groundArr, elevation);

  const deckMb = new MeshBuilder({ wall: true });
  const barrierMb = new MeshBuilder({ wall: true });
  if (elevatedRoads.length) {
    addElevatedRoads(deckMb, barrierMb, elevatedRoads, c.elevatedContext ?? elevatedRoads, groundRoads);
  }
  const roadDeckArr = deckMb.toArrays();
  const roadBarrierArr = barrierMb.toArrays();
  if (elevation) {
    if (roadDeckArr.index.length) drapeMeshArrays(roadDeckArr, elevation);
    if (roadBarrierArr.index.length) drapeMeshArrays(roadBarrierArr, elevation);
  }

  const b = new MeshBuilder({ wall: true });
  const props = new MeshBuilder({ wall: true });
  // 附加物不畫窗:代碼用「低矮建築」
  props.code = PLAIN_CODE;
  const propColors = { shed: PALETTE.roofShed.map(hexToRgb), tank: hexToRgb(PALETTE.roofTank) };
  for (const bd of c.buildings) {
    const bv0 = b.vertexCount;
    const pv0 = props.vertexCount;
    const roof = extrudeBuilding(b, bd);
    if (roof) addRoofProps(props, roof, bd.t, bd.h / FLOOR_HEIGHT, bd.id, { ...propColors, wall: buildingRgb(bd.id, bd.t), roof: buildingRoofRgb(bd.t) });
    if (elevation) {
      // 建築以形心地表高度為基準,牆腳向下延伸 3 m 裙腳(避免斜坡上出現底座懸空縫隙)
      const ctr = centroid(bd.rings[0]);
      const baseY = elevation.sampleY(ctr[0], ctr[1]);
      extendBuildingSkirt(b.pos, bv0, b.vertexCount, baseY, 3.0);
      shiftMeshRangeY(props.pos, pv0, props.vertexCount, baseY);
    }
  }
  const landmarkSolids = c.landmarks.map((lm) => {
    const l = new MeshBuilder({ wall: true });
    l.code = buildingCode(0, KIND.Commercial, false);
    // 下沉地標(秋紅谷):碰撞只是一圈欄杆高的擋牆,車子開不進碗裡;模型載入前也只顯示這麼高的平台
    const h = lm.sink ? SINK_RAIL_H : lm.h;
    for (const r of lm.rings) extrude(l, r.map(([px, pz]) => [px + lm.x, pz + lm.z] as Pt), h, buildingRgb(0, KIND.Commercial), buildingRoofRgb(KIND.Commercial), [], undefined, !lm.sink);
    if (elevation) {
      const baseY = elevation.sampleY(lm.x, lm.z);
      shiftMeshRangeY(l.pos, 0, l.vertexCount, baseY);
    }
    return l.toArrays();
  });
  const base: Omit<ChunkMeshes, 'furniture' | 'scooters' | 'props'> = {
    ground: groundArr,
    buildings: b.toArrays(),
    roofProps: props.toArrays(),
    landmarkSolids,
    roadDeck: roadDeckArr,
    roadBarrier: roadBarrierArr,
    ...(elevation && { terrain: buildChunkTerrain(c.rect, elevation, sunkHoles) }),
  };
  return { ...base, ...(withFurniture ? buildFurniture(c, elevation) : { furniture: new MeshBuilder({ wall: true }).toArrays(), scooters: new Float32Array(), props: new Float32Array() }) };
}

export type FurnitureMeshes = Pick<ChunkMeshes, 'furniture' | 'scooters' | 'props'>;

/**
 * 一格的街道傢俱網格與機車擺放。和 buildChunk 分開,串流時可以放到下一幀做(0015 §11.10:
 * 同一幀生成建築加傢俱,最重的格子在瀏覽器裡要 29 ms,接近 33 ms 的卡頓門檻)。
 */
/** 街道傢俱的顏色(調色盤 → RGB) */
export function furnitureColors(): FurnitureColors {
  return {
    crown: PALETTE.treeCrown.map(hexToRgb),
    trunk: hexToRgb(PALETTE.treeTrunk),
    pole: hexToRgb(PALETTE.pole),
    lampHead: hexToRgb(PALETTE.lampHead),
    signalBox: hexToRgb(PALETTE.signalBox),
    lamps: PALETTE.signalLamps.map(hexToRgb),
    speciesCrown: PALETTE.treeSpeciesCrown.map(hexToRgb),
    palmTrunk: hexToRgb(PALETTE.palmTrunk),
    signBoards: PALETTE.signBoards.map(hexToRgb),
    signText: hexToRgb(PALETTE.signText),
    signTextOnWhite: hexToRgb(PALETTE.signTextOnWhite),
    busBlue: hexToRgb(PALETTE.busBlue),
    busRoof: hexToRgb(PALETTE.busRoof),
    busGlass: hexToRgb(PALETTE.busGlass),
  };
}

export function buildFurniture(c: ChunkSrc, elevation?: ElevationSampler): FurnitureMeshes {
  const fm = new MeshBuilder({ wall: true });
  fm.code = PLAIN_CODE;
  const fc = furnitureColors();
  const tripo = propsMode() === 'tripo';
  const trees = furnitureShow.trees ? c.furniture.trees : [];
  const treeCodes = furnitureShow.trees ? c.furniture.treeKinds : [];
  // 樹不進這一格的網格:Tripo 模式用 GLB 樣板、程式生成模式用 5 種樹形樣板,都是 InstancedMesh(0044)
  for (const s of c.furniture.signs) addSign(fm, s.p, s.a, s.y0, s.y1, s.c, fc);
  for (const b of c.furniture.busStops) addBusStop(fm, b.p, b.a, b.shelter, fc);
  if (!tripo) for (const l of c.furniture.lights) addStreetLight(fm, l.p, l.a, fc);
  for (const s of c.furniture.signals) addSignal(fm, s.p, s.a, s.arm, fc);
  if (c.furniture.viaduct) addViaduct(fm, c.furniture.viaduct);
  const furnArr = fm.toArrays();
  if (elevation && furnArr.index.length) drapeMeshArrays(furnArr, elevation);
  return {
    furniture: furnArr,
    scooters: scooterPoses(furnitureShow.scooters ? c.furniture.scooters : [], PALETTE.scooterBody.length),
    props: tripo ? propPoses(trees, c.furniture.lights, PROP_TREE_SCALE, c.roads?.map((r) => r.pts), treeCodes) : genTreePoses(trees, treeCodes),
  };
}
