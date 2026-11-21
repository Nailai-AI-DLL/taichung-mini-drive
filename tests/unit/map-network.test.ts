// 地圖下載的網路容錯與版本檢查(2026-11-21 審查 H5、H6,decisions/0057)。
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fetchRetry, fetchWithTimeout, HttpError, retryBackoffMs } from '../../src/map/fetch-retry';
import { assertMapVersion, fetchWorld, MAP_FORMAT_VERSION } from '../../src/map/load';
import { splitWorldIntoTiles, tileKey, TileStreamer, type WorldTileJson } from '../../src/map/tiles';
import type { WorldJson } from '../../src/map/types';
import { decodeWorld } from '../../src/world/chunks';
import { mapFilePath, readMapJson } from '../helpers/load-map';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const status = (s: number) => ({ ok: false, status: s }) as Response;
const noSleep = { sleep: async () => {}, baseDelayMs: 0 };

describe('fetchRetry / fetchWithTimeout', () => {
  it('網路錯誤與 5xx 會重試,成功就回傳', async () => {
    let n = 0;
    const f = (async () => {
      n++;
      if (n === 1) throw new TypeError('network down');
      if (n === 2) return status(503);
      return ok({ a: 1 });
    }) as unknown as typeof fetch;
    const res = await fetchRetry(f, '/x', noSleep);
    expect(await res.json()).toEqual({ a: 1 });
    expect(n).toBe(3);
  });

  it('4xx 不重試,直接丟 HttpError', async () => {
    let n = 0;
    const f = (async () => (n++, status(404))) as unknown as typeof fetch;
    await expect(fetchRetry(f, '/x', noSleep)).rejects.toBeInstanceOf(HttpError);
    expect(n).toBe(1);
  });

  it('重試用完仍失敗就丟出最後的錯誤', async () => {
    let n = 0;
    const f = (async () => (n++, status(500))) as unknown as typeof fetch;
    await expect(fetchRetry(f, '/x', { ...noSleep, retries: 2 })).rejects.toThrow(/500/);
    expect(n).toBe(3);
  });

  it('退避等待時間每次加倍', async () => {
    const waits: number[] = [];
    const f = (async () => status(500)) as unknown as typeof fetch;
    await fetchRetry(f, '/x', { retries: 3, baseDelayMs: 100, sleep: async (ms) => void waits.push(ms) }).catch(() => {});
    expect(waits).toEqual([100, 200, 400]);
  });

  it('請求卡住超過逾時就中止', async () => {
    let aborted = false;
    const f = ((_u: string, init?: RequestInit) =>
      new Promise<Response>(() => init?.signal?.addEventListener('abort', () => (aborted = true)))) as unknown as typeof fetch;
    await expect(fetchWithTimeout(f, '/slow', 20)).rejects.toThrow(/逾時/);
    expect(aborted).toBe(true);
  });

  it('串流退避:2 s、4 s、8 s… 上限 60 s', () => {
    expect([1, 2, 3, 6, 20].map(retryBackoffMs)).toEqual([2000, 4000, 8000, 60000, 60000]);
  });
});

