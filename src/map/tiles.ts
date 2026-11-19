// 地圖分區(Region Tile)切分與動態載入/卸載:
// 將佔 world.json 93% 體積的「建築、街道標線、街道傢俱」按 1 km × 1 km(預設 4 × 4 個 250 m Chunk)切為獨立 Tile,
// 開場只需載入輕量的全區骨架(index.json)與出生點附近 Tile,其餘隨車子移動按需下載與釋放。
import type { BuildingKind } from '../config/buildings';
import {
  chunkKey,
  placeWallRgb,
  sharpFlags,
  type ChunkSrc,
  type World,
} from '../world/chunks';
import { centroid, type Pt, type Rect } from '../world/gen/geom';
import {
  QUANT,
  type WorldBuilding,
  type WorldFurniture,
  type WorldJson,
  type WorldStreet,
} from './types';

/** 預設每個分區(Region Tile)邊長 1000 m(= 4 × 4 個 250 m Chunk) */
export const DEFAULT_TILE_SIZE = 1000;

export const tileKey = (tx: number, tz: number) => `${tx}_${tz}`;

export function parseTileKey(key: string): [number, number] {
  const [tx, tz] = key.split('_').map(Number);
  return [tx, tz];
}

/** 點 (x, z) 到分區 Tile (tx, tz) 矩形邊界的最近距離(公尺;在矩形內為 0) */
export function distToTile(tx: number, tz: number, x: number, z: number, tileSize = DEFAULT_TILE_SIZE): number {
  const minX = tx * tileSize, maxX = (tx + 1) * tileSize;
  const minZ = tz * tileSize, maxZ = (tz + 1) * tileSize;
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

/** 250 m Chunk (cx, cz) 所屬的 1 km Tile 鍵值 */
export function chunkTileKey(cx: number, cz: number, chunkSize = 250, tileSize = DEFAULT_TILE_SIZE): string {
  const k = Math.max(1, Math.round(tileSize / chunkSize));
  return tileKey(Math.floor(cx / k), Math.floor(cz / k));
}

/** 掛在 World.tiles 上的分區按需載入狀態 */
export interface WorldTileCatalog {
  area: string;
  tileSize: number;
  /** index.json 列出的所有有效 Tile 鍵值 */
  available: Set<string>;
  /** 目前已套用進 world.chunks 的 Tile 鍵值 */
  loaded: Set<string>;
  /** 下載單一 Tile 的非同步函式 */
  fetchTile: (tx: number, tz: number) => Promise<WorldTileJson>;
}

/** 全區輕量骨架(index.json):含道路、水系、綠地、地標、高架捷運、知名地點與有效分區清單,不含一般建築/標線/傢俱 */
export interface WorldIndexJson extends WorldJson {
  tileSize: number;
  /** 有內容的 Tile 鍵值清單(格式 `${tx}_${tz}`) */
  tiles: string[];
}

/** 單一分區檔(tiles/<tx>_<tz>.json)的資料結構 */
export interface WorldTileJson {
  tx: number;
  tz: number;
  buildings: WorldBuilding[];
  street?: WorldStreet;
  furniture?: WorldFurniture;
}

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

function isChunkEmpty(c: ChunkSrc): boolean {
  return (
    !c.roads.length &&
    !c.waterways.length &&
    !c.areas.length &&
    !c.buildings.length &&
    !c.landmarks.length &&
    !c.street.strips.length &&
    !c.street.crosswalks.length &&
    !c.street.medians.length &&
    !c.street.junctions.length &&
    !c.furniture.trees.length &&
    !c.furniture.lights.length &&
    !c.furniture.signals.length &&
    !c.furniture.scooters.length &&
    !c.furniture.signs.length &&
    !c.furniture.busStops.length &&
    !c.furniture.viaduct
  );
}

/**
 * 建置端使用:將完整的 WorldJson 拆分為輕量骨架 index.json 與 1 km × 1 km 的分區 Map。
 * 保證「decodeWorld(index) + 全部 applyWorldTile」的結果與「decodeWorld(worldJson)」100% 一致。
 */
export function splitWorldIntoTiles(
  json: WorldJson,
  tileSize = DEFAULT_TILE_SIZE,
): { index: WorldIndexJson; tiles: Map<string, WorldTileJson> } {
  const chunkSize = json.meta.chunkSize;
  const k = Math.max(1, Math.round(tileSize / chunkSize));
  const tiles = new Map<string, WorldTileJson>();

  const getTile = (tx: number, tz: number): WorldTileJson => {
    const key = tileKey(tx, tz);
    let t = tiles.get(key);
    if (!t) {
      t = { tx, tz, buildings: [] };
      tiles.set(key, t);
    }
    return t;
  };
  const tileAtPt = (p: Pt): WorldTileJson => {
    const cx = Math.floor(p[0] / chunkSize);
    const cz = Math.floor(p[1] / chunkSize);
    return getTile(Math.floor(cx / k), Math.floor(cz / k));
  };
  const eachTileForBox = (pts: Pt[], pad: number, fn: (t: WorldTileJson) => void) => {
    const b = bbox(pts);
    const tx0 = Math.floor(Math.floor((b.minX - pad) / chunkSize) / k);
    const tx1 = Math.floor(Math.floor((b.maxX + pad) / chunkSize) / k);
    const tz0 = Math.floor(Math.floor((b.minZ - pad) / chunkSize) / k);
    const tz1 = Math.floor(Math.floor((b.maxZ + pad) / chunkSize) / k);
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let tz = tz0; tz <= tz1; tz++) fn(getTile(tx, tz));
    }
  };

  // 1. 建築(依外環形心所在 Chunk 歸入對應 Tile)
  const buildingById = new Map<number, WorldBuilding>();
  for (const b of json.buildings) {
    buildingById.set(b.id, b);
    const outer = toPts(b.rings[0]);
    tileAtPt(centroid(outer)).buildings.push(b);
  }

  // 2. 街道細節(標線、枕木紋、分隔島、路口鋪面)
  if (json.street) {
    const ensureStreet = (t: WorldTileJson): WorldStreet =>
      (t.street ??= { strips: [], crosswalks: [], medians: [], junctions: [] });
    for (const j of json.street.junctions ?? []) {
      const ring = toPts(j);
      ensureStreet(tileAtPt(centroid(ring))).junctions!.push(j);
    }
    for (const s of json.street.strips) {
      const line = toPts(s.pts);
      const pad = Math.max(...s.m.map((m) => Math.abs(m.o))) / 100 + 1;
      eachTileForBox(line, pad, (t) => ensureStreet(t).strips.push(s));
    }
    for (const cw of json.street.crosswalks) {
      ensureStreet(tileAtPt([cw.p[0] / QUANT, cw.p[1] / QUANT])).crosswalks.push(cw);
    }
    for (const md of json.street.medians) {
      const line = toPts(md.pts);
      const pad = Math.max(...md.ws) / 20 + 1;
      eachTileForBox(line, pad, (t) => ensureStreet(t).medians.push(md));
    }
  }

  // 3. 街道傢俱(行道樹、招牌、公車站、路燈、號誌、機車排)
  if (json.furniture) {
    const fu = json.furniture;
    const ensureFurn = (t: WorldTileJson): WorldFurniture =>
      (t.furniture ??= { trees: [], lights: [], signals: [], scooters: [], signs: [], busStops: [] });
    const splitFlat = (
      arr: number[] | undefined,
      stride: number,
      pick: (f: WorldFurniture) => number[],
    ) => {
      if (!arr) return;
      for (let i = 0; i + stride - 1 < arr.length; i += stride) {
        const p: Pt = [arr[i] / QUANT, arr[i + 1] / QUANT];
        const dst = pick(ensureFurn(tileAtPt(p)));
        for (let j = 0; j < stride; j++) dst.push(arr[i + j]);
      }
    };
    splitFlat(fu.trees, 3, (f) => f.trees);
    splitFlat(fu.signs, 6, (f) => f.signs);
    splitFlat(fu.busStops, 4, (f) => f.busStops);
    splitFlat(fu.lights, 3, (f) => f.lights);
    splitFlat(fu.signals, 4, (f) => f.signals);
    splitFlat(fu.scooters, 5, (f) => f.scooters);
  }

  // 移除空的 Tile,並排序鍵值
  for (const [k, t] of tiles) {
    const hasSt = t.street && (t.street.strips.length || t.street.crosswalks.length || t.street.medians.length || (t.street.junctions?.length ?? 0));
    const hasFu = t.furniture && (t.furniture.trees.length || t.furniture.lights.length || t.furniture.signals.length || t.furniture.scooters.length || t.furniture.signs.length || t.furniture.busStops.length);
    if (!t.buildings.length && !hasSt && !hasFu) tiles.delete(k);
  }
  const sortedKeys = [...tiles.keys()].sort((a, b) => {
    const [ax, az] = parseTileKey(a);
    const [bx, bz] = parseTileKey(b);
    return ax - bx || az - bz;
  });

  // 知名地點若有綁建築 id,在 index.json 附上該建築外環 ring,確保未載入該區 Tile 時也能定位樓頂招牌
  const places = json.places?.map((pl) => {
    if (pl.b !== undefined && !pl.ring) {
      const b = buildingById.get(pl.b);
      if (b) return { ...pl, ring: b.rings[0] };
    }
    return pl;
  });

  const { street: _st, furniture: _fu, ...rest } = json;
  const index: WorldIndexJson = {
    ...rest,
    buildings: [],
    ...(places && { places }),
    tileSize,
    tiles: sortedKeys,
  };

  return { index, tiles };
}

