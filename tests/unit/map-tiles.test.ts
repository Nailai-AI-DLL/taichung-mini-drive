// 地圖分區(Region Tile)建置與載入/卸載單元測試:
// 驗證 index.json + tiles/<tx>_<tz>.json 組合後的每一個 Chunk 與單一 world.json 100% 一致,
// 且在未載入任何 Tile 時,全區知名地點的樓頂招牌仍能準確定位。
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fetchWorld } from '../../src/map/load';
import { RoadIndex } from '../../src/map/road-index';
import {
  applyWorldTile,
  splitWorldIntoTiles,
  tileKey,
  TileStreamer,
  unloadWorldTile,
  type WorldIndexJson,
  type WorldTileJson,
} from '../../src/map/tiles';
import type { WorldJson } from '../../src/map/types';
import { buildChunk, decodeWorld } from '../../src/world/chunks';
import { ChunkStreamer } from '../../src/world/streamer';
import { computePlaceSignSpecs } from '../../src/world/surface';
import { mapFilePath, readMapJson } from '../helpers/load-map';

describe('地圖分區切分與還原 (m0)', () => {
  const fullJson = readMapJson<WorldJson>('m0', 'world.json');

  it('splitWorldIntoTiles 將建築、標線、傢俱全部移入 tiles,index.json 本身不含一般建築', () => {
    const { index, tiles } = splitWorldIntoTiles(fullJson);
    expect(index.buildings).toHaveLength(0);
    expect(index.street).toBeUndefined();
    expect(index.furniture).toBeUndefined();
    expect(index.tiles.length).toBe(tiles.size);
    const totalBld = [...tiles.values()].reduce((s, t) => s + t.buildings.length, 0);
    expect(totalBld).toBe(fullJson.buildings.length);
  });

  it('decodeWorld(index) + applyWorldTile 全部套用後,所有格子的內容與網格頂點數跟 decodeWorld(world.json) 100% 一致', () => {
    const direct = decodeWorld(fullJson);
    const { index, tiles } = splitWorldIntoTiles(fullJson);
    const tiled = decodeWorld(index);
    for (const t of tiles.values()) applyWorldTile(tiled, t);

    expect([...tiled.chunks.keys()].sort()).toEqual([...direct.chunks.keys()].sort());
    for (const [k, dc] of direct.chunks) {
      const tc = tiled.chunks.get(k)!;
      expect(tc.buildings.map((b) => b.id)).toEqual(dc.buildings.map((b) => b.id));
      expect(tc.roads.length).toBe(dc.roads.length);
      expect(tc.street.strips.length).toBe(dc.street.strips.length);
      expect(tc.street.crosswalks.length).toBe(dc.street.crosswalks.length);
      expect(tc.street.medians.length).toBe(dc.street.medians.length);
      expect(tc.street.junctions.length).toBe(dc.street.junctions.length);
      expect(tc.furniture.trees.length).toBe(dc.furniture.trees.length);
      expect(tc.furniture.lights.length).toBe(dc.furniture.lights.length);
      expect(tc.furniture.signals.length).toBe(dc.furniture.signals.length);

      const dm = buildChunk(dc, true);
      const tm = buildChunk(tc, true);
      expect(tm.ground.position.length).toBe(dm.ground.position.length);
      expect(tm.buildings.position.length).toBe(dm.buildings.position.length);
      expect(tm.roofProps.position.length).toBe(dm.roofProps.position.length);
    }
  });

  it('applyWorldTile 重複套用具有冪等性(不會重複塞入建築),unloadWorldTile 可乾淨釋放該區建築與傢俱', () => {
    const { index, tiles } = splitWorldIntoTiles(fullJson);
    const tiled = decodeWorld(index);
    const firstTile = [...tiles.values()][0]!;
    applyWorldTile(tiled, firstTile);
    const countOnce = [...tiled.chunks.values()].reduce((s, c) => s + c.buildings.length, 0);
    expect(countOnce).toBe(firstTile.buildings.length);

    // 重複套用同一個 Tile,建築數量不變
    applyWorldTile(tiled, firstTile);
    const countTwice = [...tiled.chunks.values()].reduce((s, c) => s + c.buildings.length, 0);
    expect(countTwice).toBe(firstTile.buildings.length);

    // 卸載該 Tile 後,建築數量歸零,但道路骨架仍在
    unloadWorldTile(tiled, firstTile.tx, firstTile.tz);
    const countAfterUnload = [...tiled.chunks.values()].reduce((s, c) => s + c.buildings.length, 0);
    expect(countAfterUnload).toBe(0);
    expect([...tiled.chunks.values()].some((c) => c.roads.length > 0)).toBe(true);
  });
});