describe('TileStreamer 失敗重試(不再永久放棄)', () => {
  const fullJson = readMapJson<WorldJson>('m0', 'world.json');

  it('分區下載失敗後依退避時間重試,成功後套用', async () => {
    const { index, tiles } = splitWorldIntoTiles(fullJson);
    const world = decodeWorld(index);
    const first = [...tiles.values()][0]!;
    const key = tileKey(first.tx, first.tz);
    let calls = 0;
    world.tiles = {
      area: 'm0',
      tileSize: index.tileSize,
      available: new Set([key]),
      loaded: new Set(),
      fetchTile: async () => {
        calls++;
        if (calls <= 2) throw new TypeError('network down');
        return first;
      },
    };
    const streamer = new TileStreamer(world, {}, { loadRadius: 1e9, unloadRadius: 1e9 });
    let now = 0;
    streamer.clock = () => now;
    const flush = () => new Promise((r) => setTimeout(r, 0));

    streamer.update(0, 0);
    await flush();
    expect(calls).toBe(1);
    expect(streamer.failures.get(key)).toEqual({ count: 1, retryAt: 2000 });
    expect(world.tiles.available.has(key)).toBe(true);

    now = 1000; // 還沒到重試時間
    streamer.update(0, 0);
    await flush();
    expect(calls).toBe(1);

    now = 2000; // 第 2 次失敗 → 等 4 s
    streamer.update(0, 0);
    await flush();
    expect(calls).toBe(2);
    expect(streamer.failures.get(key)).toEqual({ count: 2, retryAt: 6000 });

    now = 6000; // 第 3 次成功,下一幀套用
    streamer.update(0, 0);
    await flush();
    const r = streamer.update(0, 0);
    expect(calls).toBe(3);
    expect(r.applied).toBe(true);
    expect(world.tiles.loaded.has(key)).toBe(true);
    expect(streamer.failures.has(key)).toBe(false);
  });

  it('404 的分區才永久放棄', async () => {
    const { index } = splitWorldIntoTiles(fullJson);
    const world = decodeWorld(index);
    world.tiles = {
      area: 'm0',
      tileSize: index.tileSize,
      available: new Set(['0_0']),
      loaded: new Set(),
      fetchTile: async () => {
        throw new HttpError(404, '/tiles/0_0.json');
      },
    };
    const streamer = new TileStreamer(world, {}, { loadRadius: 1e9, unloadRadius: 1e9 });
    streamer.update(0, 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(world.tiles.available.has('0_0')).toBe(false);
  });
});

describe('fetchWorld 網路容錯與版本檢查', () => {
  // 讀本機 range-a 地圖;failTile 決定哪些分區要失敗
  const localFetch = (failTile: (rel: string) => boolean, override: Record<string, unknown> = {}) =>
    (async (url: string) => {
      const rel = url.replace(/^\/map\/range-a\//, '');
      if (rel in override) return ok(override[rel]);
      if (rel.startsWith('tiles/') && failTile(rel)) throw new TypeError('network down');
      const p = mapFilePath('range-a', rel);
      if (!existsSync(p)) return status(404);
      return ok(readMapJson('range-a', rel));
    }) as unknown as typeof fetch;
  const base = { baseUrl: '/', envMapUrl: '', search: '', retry: noSleep };

  it('開場有分區失敗也照常進遊戲,失敗的分區留給串流重試', async () => {
    let i = 0;
    const world = await fetchWorld('range-a', { ...base, fetchFn: localFetch(() => i++ % 2 === 0) });
    const { available, loaded } = world.tiles!;
    expect(loaded.size).toBeGreaterThan(0);
    const missing = [...available].filter((k) => !loaded.has(k));
    expect(missing.length).toBeGreaterThan(0); // 失敗的仍在 available,之後可重試
  });

  it('index.json 網路失敗(重試後)給出清楚的錯誤,不退回下載 31 MB 的 world.json', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      if (url.endsWith('index.json')) throw new TypeError('network down');
      return status(404);
    }) as unknown as typeof fetch;
    await expect(fetchWorld('range-a', { ...base, fetchFn: f })).rejects.toThrow(/網路不穩/);
    expect(urls.filter((u) => u.endsWith('index.json'))).toHaveLength(3);
    expect(urls.some((u) => u.endsWith('world.json'))).toBe(false);
  });

  it('地圖格式版本不符時丟出錯誤並提示 map:pull', async () => {
    const idx = readMapJson<{ version: number }>('range-a', 'index.json');
    await expect(
      fetchWorld('range-a', { ...base, fetchFn: localFetch(() => false, { 'index.json': { ...idx, version: 99 } }) }),
    ).rejects.toThrow(/99.*map:pull/);
    expect(() => assertMapVersion({ version: MAP_FORMAT_VERSION }, 'x')).not.toThrow();
  });

  it('目前的 range-a 地圖格式與程式一致', () => {
    expect(readMapJson<{ version: number }>('range-a', 'index.json').version).toBe(MAP_FORMAT_VERSION);
    expect(readMapJson<WorldTileJson & { version?: number }>('m0', 'world.json').version).toBe(MAP_FORMAT_VERSION);
  });
});