/**
 * 執行端使用:將單一分區 Tile 的建築、街道標線與傢俱填入 world.chunks 中該 Tile 所屬的 4×4 個 Chunk。
 * 回傳此 Tile 影響到的 chunkKey 清單。
 */
export function applyWorldTile(world: World, tile: WorldTileJson, tileSize = DEFAULT_TILE_SIZE): string[] {
  const size = world.chunkSize;
  const k = Math.max(1, Math.round(tileSize / size));
  const cx0 = tile.tx * k, cx1 = cx0 + k - 1;
  const cz0 = tile.tz * k, cz1 = cz0 + k - 1;

  // 先清除該 Tile 範圍內既有的 Tile 層資料(保留 index.json 的道路、綠地、水系、地標、高架捷運),確保重複套用時冪等
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const c = world.chunks.get(chunkKey(cx, cz));
      if (!c) continue;
      c.buildings = [];
      c.street = { junctions: [], strips: [], crosswalks: [], medians: [] };
      const viaduct = c.furniture.viaduct;
      c.furniture = {
        trees: [],
        treeKinds: [],
        lights: [],
        signals: [],
        scooters: [],
        signs: [],
        busStops: [],
        ...(viaduct && { viaduct }),
      };
    }
  }

  const get = (cx: number, cz: number): ChunkSrc => {
    const key = chunkKey(cx, cz);
    let c = world.chunks.get(key);
    if (!c) {
      const rect = { minX: cx * size, minZ: cz * size, maxX: (cx + 1) * size, maxZ: (cz + 1) * size };
      c = {
        key,
        cx,
        cz,
        rect,
        roads: [],
        waterways: [],
        areas: [],
        buildings: [],
        street: { junctions: [], strips: [], crosswalks: [], medians: [] },
        landmarks: [],
        furniture: { trees: [], treeKinds: [], lights: [], signals: [], scooters: [], signs: [], busStops: [] },
      };
      world.chunks.set(key, c);
    }
    return c;
  };

  const inTileChunk = (cx: number, cz: number) => cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1;
  const atInTile = (p: Pt): ChunkSrc | null => {
    const cx = Math.floor(p[0] / size);
    const cz = Math.floor(p[1] / size);
    return inTileChunk(cx, cz) ? get(cx, cz) : null;
  };
  const eachInTile = (pts: Pt[], pad: number, fn: (c: ChunkSrc) => void) => {
    const b = bbox(pts);
    const x0 = Math.max(cx0, Math.floor((b.minX - pad) / size));
    const x1 = Math.min(cx1, Math.floor((b.maxX + pad) / size));
    const z0 = Math.max(cz0, Math.floor((b.minZ - pad) / size));
    const z1 = Math.min(cz1, Math.floor((b.maxZ + pad) / size));
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) fn(get(cx, cz));
    }
  };

  for (const b of tile.buildings) {
    const rings = b.rings.map(toPts);
    const c = atInTile(centroid(rings[0]));
    if (!c) continue;
    c.buildings.push({
      id: b.id,
      h: b.h / 10,
      t: b.t as BuildingKind,
      s: b.s === 1,
      rings,
      ...(b.c && { sharp: sharpFlags(rings[0].length, b.c) }),
      ...(b.k && { col: placeWallRgb(b.k) }),
    });
  }

  if (tile.street) {
    const st = tile.street;
    for (const j of st.junctions ?? []) {
      const ring = toPts(j);
      atInTile(centroid(ring))?.street.junctions.push(ring);
    }
    for (const s of st.strips) {
      const item = { line: toPts(s.pts), m: s.m };
      const pad = Math.max(...s.m.map((m) => Math.abs(m.o))) / 100 + 1;
      eachInTile(item.line, pad, (c) => c.street.strips.push(item));
    }
    for (const cw of st.crosswalks) {
      atInTile([cw.p[0] / QUANT, cw.p[1] / QUANT])?.street.crosswalks.push(cw);
    }
    for (const md of st.medians) {
      const item = { line: toPts(md.pts), ws: md.ws };
      const pad = Math.max(...md.ws) / 20 + 1;
      eachInTile(item.line, pad, (c) => c.street.medians.push(item));
    }
  }

  if (tile.furniture) {
    const fu = tile.furniture;
    for (let i = 0; i + 2 < fu.trees.length; i += 3) {
      const p: Pt = [fu.trees[i] / QUANT, fu.trees[i + 1] / QUANT];
      const c = atInTile(p);
      if (c) {
        c.furniture.trees.push(p);
        c.furniture.treeKinds.push(fu.trees[i + 2]);
      }
    }
    for (let i = 0; i + 5 < (fu.signs ?? []).length; i += 6) {
      const p: Pt = [fu.signs[i] / QUANT, fu.signs[i + 1] / QUANT];
      atInTile(p)?.furniture.signs.push({
        p,
        a: fu.signs[i + 2] / 1000,
        y0: fu.signs[i + 3] / 10,
        y1: fu.signs[i + 4] / 10,
        c: fu.signs[i + 5],
      });
    }
    for (let i = 0; i + 3 < (fu.busStops ?? []).length; i += 4) {
      const p: Pt = [fu.busStops[i] / QUANT, fu.busStops[i + 1] / QUANT];
      atInTile(p)?.furniture.busStops.push({
        p,
        a: fu.busStops[i + 2] / 1000,
        shelter: fu.busStops[i + 3] === 1,
      });
    }
    for (let i = 0; i + 2 < fu.lights.length; i += 3) {
      const p: Pt = [fu.lights[i] / QUANT, fu.lights[i + 1] / QUANT];
      atInTile(p)?.furniture.lights.push({ p, a: fu.lights[i + 2] / 1000 });
    }
    for (let i = 0; i + 3 < fu.signals.length; i += 4) {
      const p: Pt = [fu.signals[i] / QUANT, fu.signals[i + 1] / QUANT];
      atInTile(p)?.furniture.signals.push({
        p,
        a: fu.signals[i + 2] / 1000,
        arm: fu.signals[i + 3] / 10,
      });
    }
    for (let i = 0; i + 4 < (fu.scooters ?? []).length; i += 5) {
      const p: Pt = [fu.scooters[i] / QUANT, fu.scooters[i + 1] / QUANT];
      atInTile(p)?.furniture.scooters.push({
        p,
        a: fu.scooters[i + 2] / 1000,
        n: fu.scooters[i + 3],
        f: fu.scooters[i + 4] / 1000,
      });
    }
  }

  const touched: string[] = [];
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const key = chunkKey(cx, cz);
      const c = world.chunks.get(key);
      if (!c) continue;
      if (isChunkEmpty(c)) world.chunks.delete(key);
      else touched.push(key);
    }
  }
  return touched;
}

