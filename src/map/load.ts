// 瀏覽器端與雲端載入地圖(優先載入輕量骨架 index.json + 出生點附近分區 Tile;若無 index.json 或設 ?tiles=off 則退回載入單一 world.json)。
// 支援三種來源優先序:網址參數 ?mapUrl= → 環境變數 VITE_MAP_URL(Cloudflare R2 等外部雲端)→ 同站 ${BASE_URL}map(GitHub Pages / 本機)。
import type { WorldJson } from './types';
import {
  applyWorldTile,
  DEFAULT_TILE_SIZE,
  distToTile,
  parseTileKey,
  tileKey,
  type WorldIndexJson,
  type WorldTileJson,
} from './tiles';
import { decodeWorld, type World } from '../world/chunks';
import { GridElevationSampler, type ElevationSampler } from '../world/surface';

export interface WorldElevationJson {
  minX: number;
  minZ: number;
  step: number;
  cols: number;
  rows: number;
  datum?: number;
  quant?: number;
  heights: number[];
}

/** 選用載入 DTM 地形高程網格(elevation.json);檔案不存在或設 ?terrain=off 時回傳 undefined(退回平面模式) */
export async function fetchElevation(
  area: string,
  opts: MapUrlOptions & { fetchFn?: typeof fetch } = {},
): Promise<ElevationSampler | undefined> {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  if (new URLSearchParams(search).get('terrain') === 'off') return undefined;
  const doFetch = opts.fetchFn ?? fetch;
  const url = mapAssetUrl(area, 'elevation.json', opts);
  try {
    const res = await doFetch(url);
    if (!res.ok) return undefined;
    const raw = (await res.json()) as WorldElevationJson;
    if (!Array.isArray(raw.heights) || raw.cols < 2 || raw.rows < 2) return undefined;
    const q = raw.quant ?? 1;
    const heights = new Float32Array(raw.heights.length);
    for (let i = 0; i < raw.heights.length; i++) heights[i] = raw.heights[i] / q;
    return new GridElevationSampler({
      minX: raw.minX,
      minZ: raw.minZ,
      step: raw.step,
      cols: raw.cols,
      rows: raw.rows,
      heights,
    });
  } catch {
    return undefined;
  }
}

export interface MapUrlOptions {
  /** 網址查詢字串(預設讀 location.search) */
  search?: string;
  /** 建置期雲端地圖網址(預設讀 import.meta.env.VITE_MAP_URL) */
  envMapUrl?: string;
  /** 網站基底路徑(預設讀 import.meta.env.BASE_URL) */
  baseUrl?: string;
}

export interface FetchWorldOptions extends MapUrlOptions {
  /** 載入狀態回報(給開場畫面顯示) */
  onStatus?: (text: string) => void;
  /** 自訂 fetch(單元測試注入用) */
  fetchFn?: typeof fetch;
  /** 開場預先載入出生點周圍多大範圍(公尺)內的分區 Tile(預設 900 m,涵蓋 ChunkStreamer 的 800 m 生成半徑) */
  initialTileRadius?: number;
  /** 是否啟用分區按需載入(預設為 true;網址帶 ?tiles=off 時為 false) */
  tiled?: boolean;
}

/** 解析地圖資料的基底網址(不含結尾斜線) */
export function resolveMapBaseUrl(opts: MapUrlOptions = {}): string {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const fromQuery = new URLSearchParams(search).get('mapUrl')?.trim();
  if (fromQuery) return fromQuery.replace(/\/+$/, '');
  const envUrl = (opts.envMapUrl ?? (import.meta.env?.VITE_MAP_URL as string | undefined))?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const base = opts.baseUrl ?? import.meta.env?.BASE_URL ?? '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}map`;
}

/** 組合指定區域的地圖資源網址(例如 world.json、skyline.json) */
export function mapAssetUrl(area: string, file = 'world.json', opts: MapUrlOptions = {}): string {
  const cleanFile = file.replace(/^\/+/, '');
  return `${resolveMapBaseUrl(opts)}/${encodeURIComponent(area)}/${cleanFile}`;
}

/** 組合未來大範圍分區(Region Tile)的雲端網址 */
export function regionTileUrl(area: string, rx: number, rz: number, opts: MapUrlOptions = {}): string {
  return mapAssetUrl(area, `tiles/${rx}_${rz}.json`, opts);
}

export async function fetchWorld(area: string, opts: FetchWorldOptions = {}): Promise<World> {
  opts.onStatus?.('下載地圖資料…');
  const doFetch = opts.fetchFn ?? fetch;
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const useTiles = opts.tiled ?? new URLSearchParams(search).get('tiles') !== 'off';

  if (useTiles) {
    const [indexRes, elevation] = await Promise.all([
      doFetch(mapAssetUrl(area, 'index.json', opts)).catch(() => null),
      fetchElevation(area, opts),
    ]);
    if (indexRes?.ok) {
      const indexJson = (await indexRes.json()) as WorldIndexJson;
      if (Array.isArray(indexJson.tiles)) {
        const tileSize = indexJson.tileSize ?? DEFAULT_TILE_SIZE;
        const available = new Set(indexJson.tiles);
        const loaded = new Set<string>();
        const fetchTile = async (tx: number, tz: number): Promise<WorldTileJson> => {
          const u = regionTileUrl(area, tx, tz, opts);
          const r = await doFetch(u);
          if (!r.ok) throw new Error(`分區載入失敗 (${r.status}): ${u}`);
          return (await r.json()) as WorldTileJson;
        };

        const world = decodeWorld(indexJson);
        world.elevation = elevation;
        world.tiles = { area, tileSize, available, loaded, fetchTile };

        const initRadius = opts.initialTileRadius ?? 1500;
        const sp = indexJson.spawn;
        const initialKeys = indexJson.tiles.filter((k) => {
          const [tx, tz] = parseTileKey(k);
          return distToTile(tx, tz, sp.x, sp.z, tileSize) <= initRadius;
        });

        if (initialKeys.length > 0) {
          opts.onStatus?.(`載入出生點周圍街區 (${initialKeys.length} 區)…`);
          const initialTiles = await Promise.all(
            initialKeys.map((k) => {
              const [tx, tz] = parseTileKey(k);
              return fetchTile(tx, tz);
            }),
          );
          for (const t of initialTiles) {
            applyWorldTile(world, t, tileSize);
            loaded.add(tileKey(t.tx, t.tz));
          }
        }
        return world;
      }
    }
  }

  const url = mapAssetUrl(area, 'world.json', opts);
  const [res, elevation] = await Promise.all([doFetch(url), fetchElevation(area, opts)]);
  if (!res.ok) throw new Error(`地圖載入失敗 (${res.status}): ${url}`);
  opts.onStatus?.('解析地圖資料…');
  const json = (await res.json()) as WorldJson;
  const world = decodeWorld(json);
  world.elevation = elevation;
  return world;
}