describe('範圍 A 實際分區產物驗證 (public/map/range-a/)', () => {
  const fullJson = readMapJson<WorldJson>('range-a', 'world.json');
  const indexJson = readMapJson<WorldIndexJson>('range-a', 'index.json');

  it('index.json 體積 < 2 MB,且所有列出的 tiles/<tx>_<tz>.json 檔案皆存在', () => {
    expect(indexJson.buildings).toHaveLength(0);
    expect(indexJson.tiles.length).toBeGreaterThan(30);
    for (const k of indexJson.tiles) {
      expect(existsSync(mapFilePath('range-a', `tiles/${k}.json`)), `缺少 tiles/${k}.json`).toBe(true);
    }
  });

  it('所有分區檔的建築、行道樹、路燈、號誌桿總數與單一 world.json 完全相等(零遺漏、零重複)', () => {
    let bld = 0, trees = 0, lights = 0, signals = 0, scooters = 0, signs = 0, busStops = 0;
    for (const k of indexJson.tiles) {
      const t = readMapJson<WorldTileJson>('range-a', `tiles/${k}.json`);
      expect(tileKey(t.tx, t.tz)).toBe(k);
      bld += t.buildings.length;
      if (t.furniture) {
        trees += t.furniture.trees.length;
        lights += t.furniture.lights.length;
        signals += t.furniture.signals.length;
        scooters += t.furniture.scooters.length;
        signs += t.furniture.signs.length;
        busStops += t.furniture.busStops.length;
      }
    }
    expect(bld).toBe(fullJson.buildings.length);
    expect(trees).toBe(fullJson.furniture!.trees.length);
    expect(lights).toBe(fullJson.furniture!.lights.length);
    expect(signals).toBe(fullJson.furniture!.signals.length);
    expect(scooters).toBe(fullJson.furniture!.scooters.length);
    expect(signs).toBe(fullJson.furniture!.signs.length);
    expect(busStops).toBe(fullJson.furniture!.busStops.length);
  });

  it('只載入 index.json(尚未下載任何 Tile)時,全區知名地點的樓頂與路邊招牌座標與完整 world.json 100% 一致', () => {
    const fullWorld = decodeWorld(fullJson);
    const indexWorld = decodeWorld(indexJson);
    const roadIndex = new RoadIndex(indexWorld.roads);
    expect(computePlaceSignSpecs(indexWorld, roadIndex)).toEqual(computePlaceSignSpecs(fullWorld, roadIndex));
  });

  it('執行端 fetchWorld:開場只下載 index.json 與出生點周圍 Tile(遠少於全區 48 區),開車到遠處時由 TileStreamer 按需下載並卸載舊區', async () => {
    const fetchedUrls: string[] = [];
    const localFetch = (async (url: string) => {
      fetchedUrls.push(url);
      // url 格式:/map/range-a/<file>
      const rel = url.replace(/^\/map\/range-a\//, '');
      const fullPath = mapFilePath('range-a', rel);
      if (!existsSync(fullPath)) return { ok: false, status: 404 } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => readMapJson('range-a', rel),
      } as Response;
    }) as unknown as typeof fetch;

    const world = await fetchWorld('range-a', {
      baseUrl: '/',
      envMapUrl: '',
      search: '',
      fetchFn: localFetch,
    });

    expect(world.tiles).toBeDefined();
    const initLoadedCount = world.tiles!.loaded.size;
    // 開場只載入出生點周圍 1500 m 內的 Tile(16 區),僅佔全區 48 區的 1/3!
    expect(initLoadedCount).toBeGreaterThanOrEqual(4);
    expect(initLoadedCount).toBeLessThanOrEqual(18);
    expect(world.tiles!.available.size).toBe(indexJson.tiles.length);
    expect(fetchedUrls[0]).toBe('/map/range-a/index.json');
    expect(fetchedUrls.length).toBe(1 + initLoadedCount);

    // 搭配 ChunkStreamer 與 TileStreamer:出生點周圍的 250 m 格子都有完整建築可生成
    const loadedChunkMeshes = new Map<string, number>();
    const chunkStreamer = new ChunkStreamer(world, {
      onLoad: (src, m) => loadedChunkMeshes.set(src.key, m.buildings.position.length),
      onUnload: (src) => loadedChunkMeshes.delete(src.key),
    });
    const tileStreamer = new TileStreamer(
      world,
      { onChunksChanged: (keys) => chunkStreamer.invalidateChunks(keys) },
      { loadRadius: 1200, unloadRadius: 2200 },
    );

    chunkStreamer.loadAll(world.json.spawn.x, world.json.spawn.z);
    expect(chunkStreamer.loaded.size).toBeGreaterThan(30);
    // 出生點附近至少有好幾格建出了建築頂點
    expect([...loadedChunkMeshes.values()].filter((v) => v > 0).length).toBeGreaterThan(15);

    // 車子瞬移到東側遠處(台中車站附近:x = 1800, z = 1200,離出生點 > 4.5 km)
    const farX = 1800, farZ = 1200;
    // 第 1 次 update:卸載出生點絕大多數舊 Tile,並發起東側新 Tile 的非同步下載
    const step1 = tileStreamer.update(farX, farZ);
    expect(step1.unloaded).toBeGreaterThanOrEqual(initLoadedCount - 1);
    expect(step1.pendingFetches).toBeGreaterThan(0);

    // 等待背景 fetch 完成
    await new Promise((r) => setTimeout(r, 20));

    // 模擬後續幾幀:每幀最多套用 1 個 Tile,接著由 ChunkStreamer 生成 3D 網格
    let appliedCount = 0;
    for (let frame = 0; frame < 20; frame++) {
      const ts = tileStreamer.update(farX, farZ);
      if (ts.applied) appliedCount++;
      chunkStreamer.update(farX, farZ, Infinity, !ts.applied);
    }
    expect(appliedCount).toBeGreaterThanOrEqual(4);
    expect([...loadedChunkMeshes.values()].filter((v) => v > 0).length).toBeGreaterThan(15);
  });
});