/**
 * 執行端使用:卸載單一分區 Tile 的建築、街道標線與傢俱,釋放記憶體。
 * 回傳受影響的 chunkKey 清單。
 */
export function unloadWorldTile(world: World, tx: number, tz: number, tileSize = DEFAULT_TILE_SIZE): string[] {
  const size = world.chunkSize;
  const k = Math.max(1, Math.round(tileSize / size));
  const cx0 = tx * k, cx1 = cx0 + k - 1;
  const cz0 = tz * k, cz1 = cz0 + k - 1;
  const affected: string[] = [];
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const key = chunkKey(cx, cz);
      const c = world.chunks.get(key);
      if (!c) continue;
      affected.push(key);
      c.buildings = [];
      c.street = { junctions: [], strips: [], crosswalks: [], medians: [] };
      const viaduct = c.furniture.viaduct;
      c.furniture = {
        trees: [],
        treeKinds: [],
        lights: [],
        signals: [],
        scooters: [],
        signs: [],
        busStops: [],
        ...(viaduct && { viaduct }),
      };
      if (isChunkEmpty(c)) world.chunks.delete(key);
    }
  }
  return affected;
}

export interface TileStreamerOptions {
  /** 距離車子小於此半徑(公尺)的 Tile 觸發背景下載(預設 1200 m,比 Chunk 生成半徑 800 m 提早 400 m) */
  loadRadius: number;
  /** 距離車子大於此半徑(公尺)的 Tile 從記憶體卸載(預設 4500 m,避免在同區域內來回移動時反覆丟棄重抓與觸發 GC) */
  unloadRadius: number;
  /** 同時最多幾個 Tile 請求在飛(預設 6) */
  maxConcurrent: number;
}

export const DEFAULT_TILE_STREAMER: TileStreamerOptions = {
  loadRadius: 1200,
  unloadRadius: 4500,
  maxConcurrent: 6,
};

export interface TileStreamerHooks {
  /** 當某個 Tile 套用或卸載時,通知 ChunkStreamer 重新整理受影響的 250 m 格子 */
  onChunksChanged?: (chunkKeys: string[]) => void;
}

/**
 * 執行期分區按需下載與卸載調度器:
 * - 背景 fetch 進入 loadRadius 的 Tile,下載完成後放進 readyQueue;
 * - 每次 update 最多從 readyQueue 套用 1 個最接近玩家的 Tile(避免多個網路回應同時抵達時造成單幀卡頓);
 * - 自動卸載超過 unloadRadius 的 Tile 釋放記憶體。
 */
export class TileStreamer {
  readonly inFlight = new Set<string>();
  private readyQueue: WorldTileJson[] = [];
  readonly opts: TileStreamerOptions;

  constructor(
    private readonly world: World,
    private readonly hooks: TileStreamerHooks = {},
    opts: Partial<TileStreamerOptions> = {},
  ) {
    this.opts = { ...DEFAULT_TILE_STREAMER, ...opts };
  }

  /** 每幀呼叫:回傳本幀是否有套用新的 Tile(有的話 WorldChunkManager 可將網格生成讓到下一幀,避免耗時疊加) */
  update(x: number, z: number): { applied: boolean; unloaded: number; pendingFetches: number; queued: number } {
    const cat = this.world.tiles;
    if (!cat) return { applied: false, unloaded: 0, pendingFetches: 0, queued: 0 };

    const { tileSize } = cat;
    const { loadRadius, unloadRadius, maxConcurrent } = this.opts;

    // 1. 卸載太遠的 Tile
    let unloaded = 0;
    for (const key of [...cat.loaded]) {
      const [tx, tz] = parseTileKey(key);
      if (distToTile(tx, tz, x, z, tileSize) > unloadRadius) {
        cat.loaded.delete(key);
        const affected = unloadWorldTile(this.world, tx, tz, tileSize);
        this.hooks.onChunksChanged?.(affected);
        unloaded++;
      }
    }

    // 2. 從已完成下載的佇列中,挑離玩家最近的 1 個 Tile 套用進 world.chunks(每幀最多 1 個,分散 CPU 負擔)
    let applied = false;
    if (this.readyQueue.length > 0) {
      this.readyQueue.sort(
        (a, b) => distToTile(a.tx, a.tz, x, z, tileSize) - distToTile(b.tx, b.tz, x, z, tileSize),
      );
      while (this.readyQueue.length > 0) {
        const tile = this.readyQueue.shift()!;
        const key = tileKey(tile.tx, tile.tz);
        if (cat.loaded.has(key)) continue;
        if (distToTile(tile.tx, tile.tz, x, z, tileSize) > unloadRadius) continue;
        const touched = applyWorldTile(this.world, tile, tileSize);
        cat.loaded.add(key);
        this.hooks.onChunksChanged?.(touched);
        applied = true;
        break;
      }
    }

    // 3. 找出進入 loadRadius 但尚未載入也未在下載中的 Tile,由近到遠發起背景下載
    if (this.inFlight.size < maxConcurrent) {
      const queuedKeys = new Set(this.readyQueue.map((t) => tileKey(t.tx, t.tz)));
      const missing: [number, string, number, number][] = [];
      for (const key of cat.available) {
        if (cat.loaded.has(key) || this.inFlight.has(key) || queuedKeys.has(key)) continue;
        const [tx, tz] = parseTileKey(key);
        const d = distToTile(tx, tz, x, z, tileSize);
        if (d <= loadRadius) missing.push([d, key, tx, tz]);
      }
      missing.sort((a, b) => a[0] - b[0]);
      for (const [, key, tx, tz] of missing) {
        if (this.inFlight.size >= maxConcurrent) break;
        this.inFlight.add(key);
        cat
          .fetchTile(tx, tz)
          .then((tile) => {
            this.inFlight.delete(key);
            this.readyQueue.push(tile);
          })
          .catch((err) => {
            console.warn(`分區 Tile ${key} 載入失敗,退回只顯示道路骨架`, err);
            this.inFlight.delete(key);
            cat.available.delete(key);
          });
      }
    }

    return {
      applied,
      unloaded,
      pendingFetches: this.inFlight.size,
      queued: this.readyQueue.length,
    };
  }
}
